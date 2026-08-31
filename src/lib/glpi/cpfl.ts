/**
 * Acompanhamento da validação da CONCESSIONÁRIA (CPFL).
 *
 * Quem aprova/reprova é a própria CPFL, direto no GLPI — este módulo é
 * SOMENTE LEITURA por definição. Nenhuma função aqui escreve; se um dia
 * precisar escrever, o lugar certo é outro arquivo, para essa fronteira
 * continuar óbvia.
 *
 * O buraco que isso fecha: o fluxo terminava em "enviei pra CPFL" e nunca
 * mais voltava. Havia 308 vistorias paradas em "Em análise" sem nenhuma tela
 * que as acompanhasse, e nada que mostrasse há quanto tempo estavam lá.
 *
 * A etapa vem do dropdown `statusvistoria`, que é onde a decisão aparece de
 * fato na base (confirmado: as 3 aprovadas têm status 3 E data de aprovação
 * da concessionária preenchida — os dois conjuntos batem exatamente).
 *
 * Existe também um dropdown dedicado "Validação CPFL" (APROVADO/REJEITADO)
 * mais os campos de validador. Estão 100% vazios (0 de 4599 registros), então
 * NÃO servem como fonte da etapa — são lidos só como informação extra, para
 * o dia em que a CPFL começar a preenchê-los.
 */

import { query } from "@/lib/db";
import {
  ITEMTYPE_NE,
  STATUS_VISTORIA_APROVADO,
  STATUS_VISTORIA_EM_ANALISE,
  STATUS_VISTORIA_REPROVADO,
  TABLE_AUX,
  TABLE_FIELDS,
  TABLE_NE,
  TABLE_PENDENCIA,
  TABLE_USERS,
  TABLE_VALIDACAO_CPFL,
  VALIDADOR_CPFL_STATUS_COLUMN,
  VALIDADOR_CPFL_USER_COLUMN,
} from "./constants";
import { nomesDeUsuariosRemovidos } from "./usuariosRemovidos";

/** Etapa da vistoria no ciclo da concessionária. */
export type EtapaCPFL = "AGUARDANDO" | "APROVADA" | "REPROVADA";

const STATUS_POR_ETAPA: Record<EtapaCPFL, number> = {
  AGUARDANDO: STATUS_VISTORIA_EM_ANALISE,
  APROVADA: STATUS_VISTORIA_APROVADO,
  REPROVADA: STATUS_VISTORIA_REPROVADO,
};

function etapaDoStatus(statusId: number | null): EtapaCPFL {
  if (Number(statusId) === STATUS_VISTORIA_APROVADO) return "APROVADA";
  if (Number(statusId) === STATUS_VISTORIA_REPROVADO) return "REPROVADA";
  return "AGUARDANDO";
}

export interface VistoriaCPFL {
  id: number;
  glpiId: string;
  equipamento: string;
  municipio: string;
  endereco: string | null;
  etapa: EtapaCPFL;
  pendencia: string | null;
  tecnico: { id: number; nome: string } | null;
  /** Técnico que não existe mais em glpi_users (saiu da empresa). */
  tecnicoDesligado: boolean;
  dataVistoria: string | null;
  dataEnvio: string | null;
  dataAprovacao: string | null;
  /** Dias corridos desde o envio à concessionária. Só faz sentido em AGUARDANDO. */
  diasAguardando: number | null;
  motivo: string | null;
  pdfPath: string | null;
  /** Dropdown dedicado da CPFL — hoje sempre nulo, ver cabeçalho. */
  validacaoCpfl: string | null;
  validadorCpfl: string | null;
}

export interface CPFLStats {
  total: number;
  aguardando: number;
  aprovadas: number;
  reprovadas: number;
  /** Aguardando há mais de 30 dias — é o número que cobra ação. */
  aguardandoMais30d: number;
}

export interface CPFLFilters {
  etapa?: EtapaCPFL;
  municipio?: string;
  tecnico_id?: number;
  query?: string;
  limit?: number;
  offset?: number;
}

interface CPFLRow {
  id: number;
  name: string;
  municipio: string | null;
  endereco: string | null;
  status_id: number | null;
  pendencia: string | null;
  data_vistoria: string | null;
  data_envio: string | null;
  data_aprovacao: string | null;
  motivo: string | null;
  pdf_path: string | null;
  validacao_cpfl: string | null;
  validador_cpfl: string | null;
  tecnico_id: number | null;
  tecnico_name: string | null;
  tecnico_firstname: string | null;
  tecnico_realname: string | null;
}

