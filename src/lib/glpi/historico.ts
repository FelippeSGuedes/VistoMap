import "server-only";
import { query } from "@/lib/db";
import {
  ITEMTYPE_NE,
  TABLE_AUX,
  TABLE_FIELDS,
  TABLE_NE,
  TABLE_STATUS_VISTORIA,
} from "./constants";
import { agregarMotivos, type MotivoAgregado } from "./motivos";

/**
 * Histórico operacional agregado para /painel/historico.
 *
 * Combina:
 *  • séries diárias (vistorias, revisitas, aprovações) via GROUP BY DATE()
 *  • taxas (aprovação, revisita)
 *  • top municípios
 *  • ranking técnicos
 *  • km percorrido (Haversine sobre pings GPS sucessivos)
 *
 * Período default: últimos 30 dias.
 */

export interface HistoricoAnalytics {
  periodo: { inicio: string; fim: string; dias: number };
  totais: {
    vistoriasFinalizadas: number;
    revisitasFinalizadas: number;
    aprovadas: number;
    reprovadas: number;
    pdfsGerados: number;
  };
  taxas: {
    aprovacaoPct: number;
    revisitaPct: number;
  };
  medias: {
    diariaVistorias: number;
    semanalVistorias: number;
  };
  serieDiaria: Array<{
    dia: string; // YYYY-MM-DD
    finalizadas: number;
    aprovadas: number;
    reprovadas: number;
  }>;
  topMunicipios: Array<{
    municipio: string;
    total: number;
  }>;
  rankingTecnicos: Array<{
    id: number;
    nome: string;
    total: number;
    aprovadas: number;
    revisitas: number;
    kmPercorrido?: number;
    tempoDeslocamentoMedioMin?: number | null;
    slaExecucaoMedioMin?: number | null;
  }>;
  kmOperacional: number;
  motivosReprovacao: MotivoAgregado[];
}

function isoDaysAgo(d: number): string {
  const x = new Date();
  x.setDate(x.getDate() - d);
  return x.toISOString().slice(0, 10);
}

/** Haversine — distância em km entre 2 coords. */
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

