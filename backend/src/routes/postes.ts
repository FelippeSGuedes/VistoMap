import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import {
  buscarBboxGeoJSON,
  buscarPorId,
  buscarPorPsposte,
  buscarProximos,
  distanciaGeografica,
  registrarMudanca,
} from "../lib/postes-repo.js";
import {
  MOTIVOS_MUDANCA,
  MOTIVO_LABEL,
  type MotivoMudanca,
} from "../models/poste.js";

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */

const Lat = z.coerce.number().gte(-90).lte(90);
const Lng = z.coerce.number().gte(-180).lte(180);

const ProximosQuery = z.object({
  lat: Lat,
  lng: Lng,
  raio: z.coerce.number().int().positive().max(50_000).default(500), // 50km max
  limit: z.coerce.number().int().positive().max(200).default(30),
  municipio: z.string().trim().max(120).optional(),
});

const BuscarPspostequery = z.object({
  psposte: z.string().trim().min(1).max(64),
  municipio: z.string().trim().max(120).optional(),
});

const BboxQuery = z.object({
  minLng: Lng,
  minLat: Lat,
  maxLng: Lng,
  maxLat: Lat,
  limit: z.coerce.number().int().positive().max(2000).default(500),
});

const IdParams = z.object({
  id: z.coerce.number().int().positive(),
});

const MotivoEnum = z.enum(MOTIVOS_MUDANCA);

const MudancaBody = z
  .object({
    vistoria_id: z.string().min(1).max(64),

    /** Lat/Lng do equipamento antigo (vem do GLPI / GPS do app no momento). */
    lat_antiga: Lat,
    lng_antiga: Lng,

    /** Identificação textual do antigo (apenas pra audit, opcional). */
    psposte_antigo: z.string().trim().max(64).nullable().optional(),
    municipio_antigo: z.string().trim().max(120).nullable().optional(),
    poste_id_antigo: z.coerce.number().int().positive().nullable().optional(),

    /** Poste escolhido no mapa. */
    poste_id_novo: z.coerce.number().int().positive(),

    motivo: MotivoEnum,
    observacao: z.string().trim().max(2000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.motivo === "OUTRO" && (!v.observacao || v.observacao.length < 4)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["observacao"],
        message: "Observação obrigatória quando motivo = OUTRO (mín. 4 chars).",
      });
    }
  });

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

/**
 * Monta o bloco de texto que será injetado no campo DESCRIÇÃO (observaofield)
 * do GLPI Fields. Formato fixo conforme spec do produto.
 */
function buildDescricaoMudanca(args: {
  psposteAntigo: string | null;
  municipioAntigo: string | null;
  psposteNovo: string;
  municipioNovo: string;
  motivo: MotivoMudanca;
  observacao: string | null;
}): string {
  const linhas = [
    "------MUDANÇA DE POSTE-------------",
    "",
    "Poste Antigo (Município + PSPOSTE):",
    `${args.psposteAntigo ?? "—"}`,
    `${args.municipioAntigo ?? "—"}`,
    "",
    "Para Poste Novo (Município + PSPOSTE):",
    args.psposteNovo,
    args.municipioNovo,
    "",
    `Motivo:`,
    MOTIVO_LABEL[args.motivo],
    "",
    `Observação:`,
    args.observacao ?? "—",
    "",
    "-----------------------------------",
  ];
  return linhas.join("\n");
}

/** yesno do GLPI é string "1"/"0" — ver UPDATABLE_COLUMNS no Next (aterramentofield é o mesmo padrão). */
function toYesNo(v: boolean | null): "1" | "0" | null {
  return v == null ? null : v ? "1" : "0";
}

/**
 * Regra confirmada em produção (2026-09-16): dos 4064 équipements com
 * Alimentação já preenchida, 100% seguem essa correlação com Rede
 * Secundária, zero exceção — por isso dá pra derivar em vez de perguntar
 * pro técnico.
 */
function derivarAlimentacao(temRedeSecundaria: boolean | null): "BT" | "MT" | null {
  return temRedeSecundaria == null ? null : temRedeSecundaria ? "BT" : "MT";
}

/**
 * Regra confirmada em produção (2026-09-16): sem Rede Secundária (MT), o
 * poste precisa de TP — dos équipements já preenchidos, 164/167 (MT) e
 * 4422/4423 (BT) já seguem essa correlação, as poucas exceções são
 * divergência de cadastro antiga, não contra-exemplo da regra física.
 */