/** Data do GLPI ('YYYY-MM-DD HH:MM:SS' ou vazio) → Date, ou null. */
function parseData(raw: string | null): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "" || s.startsWith("0000")) return null;
  const d = new Date(s.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function limpa(v: string | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Monta o WHERE compartilhado entre a lista e as contagens — as duas PRECISAM
 * usar o mesmo recorte, senão os cards divergem da lista (foi exatamente esse
 * tipo de divergência que apareceu em /painel/realizadas).
 */
function montarWhere(filtros: CPFLFilters): { where: string[]; params: unknown[] } {
  const where = [
    "ne.is_deleted = 0",
    `f.plugin_fields_statusvistoriafielddropdowns_id IN (${STATUS_VISTORIA_EM_ANALISE}, ${STATUS_VISTORIA_APROVADO}, ${STATUS_VISTORIA_REPROVADO})`,
  ];
  const params: unknown[] = [];

  if (filtros.etapa) {
    where.push("f.plugin_fields_statusvistoriafielddropdowns_id = ?");
    params.push(STATUS_POR_ETAPA[filtros.etapa]);
  }
  if (filtros.municipio) {
    where.push("TRIM(f.municipiofield) = ?");
    params.push(filtros.municipio.trim());
  }
  if (filtros.tecnico_id != null) {
    where.push("f.users_id_vistoriadorafield = ?");
    params.push(filtros.tecnico_id);
  }
  if (filtros.query) {
    where.push("(ne.name LIKE ? OR f.municipiofield LIKE ? OR f.endereofield LIKE ?)");
    const q = `%${filtros.query}%`;
    params.push(q, q, q);
  }
  return { where, params };
}

const JOINS = `
      FROM \`${TABLE_NE}\` ne
      INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
      LEFT  JOIN \`${TABLE_PENDENCIA}\` pend
             ON pend.id = f.plugin_fields_pendnciafielddropdowns_id
      LEFT  JOIN \`${TABLE_VALIDACAO_CPFL}\` valcpfl
             ON valcpfl.id = f.${VALIDADOR_CPFL_STATUS_COLUMN}
      LEFT  JOIN \`${TABLE_USERS}\` valu
             ON valu.id = f.${VALIDADOR_CPFL_USER_COLUMN}
      LEFT  JOIN \`${TABLE_AUX}\` aux
             ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
      LEFT  JOIN \`${TABLE_USERS}\` u
             ON u.id = f.users_id_vistoriadorafield`;

export async function fetchVistoriasCPFL(
  filtros: CPFLFilters = {}
): Promise<VistoriaCPFL[]> {
  const { where, params } = montarWhere(filtros);
  const limit = Math.min(Math.max(filtros.limit ?? 500, 1), 5000);
  const offset = Math.max(filtros.offset ?? 0, 0);

  const rows = await query<CPFLRow>(
    `
      SELECT
        ne.id,
        ne.name,
        f.municipiofield  AS municipio,
        f.endereofield    AS endereco,
        f.plugin_fields_statusvistoriafielddropdowns_id AS status_id,
        pend.name         AS pendencia,
        f.datadavistoriafield          AS data_vistoria,
        f.dataenvioconcessionriafield  AS data_envio,
        f.dataaprovaoconcessionriafield AS data_aprovacao,
        f.motivofield     AS motivo,
        aux.pdf_path,
        valcpfl.name      AS validacao_cpfl,
        valu.name         AS validador_cpfl,
        f.users_id_vistoriadorafield AS tecnico_id,
        u.name      AS tecnico_name,
        u.firstname AS tecnico_firstname,
        u.realname  AS tecnico_realname
      ${JOINS}
      WHERE ${where.join(" AND ")}
      ORDER BY f.dataenvioconcessionriafield ASC, ne.id ASC
      LIMIT ${limit} OFFSET ${offset}
    `,
    params
  );

  const agora = Date.now();

  // Técnico purgado do GLPI: o nome real ainda está no histórico. Resolve em
  // lote (uma vez por processo, ver usuariosRemovidos) para não mostrar id cru.
  const idsSemCadastro = rows
    .filter(
      (r) =>
        Number(r.tecnico_id) > 0 &&
        r.tecnico_firstname == null &&
        r.tecnico_realname == null &&
        r.tecnico_name == null
    )
    .map((r) => Number(r.tecnico_id));
  const nomesRecuperados = await nomesDeUsuariosRemovidos(idsSemCadastro);

  return rows.map((r): VistoriaCPFL => {
    const etapa = etapaDoStatus(r.status_id);
    const envio = parseData(r.data_envio);
    // Sem data de envio não dá pra afirmar há quanto tempo está parada —
    // melhor null (a tela mostra "—") do que um número inventado.
    const diasAguardando =
      etapa === "AGUARDANDO" && envio != null
        ? Math.max(0, Math.floor((agora - envio.getTime()) / 86_400_000))
        : null;

    const temTecnico = r.tecnico_id != null && Number(r.tecnico_id) > 0;
    // Parte da base aponta para usuário que não existe mais em glpi_users
    // (conferido 2026-08-31: 177 das 307 aguardando referenciam o id 11, que
    // foi purgado). Mostrar o nome recuperado do histórico; um traço mudo
    // faria parecer que a vistoria nunca teve técnico, que é coisa diferente.
    const semCadastro =
      r.tecnico_firstname == null && r.tecnico_realname == null && r.tecnico_name == null;
    const nome = semCadastro
      ? nomesRecuperados.get(Number(r.tecnico_id)) ?? "Técnico desligado"
      : `${r.tecnico_firstname ?? ""} ${r.tecnico_realname ?? ""}`.trim() ||
        r.tecnico_name ||
        "—";

    return {
      id: r.id,
      glpiId: `NE-${r.id}`,
      equipamento: r.name,
      municipio: limpa(r.municipio) ?? "—",
      endereco: limpa(r.endereco),
      etapa,
      pendencia: limpa(r.pendencia),
      tecnico: temTecnico ? { id: Number(r.tecnico_id), nome } : null,
      tecnicoDesligado: temTecnico && semCadastro,
      dataVistoria: limpa(r.data_vistoria),
      dataEnvio: limpa(r.data_envio),
      dataAprovacao: limpa(r.data_aprovacao),
      diasAguardando,
      motivo: limpa(r.motivo),
      pdfPath: r.pdf_path ?? null,
      validacaoCpfl: limpa(r.validacao_cpfl),
      validadorCpfl: limpa(r.validador_cpfl),
    };
  });
}

/**
 * Contagens no BANCO, sem LIMIT — nunca derivadas da página carregada, para
 * os cards não passarem a contradizer a lista quando a base crescer.
 */
export async function fetchCPFLStats(
  filtros: CPFLFilters = {}
): Promise<CPFLStats> {
  // A etapa é o que os cards quebram; aplicá-la aqui faria cada card contar
  // só a si mesmo.
  const { where, params } = montarWhere({ ...filtros, etapa: undefined });

  const rows = await query<{ status_id: number; total: number; mais30: number }>(
    `
      SELECT
        f.plugin_fields_statusvistoriafielddropdowns_id AS status_id,
        COUNT(*) AS total,
        SUM(
          CASE
            WHEN f.plugin_fields_statusvistoriafielddropdowns_id = ${STATUS_VISTORIA_EM_ANALISE}
             AND f.dataenvioconcessionriafield IS NOT NULL
             AND f.dataenvioconcessionriafield <> ''
             AND f.dataenvioconcessionriafield < (NOW() - INTERVAL 30 DAY)
            THEN 1 ELSE 0
          END
        ) AS mais30
      ${JOINS}
      WHERE ${where.join(" AND ")}
      GROUP BY 1
    `,
    params
  );

  const stats: CPFLStats = {
    total: 0,
    aguardando: 0,
    aprovadas: 0,
    reprovadas: 0,
    aguardandoMais30d: 0,
  };

  for (const r of rows) {
    const total = Number(r.total) || 0;
    stats.total += total;
    stats.aguardandoMais30d += Number(r.mais30) || 0;
    if (Number(r.status_id) === STATUS_VISTORIA_APROVADO) stats.aprovadas += total;
    else if (Number(r.status_id) === STATUS_VISTORIA_REPROVADO) stats.reprovadas += total;
    else stats.aguardando += total;
  }

  return stats;
}
