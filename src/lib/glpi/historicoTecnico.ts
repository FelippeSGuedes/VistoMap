import "server-only";
import { query } from "@/lib/db";
import { fetchAudit } from "./audit";
import {
  ITEMTYPE_NE,
  SITUACAO_COLUMN,
  TABLE_AUX,
  TABLE_FIELDS,
  TABLE_NE,
  TABLE_STATUS_VISTORIA,
} from "./constants";
import type { HistoricoEntry, HistoricoSummary } from "@/types";

/**
 * Histórico operacional PESSOAL do técnico logado — /historico (app).
 *
 * Diferente de fetchHistoricoAnalytics() (src/lib/glpi/historico.ts, painel
 * /painel/historico, agregado de TODOS os técnicos): aqui tudo é escopado
 * por um único users_id_vistoriadorafield. Só entram métricas com fonte de
 * dado real e confiável — sem "sincronizações" (não temos esse evento
 * registrado em lugar nenhum hoje) e sem números inventados.
 */

export type PeriodoHistorico = "7d" | "30d" | "90d" | "all";

// situaodavistoriafield: 3=Vistoriado, 6=Revisitado — mesma regra de
// "concluída" usada em painel.ts/historico.ts (fetchVistoriasRealizadas etc).
const SITUACAO_CONCLUIDA_SQL = `f.\`${SITUACAO_COLUMN}\` IN (3, 6)`;
const STATUS_CONCLUIDO_SQL = `sv.name IN ('Em análise','Em analise','Finalizada','Finalizado','Aprovada','Aprovado')`;