function derivarInstalarTp(temRedeSecundaria: boolean | null): "1" | "0" | null {
  return temRedeSecundaria == null ? null : temRedeSecundaria ? "0" : "1";
}

/** Campos GLPI derivados do poste PostGIS — usado tanto em poste_novo quanto payload_glpi. */
function derivarCamposRedeGlpi(posteNovo: {
  tem_rede_primaria: boolean | null;
  tem_rede_secundaria: boolean | null;
  tem_transformador: boolean | null;
  tem_religador: boolean | null;
}) {
  return {
    redeprimriafield: toYesNo(posteNovo.tem_rede_primaria),
    redesecundriafield: toYesNo(posteNovo.tem_rede_secundaria),
    transformadorfield: toYesNo(posteNovo.tem_transformador),
    religadorfield: toYesNo(posteNovo.tem_religador),
    alimentacaodoequipamento: derivarAlimentacao(posteNovo.tem_rede_secundaria),
    instalartpfield: derivarInstalarTp(posteNovo.tem_rede_secundaria),
  };
}

/* ─── Routes ──────────────────────────────────────────────────────────────── */

const postesRoutes: FastifyPluginAsync = async (fastify) => {
  /*
   * GET /postes/proximos
   *   ?lat=-19.91&lng=-43.94&raio=500&limit=30&municipio=Belo+Horizonte
   *
   * Retorno: array ordenado por distância asc.
   */
  fastify.get(
    "/proximos",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          required: ["lat", "lng"],
        },
      },
    },
    async (req, reply) => {
      const parsed = ProximosQuery.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send(parsed.error.format());

      const items = await buscarProximos(parsed.data);
      return reply.send({
        origem: { lat: parsed.data.lat, lng: parsed.data.lng },
        raio_m: parsed.data.raio,
        total: items.length,
        items: items.map((p) => ({
          id: p.id,
          pspostefield: p.pspostefield,
          materialfield: p.materialfield,
          alturadopostemfield: p.alturadaantenafield,
          municipiofield: p.municipiofield,
          latitudefield: p.latitudefield,
          longitudefield: p.longitudefield,
          distancia_m: Math.round(p.distancia_m * 10) / 10,
          // Booleanos brutos — o picker offline (queueMudancaPoste em
          // services/postes.ts) precisa deles pra derivar os campos GLPI
          // sem round-trip ao servidor.
          tem_rede_secundaria: p.tem_rede_secundaria,
          tem_rede_primaria: p.tem_rede_primaria,
          tem_transformador: p.tem_transformador,
          tem_religador: p.tem_religador,
        })),
      });
    }
  );

  /*
   * GET /postes/buscar-psposte
   *   ?psposte=3299556&municipio=Campinas
   *
   * Busca exata por PSPOSTE, pra validar/preencher automaticamente ao
   * corrigir dados de vistoria (ver EditarVistoriaModal no Next) — evita
   * gravar um PSPOSTE que não existe no cadastro-mestre. `municipio`
   * (opcional) só prioriza o match daquela cidade, não filtra as outras —
   * às vezes é justo o município cadastrado que está errado.
   */
  fastify.get(
    "/buscar-psposte",
    {
      preHandler: [fastify.authenticate],
      schema: { querystring: { type: "object", required: ["psposte"] } },
    },
    async (req, reply) => {
      const parsed = BuscarPspostequery.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send(parsed.error.format());

      const postes = await buscarPorPsposte(parsed.data.psposte, parsed.data.municipio);
      return reply.send({
        total: postes.length,
        items: postes.map((p) => ({
          id: p.id,
          pspostefield: p.pspostefield,
          materialfield: p.materialfield,
          alturadopostemfield: p.alturadaantenafield,
          municipiofield: p.municipiofield,
          latitudefield: p.latitudefield,
          longitudefield: p.longitudefield,
          ...derivarCamposRedeGlpi(p),
        })),
      });
    }
  );

  /*
   * GET /postes/bbox
   *   ?minLng=-44&minLat=-20&maxLng=-43.9&maxLat=-19.9&limit=500
   *
   * Retorno: GeoJSON FeatureCollection pronto pra Mapbox circle-layer.
   */
  fastify.get(
    "/bbox",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          required: ["minLng", "minLat", "maxLng", "maxLat"],
        },
      },
    },
    async (req, reply) => {
      const parsed = BboxQuery.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send(parsed.error.format());

      const fc = await buscarBboxGeoJSON(parsed.data);
      reply.header("cache-control", "public, max-age=15");
      return reply.send(fc);
    }
  );

  /*
   * GET /postes/:id   — detalhe.
   */
  fastify.get(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const parsed = IdParams.safeParse(req.params);
      if (!parsed.success) return reply.code(400).send(parsed.error.format());

      const poste = await buscarPorId(parsed.data.id);
      if (!poste) return reply.code(404).send({ message: "Poste não encontrado" });
      return reply.send(poste);
    }
  );

  /*
   * POST /postes/mudancas
   *
   * Registra a mudança de PSPOSTE numa vistoria:
   *   1) valida JWT
   *   2) busca o poste novo (id) → coordenadas e nomes
   *   3) calcula distância geográfica entre (lat_antiga, lng_antiga) e o poste novo
   *   4) rejeita se distância > POSTE_TROCA_RAIO_M
   *   5) grava em `mudancas_postes` (audit imutável)
   *   6) retorna payload pronto para o Next chamar /api/vistorias/:id/finalizar
   *      (com a descrição da mudança a ser anexada em observaofield)
   */
  fastify.post(
    "/mudancas",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const parsed = MudancaBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(parsed.error.format());
      const data = parsed.data;

      const posteNovo = await buscarPorId(data.poste_id_novo);
      if (!posteNovo) {
        return reply.code(404).send({ message: "Poste novo não encontrado" });
      }

      const distanciaM = await distanciaGeografica(
        data.lng_antiga,
        data.lat_antiga,
        posteNovo.longitudefield,
        posteNovo.latitudefield
      );

      const raioMax = env.POSTE_TROCA_RAIO_M;
      if (distanciaM > raioMax) {
        return reply.code(422).send({
          message: `Distância (${distanciaM.toFixed(1)} m) excede o raio máximo de ${raioMax} m.`,
          distancia_m: Math.round(distanciaM * 10) / 10,
          raio_max_m: raioMax,
        });
      }

      const descricao = buildDescricaoMudanca({
        psposteAntigo: data.psposte_antigo ?? null,
        municipioAntigo: data.municipio_antigo ?? null,
        psposteNovo: posteNovo.pspostefield,
        municipioNovo: posteNovo.municipiofield,
        motivo: data.motivo,
        observacao: data.observacao ?? null,
      });

      const payloadGlpi = {
        vistoria_id: data.vistoria_id,
        pspostefield: posteNovo.pspostefield,
        municipiofield: posteNovo.municipiofield,
        materialfield: posteNovo.materialfield,
        alturadopostemfield: posteNovo.alturadaantenafield,
        latitudefield: posteNovo.latitudefield,
        longitudefield: posteNovo.longitudefield,
        ...derivarCamposRedeGlpi(posteNovo),
        // bloco a ser concatenado em observaofield (DESCRIÇÃO):
        observaofield_append: descricao,
      };

      const mudancaId = await registrarMudanca({
        vistoria_id: data.vistoria_id,
        psposte_antigo: data.psposte_antigo ?? null,
        municipio_antigo: data.municipio_antigo ?? null,
        poste_id_antigo: data.poste_id_antigo ?? null,
        poste_id_novo: data.poste_id_novo,
        usuario_id: req.user.sub,
        usuario_email: req.user.email ?? null,
        motivo: data.motivo,
        observacao: data.observacao ?? null,
        distancia_m: distanciaM,
        raio_max_m: raioMax,
        payload_glpi: payloadGlpi,
      });

      return reply.code(201).send({
        ok: true,
        mudanca_id: mudancaId,
        distancia_m: Math.round(distanciaM * 10) / 10,
        raio_max_m: raioMax,
        poste_novo: {
          id: posteNovo.id,
          pspostefield: posteNovo.pspostefield,
          municipiofield: posteNovo.municipiofield,
          materialfield: posteNovo.materialfield,
          alturadopostemfield: posteNovo.alturadaantenafield,
          latitudefield: posteNovo.latitudefield,
          longitudefield: posteNovo.longitudefield,
          ...derivarCamposRedeGlpi(posteNovo),
        },
        descricao_glpi: descricao,
        payload_glpi: payloadGlpi,
      });
    }
  );
};

export default postesRoutes;
