import "server-only";
import { query } from "@/lib/db";
import {
  ITEMTYPE_NE,
  TABLE_AUX,
  TABLE_FIELDS,
  TABLE_NE,
  TABLE_STATUS_VISTORIA,
} from "./constants";
import { nomesDeUsuariosRemovidos } from "./usuariosRemovidos";

/**
 * Ranking de técnicos por PERÍODO ARBITRÁRIO (inicio/fim explícitos) — pro
 * widget "Top Técnicos" do dashboard principal (/painel), que precisa de
 * Hoje/Última Semana/Personalizado, diferente do seletor fixo 7/30/90 dias
 * de fetchHistoricoAnalytics() (historico.ts, usado em /painel/historico).
 *
 * Deliberadamente um arquivo separado, não uma generalização de
 * historico.ts: essa função já está em produção alimentando uma tela usada
 * todo dia — preferi duplicar a query (mesmo padrão, ~60 linhas) a
 * refatorar código que já funciona.
 */

export interface RankingTecnicoItem {
  id: number;
  nome: string;
  total: number;
  aprovadas: number;
  revisitas: number;
  cidades: number;
  kmPercorrido?: number;
  tempoDeslocamentoMedioMin?: number | null;
  slaExecucaoMedioMin?: number | null;
}

const SITUACAO_CONCLUIDA_SQL = `f.plugin_fields_situaodavistoriafielddropdowns_id IN (3, 6)`;
const STATUS_CONCLUIDO_SQL = `sv.name IN ('Em análise','Em analise','Finalizada','Finalizado','Aprovada','Aprovado')`;

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

/** @param inicio,fim — 'YYYY-MM-DD', ambos inclusivos. */
export async function fetchRankingTecnicosPeriodo(
  inicio: string,
  fim: string,
  limit = 8
): Promise<RankingTecnicoItem[]> {
  const tecRows = await query<{
    tecnico_id: number;
    id: number | null;
    name: string | null;
    firstname: string | null;
    realname: string | null;
    total: number;
    aprovadas: number;
    revisitas: number;
    cidades: number;
  }>(
    `
      SELECT f.users_id_vistoriadorafield AS tecnico_id,
             u.id, u.name, u.firstname, u.realname,
             COUNT(*) AS total,
             SUM(CASE WHEN sv.name IN ('Aprovada','Aprovado') THEN 1 ELSE 0 END) AS aprovadas,
             SUM(CASE WHEN COALESCE(aux.is_repeat,0) = 1 THEN 1 ELSE 0 END) AS revisitas,
             COUNT(DISTINCT TRIM(f.municipiofield)) AS cidades
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN glpi_users u ON u.id = f.users_id_vistoriadorafield
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        LEFT JOIN \`${TABLE_AUX}\` aux
                ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
       WHERE f.datadavistoriafield IS NOT NULL
         AND DATE(f.datadavistoriafield) BETWEEN ? AND ?
         AND f.users_id_vistoriadorafield > 0
         AND (${SITUACAO_CONCLUIDA_SQL} OR ${STATUS_CONCLUIDO_SQL})
       GROUP BY f.users_id_vistoriadorafield
       ORDER BY total DESC
       LIMIT ${Math.min(Math.max(limit, 1), 50)}
    `,
    [inicio, fim]
  );

  if (tecRows.length === 0) return [];

  /* ── Km percorrido — Haversine sobre pings GPS, mesmo período ────── */
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
         WHERE DATE(created_at) BETWEEN ? AND ?
         ORDER BY users_id, created_at
      `,
      [inicio, fim]
    );
    let prevUser: number | null = null;
    let prevCoord: { lat: number; lng: number } | null = null;
    for (const g of gpsRows) {
      const lat = Number(g.latitude);
      const lng = Number(g.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (prevUser === g.users_id && prevCoord) {
        const d = haversineKm(prevCoord, { lat, lng });
        if (d < 5) kmPorTecnico.set(g.users_id, (kmPorTecnico.get(g.users_id) ?? 0) + d);
      }
      prevUser = g.users_id;
      prevCoord = { lat, lng };
    }
  } catch {
    // tabela ausente — km fica undefined
  }

  /* ── Tempo de deslocamento/SLA via auditoria, mesmo período ───────── */
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
           AND DATE(ts) BETWEEN ? AND ?
         GROUP BY alvo_id
      `,
      [inicio, fim]
    );
    for (const r of evRows) {
      const ator = Number(r.ator_id) || 0;
      if (!ator) continue;
      const bucket = tempoMap.get(ator) ?? { desloc: [], sla: [] };
      if (r.t_desloc && r.t_ini) {
        const d = (new Date(r.t_ini).getTime() - new Date(r.t_desloc).getTime()) / 60000;
        if (d >= 0 && d <= 600) bucket.desloc.push(d);
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

  const idsSemCadastro = tecRows.filter((r) => r.id == null).map((r) => Number(r.tecnico_id));
  const nomesRecuperados = await nomesDeUsuariosRemovidos(idsSemCadastro);

  return tecRows.map((r) => ({
    id: r.tecnico_id,
    nome:
      r.id == null
        ? nomesRecuperados.get(r.tecnico_id) ?? "Técnico desligado"
        : `${r.firstname ?? ""} ${r.realname ?? ""}`.trim() || r.name || "—",
    total: Number(r.total) || 0,
    aprovadas: Number(r.aprovadas) || 0,
    revisitas: Number(r.revisitas) || 0,
    cidades: Number(r.cidades) || 0,
    kmPercorrido:
      kmPorTecnico.get(r.tecnico_id) != null
        ? Math.round((kmPorTecnico.get(r.tecnico_id) ?? 0) * 10) / 10
        : undefined,
    tempoDeslocamentoMedioMin: mediaMin(tempoMap.get(r.tecnico_id)?.desloc ?? []),
    slaExecucaoMedioMin: mediaMin(tempoMap.get(r.tecnico_id)?.sla ?? []),
  }));
}