export async function fetchHistoricoAnalytics(
  dias = 30
): Promise<HistoricoAnalytics> {
  const inicio = isoDaysAgo(dias);

  /* ── Séries diárias ─────────────────────────────────────────── */
  // Conta por dia agrupando por status name.
  const serieRows = await query<{
    dia: string;
    status_name: string | null;
    total: number;
  }>(
    `
      SELECT DATE(f.datadavistoriafield) AS dia,
             sv.name AS status_name,
             COUNT(*) AS total
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
       WHERE f.datadavistoriafield IS NOT NULL
         AND DATE(f.datadavistoriafield) >= ?
       GROUP BY DATE(f.datadavistoriafield), sv.name
       ORDER BY dia
    `,
    [inicio]
  );

  // Constrói série dia-a-dia (preenche dias faltantes com 0).
  const diasMap = new Map<
    string,
    { finalizadas: number; aprovadas: number; reprovadas: number }
  >();
  for (let i = dias - 1; i >= 0; i--) {
    diasMap.set(isoDaysAgo(i), { finalizadas: 0, aprovadas: 0, reprovadas: 0 });
  }
  for (const r of serieRows) {
    const ref = diasMap.get(r.dia);
    if (!ref) continue;
    const s = (r.status_name ?? "").toLowerCase();
    if (
      s === "em análise" ||
      s === "em analise" ||
      s === "finalizada" ||
      s === "finalizado" ||
      s === "aprovada" ||
      s === "aprovado"
    ) {
      ref.finalizadas += Number(r.total) || 0;
    }
    if (s === "aprovada" || s === "aprovado") ref.aprovadas += Number(r.total) || 0;
    if (s === "reprovada" || s === "reprovado") ref.reprovadas += Number(r.total) || 0;
  }
  const serieDiaria = Array.from(diasMap.entries()).map(([dia, v]) => ({
    dia,
    finalizadas: v.finalizadas,
    aprovadas: v.aprovadas,
    reprovadas: v.reprovadas,
  }));

  /* ── Totais agregados ───────────────────────────────────────── */
  const [agg] = await query<{
    finalizadas: number;
    aprovadas: number;
    reprovadas: number;
    revisitas_finalizadas: number;
    pdfs: number;
  }>(
    `
      SELECT
        SUM(CASE WHEN sv.name IN ('Em análise','Em analise','Finalizada','Finalizado','Aprovada','Aprovado') THEN 1 ELSE 0 END) AS finalizadas,
        SUM(CASE WHEN sv.name IN ('Aprovada','Aprovado') THEN 1 ELSE 0 END) AS aprovadas,
        SUM(CASE WHEN sv.name IN ('Reprovada','Reprovado') THEN 1 ELSE 0 END) AS reprovadas,
        SUM(CASE WHEN sv.name IN ('Em análise','Em analise','Finalizada','Finalizado','Aprovada','Aprovado')
                  AND COALESCE(aux.is_repeat,0) = 1 THEN 1 ELSE 0 END) AS revisitas_finalizadas,
        (SELECT COUNT(*) FROM \`${TABLE_AUX}\` WHERE project_status = 'GERADO') AS pdfs
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        LEFT JOIN \`${TABLE_AUX}\` aux
                ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
       WHERE f.datadavistoriafield IS NOT NULL
         AND DATE(f.datadavistoriafield) >= ?
    `,
    [inicio]
  );

  const finalizadas = Number(agg?.finalizadas ?? 0);
  const aprovadas = Number(agg?.aprovadas ?? 0);
  const reprovadas = Number(agg?.reprovadas ?? 0);
  const revisitasFinalizadas = Number(agg?.revisitas_finalizadas ?? 0);
  const pdfsGerados = Number(agg?.pdfs ?? 0);

  /* ── Top municípios ─────────────────────────────────────────── */
  const muniRows = await query<{ municipio: string; total: number }>(
    `
      SELECT TRIM(f.municipiofield) AS municipio, COUNT(*) AS total
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
       WHERE f.municipiofield IS NOT NULL
         AND TRIM(f.municipiofield) <> ''
         AND DATE(f.datadavistoriafield) >= ?
       GROUP BY TRIM(f.municipiofield)
       ORDER BY total DESC
       LIMIT 10
    `,
    [inicio]
  );

  /* ── Ranking técnicos ──────────────────────────────────────── */
  const tecRows = await query<{
    id: number;
    name: string;
    firstname: string | null;
    realname: string | null;
    total: number;
    aprovadas: number;
    revisitas: number;
    cidades: number;
  }>(
    `
      SELECT u.id, u.name, u.firstname, u.realname,
             COUNT(*) AS total,
             SUM(CASE WHEN sv.name IN ('Aprovada','Aprovado') THEN 1 ELSE 0 END) AS aprovadas,
             SUM(CASE WHEN COALESCE(aux.is_repeat,0) = 1 THEN 1 ELSE 0 END) AS revisitas,
             COUNT(DISTINCT TRIM(f.municipiofield)) AS cidades
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        INNER JOIN glpi_users u ON u.id = f.users_id_vistoriadorafield
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        LEFT JOIN \`${TABLE_AUX}\` aux
                ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
       WHERE f.datadavistoriafield IS NOT NULL
         AND DATE(f.datadavistoriafield) >= ?
         AND sv.name IN ('Em análise','Em analise','Finalizada','Finalizado','Aprovada','Aprovado')
       GROUP BY u.id
       ORDER BY total DESC
       LIMIT 50
    `,
    [inicio]
  );

  /* ── Km percorrido — Haversine sobre pings GPS ─────────────── */
  // Tabela de locations pode não existir ainda; silenciamos falha.
  let kmTotal = 0;
  const kmPorTecnico = new Map<number, number>();
  try {
    const gpsRows = await query<{
      users_id: number;
      latitude: number | string;
      longitude: number | string;
      created_at: string;
    }>(
      `
        SELECT users_id, latitude, longitude, created_at
          FROM glpi_plugin_vistomap_locations
         WHERE DATE(created_at) >= ?
         ORDER BY users_id, created_at
      `,
      [inicio]
    );
    // Soma distâncias entre pings consecutivos do mesmo técnico.
    let prevUser: number | null = null;
    let prevCoord: { lat: number; lng: number } | null = null;
    for (const g of gpsRows) {
      const lat = Number(g.latitude);
      const lng = Number(g.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (prevUser === g.users_id && prevCoord) {
        const d = haversineKm(prevCoord, { lat, lng });
        // Filtro: ignora "saltos" > 5km entre pings (provável GPS drift / cold start).
        if (d < 5) {
          kmTotal += d;
          kmPorTecnico.set(g.users_id, (kmPorTecnico.get(g.users_id) ?? 0) + d);
        }
      }
      prevUser = g.users_id;
      prevCoord = { lat, lng };
    }
  } catch {
    // tabela ausente — kmTotal fica 0
  }

  /* ── Métricas de tempo por técnico (via auditoria) ──────────────────
     Cruza, por vistoria, os eventos Em Deslocamento → Iniciada → Finalizada
     e agrega médias por ator (técnico).
       • tempo de deslocamento = iniciada − em-deslocamento
       • SLA de execução       = finalizada − iniciada                      */
  const tempoMap = new Map<number, { desloc: number[]; sla: number[] }>();
  try {
    const evRows = await query<{
      alvo_id: string;
      ator_id: number;
      t_desloc: string | null;
      t_ini: string | null;
      t_fim: string | null;
    }>(
      `
        SELECT alvo_id,
               MAX(CASE WHEN acao IN ('vistoria-iniciada','vistoria-finalizada') THEN ator_id END) AS ator_id,
               MAX(CASE WHEN acao = 'vistoria-em-deslocamento' THEN ts END) AS t_desloc,
               MAX(CASE WHEN acao = 'vistoria-iniciada'        THEN ts END) AS t_ini,
               MAX(CASE WHEN acao = 'vistoria-finalizada'      THEN ts END) AS t_fim
          FROM glpi_plugin_vistomap_audit
         WHERE acao IN ('vistoria-em-deslocamento','vistoria-iniciada','vistoria-finalizada')
           AND ts >= ?
         GROUP BY alvo_id
      `,
      [inicio]
    );
    for (const r of evRows) {
      const ator = Number(r.ator_id) || 0;
      if (!ator) continue;
      const bucket = tempoMap.get(ator) ?? { desloc: [], sla: [] };
      if (r.t_desloc && r.t_ini) {
        const d = (new Date(r.t_ini).getTime() - new Date(r.t_desloc).getTime()) / 60000;
        if (d >= 0 && d <= 600) bucket.desloc.push(d); // ignora outliers > 10h
      }
      if (r.t_ini && r.t_fim) {
        const s = (new Date(r.t_fim).getTime() - new Date(r.t_ini).getTime()) / 60000;
        if (s >= 0 && s <= 600) bucket.sla.push(s);
      }
      tempoMap.set(ator, bucket);
    }
  } catch {
    // tabela de auditoria ausente — métricas ficam nulas
  }
  const mediaMin = (arr: number[]): number | null =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  const rankingTecnicos = tecRows.map((r) => ({
    id: r.id,
    nome:
      `${r.firstname ?? ""} ${r.realname ?? ""}`.trim() || r.name,
    total: Number(r.total) || 0,
    aprovadas: Number(r.aprovadas) || 0,
    revisitas: Number(r.revisitas) || 0,
    cidades: Number(r.cidades) || 0,
    kmPercorrido:
      kmPorTecnico.get(r.id) != null
        ? Math.round((kmPorTecnico.get(r.id) ?? 0) * 10) / 10
        : undefined,
    tempoDeslocamentoMedioMin: mediaMin(tempoMap.get(r.id)?.desloc ?? []),
    slaExecucaoMedioMin: mediaMin(tempoMap.get(r.id)?.sla ?? []),
  }));

  /* ── Motivos de reprovação (classificados) ───────────────────── */
  // Coleta motivofield bruto de vistorias reprovadas no período +
  // de revisitas pendentes (is_repeat=1) — qualquer registro com motivo.
  // Classifica por keywords (lib motivos.ts) → distribuição %.
  const motivosRows = await query<{ motivo: string | null }>(
    `
      SELECT f.motivofield AS motivo
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        LEFT JOIN \`${TABLE_AUX}\` aux
                ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
       WHERE f.motivofield IS NOT NULL
         AND TRIM(f.motivofield) <> ''
         AND (
              sv.name IN ('Reprovada','Reprovado')
           OR COALESCE(aux.is_repeat, 0) = 1
         )
         AND (
              f.datadavistoriafield IS NULL
           OR DATE(f.datadavistoriafield) >= ?
         )
       LIMIT 2000
    `,
    [inicio]
  );
  const motivosReprovacao = agregarMotivos(motivosRows.map((r) => r.motivo));

  const aprovacaoPct = finalizadas > 0
    ? Math.round((aprovadas / finalizadas) * 100)
    : 0;
  const revisitaPct = finalizadas > 0
    ? Math.round((revisitasFinalizadas / finalizadas) * 100)
    : 0;
  const diariaVistorias = Math.round(finalizadas / Math.max(dias, 1));
  const semanalVistorias = Math.round(finalizadas / Math.max(dias / 7, 1));

  return {
    periodo: { inicio, fim: isoDaysAgo(0), dias },
    totais: {
      vistoriasFinalizadas: finalizadas,
      revisitasFinalizadas,
      aprovadas,
      reprovadas,
      pdfsGerados,
    },
    taxas: { aprovacaoPct, revisitaPct },
    medias: { diariaVistorias, semanalVistorias },
    serieDiaria,
    topMunicipios: muniRows.map((r) => ({
      municipio: r.municipio,
      total: Number(r.total) || 0,
    })),
    rankingTecnicos,
    kmOperacional: Math.round(kmTotal * 10) / 10,
    motivosReprovacao,
  };
}