function periodoInicio(periodo: PeriodoHistorico): string | null {
  if (periodo === "all") return null;
  const dias = periodo === "7d" ? 7 : periodo === "90d" ? 90 : 30;
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Haversine — distância em km entre 2 coords (mesma fórmula de historico.ts). */
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

const TIPO_POR_ACAO: Record<string, HistoricoEntry["tipo"]> = {
  "vistoria-iniciada": "vistoria-iniciada",
  "vistoria-finalizada": "vistoria-finalizada",
  "vistoria-em-deslocamento": "rota-iniciada",
};

export async function fetchHistoricoTecnico(
  tecnicoId: number,
  periodo: PeriodoHistorico = "7d"
): Promise<HistoricoSummary> {
  const inicio = periodoInicio(periodo);
  const dataParams = inicio ? [tecnicoId, inicio] : [tecnicoId];
  const dataFiltro = inicio ? "AND DATE(f.datadavistoriafield) >= ?" : "";

  /* ── Totais ────────────────────────────────────────────────────── */
  const [agg] = await query<{
    finalizadas: number;
    aprovadas: number;
    reprovadas: number;
    revisitas: number;
    pdfs: number;
  }>(
    `
      SELECT
        SUM(CASE WHEN ${SITUACAO_CONCLUIDA_SQL} OR ${STATUS_CONCLUIDO_SQL} THEN 1 ELSE 0 END) AS finalizadas,
        SUM(CASE WHEN sv.name IN ('Aprovada','Aprovado') THEN 1 ELSE 0 END) AS aprovadas,
        SUM(CASE WHEN sv.name IN ('Reprovada','Reprovado') THEN 1 ELSE 0 END) AS reprovadas,
        SUM(CASE WHEN (${SITUACAO_CONCLUIDA_SQL} OR ${STATUS_CONCLUIDO_SQL})
                  AND COALESCE(aux.is_repeat,0) = 1 THEN 1 ELSE 0 END) AS revisitas,
        SUM(CASE WHEN aux.project_status = 'GERADO' THEN 1 ELSE 0 END) AS pdfs
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        LEFT JOIN \`${TABLE_AUX}\` aux
                ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
       WHERE f.users_id_vistoriadorafield = ?
         AND f.datadavistoriafield IS NOT NULL
         ${dataFiltro}
    `,
    dataParams
  );

  const finalizadas = Number(agg?.finalizadas ?? 0);
  const aprovadas = Number(agg?.aprovadas ?? 0);
  const reprovadas = Number(agg?.reprovadas ?? 0);
  const revisitas = Number(agg?.revisitas ?? 0);
  const pdfsGerados = Number(agg?.pdfs ?? 0);

  /* ── Municípios atendidos ─────────────────────────────────────── */
  const muniRows = await query<{ municipio: string }>(
    `
      SELECT DISTINCT TRIM(f.municipiofield) AS municipio
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
       WHERE f.users_id_vistoriadorafield = ?
         AND f.datadavistoriafield IS NOT NULL
         ${dataFiltro}
         AND f.municipiofield IS NOT NULL
         AND TRIM(f.municipiofield) <> ''
    `,
    dataParams
  );
  const municipiosAtendidos = muniRows.map((r) => r.municipio).sort();

  /* ── Timeline + rotas + tempo operacional (via auditoria) ────────
     Reaproveita fetchAudit() já existente — ator_id = este técnico,
     filtra por período/ação em memória (volume por técnico é pequeno). */
  const auditRows = await fetchAudit({ ator_id: tecnicoId, limit: 1000 });
  const inicioMs = inicio ? new Date(inicio).getTime() : 0;
  const eventosRelevantes = auditRows.filter(
    (r) =>
      r.acao in TIPO_POR_ACAO && new Date(r.timestamp).getTime() >= inicioMs
  );

  const timeline: HistoricoEntry[] = eventosRelevantes.slice(0, 40).map((r) => ({
    id: r.id,
    tipo: TIPO_POR_ACAO[r.acao],
    timestamp: r.timestamp,
    titulo: r.alvo?.label ? `${labelPorAcao(r.acao)} — ${r.alvo.label}` : labelPorAcao(r.acao),
    descricao: r.descricao,
    equipamento: r.alvo?.tipo === "vistoria" ? r.alvo.label : undefined,
  }));

  const rotasExecutadas = eventosRelevantes.filter(
    (r) => r.acao === "vistoria-em-deslocamento"
  ).length;

  // Soma (finalizada − iniciada) por vistoria (alvo_id), em minutos —
  // outliers > 10h descartados (provável esquecimento de finalizar).
  const inicioPorAlvo = new Map<string, number>();
  let minutosOperacionais = 0;
  for (const r of eventosRelevantes) {
    if (!r.alvo?.id) continue;
    if (r.acao === "vistoria-iniciada") {
      inicioPorAlvo.set(r.alvo.id, new Date(r.timestamp).getTime());
    } else if (r.acao === "vistoria-finalizada") {
      const t0 = inicioPorAlvo.get(r.alvo.id);
      if (t0 != null) {
        const min = (new Date(r.timestamp).getTime() - t0) / 60000;
        if (min >= 0 && min <= 600) minutosOperacionais += min;
        inicioPorAlvo.delete(r.alvo.id);
      }
    }
  }
  const tempoOperacionalHoras = Math.round((minutosOperacionais / 60) * 10) / 10;

  /* ── Distância percorrida — Haversine sobre pings GPS deste técnico ── */
  let distanciaPercorridaKm = 0;
  try {
    const gpsParams = inicio ? [tecnicoId, inicio] : [tecnicoId];
    const gpsFiltro = inicio ? "AND DATE(created_at) >= ?" : "";
    const gpsRows = await query<{
      latitude: number | string;
      longitude: number | string;
      created_at: string;
    }>(
      `
        SELECT latitude, longitude, created_at
          FROM glpi_plugin_vistomap_locations
         WHERE users_id = ?
           ${gpsFiltro}
         ORDER BY created_at
      `,
      gpsParams
    );
    let prevCoord: { lat: number; lng: number } | null = null;
    for (const g of gpsRows) {
      const lat = Number(g.latitude);
      const lng = Number(g.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (prevCoord) {
        const d = haversineKm(prevCoord, { lat, lng });
        if (d < 5) distanciaPercorridaKm += d; // ignora saltos de GPS drift
      }
      prevCoord = { lat, lng };
    }
  } catch {
    // tabela de localizações ausente — fica 0
  }

  const hoje = new Date().toISOString().slice(0, 10);
  return {
    periodo: { inicio: inicio ?? "—", fim: hoje },
    vistoriasEnviadas: finalizadas,
    vistoriasEntregues: aprovadas + reprovadas, // já teve decisão (aprovada ou reprovada)
    aprovadas,
    reprovadas,
    revisitas,
    pdfsGerados,
    rotasExecutadas,
    tempoOperacionalHoras,
    distanciaPercorridaKm: Math.round(distanciaPercorridaKm * 10) / 10,
    municipiosAtendidos,
    timeline,
  };
}

function labelPorAcao(acao: string): string {
  switch (acao) {
    case "vistoria-iniciada":
      return "Vistoria iniciada";
    case "vistoria-finalizada":
      return "Vistoria finalizada";
    case "vistoria-em-deslocamento":
      return "Deslocamento iniciado";
    default:
      return acao;
  }
}
