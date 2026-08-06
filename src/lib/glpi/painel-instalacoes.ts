import "server-only";
import { query } from "@/lib/db";
import {
  INSTALACAO_INSTALADOR_COLUMN,
  STATE_EM_INSTALACAO,
  STATE_INSTALADO,
  STATE_LIBERADO_INSTALACAO,
  TABLE_FIELDS,
  TABLE_NE,
  TABLE_USERS,
} from "./constants";
import { listInstalacoes } from "./instalacoes";
import { countInstalacaoRejeicoesPendentes } from "./instalacaoRejeicoes";
import type {
  MapaInstaladorStatus,
  PainelInstalacoesMapaInstalador,
  PainelInstalacoesMapaPoste,
  PainelInstalacoesMapaResponse,
  PainelInstalacoesStats,
} from "@/types/painel-instalacoes";
import type { TecnicoAtivo } from "@/types";

/**
 * Agregação para o painel administrativo do módulo de Instalação — paralela
 * a `src/lib/glpi/painel.ts` (Vistoria), mas NUNCA a importa nem lê suas
 * tabelas. Só reaproveita `listInstalacoes()` (leitura de postes, já
 * validada) e os `states_id` nativos já usados pelo app de campo.
 */

const INSTALACAO_GROUP_NAMES = ["VistoMap-Instalação", "VistoMap-Instalacao"];

// ────────────────────────────────────────────────────────────────────────
// Stats (dashboard)
// ────────────────────────────────────────────────────────────────────────

interface StatesCountRow {
  states_id: number;
  total: number;
}

export async function fetchPainelInstalacoesStats(): Promise<PainelInstalacoesStats> {
  const [statesRows, instaladoresRows, instaladasRows, rejeitadasPendentes] = await Promise.all([
    query<StatesCountRow>(
      `SELECT ne.states_id AS states_id, COUNT(*) AS total
         FROM \`${TABLE_NE}\` ne
        INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
        WHERE ne.is_deleted = 0
          AND ne.states_id IN (?, ?)
        GROUP BY ne.states_id`,
      [STATE_LIBERADO_INSTALACAO, STATE_EM_INSTALACAO]
    ),
    query<{ total: number }>(
      `SELECT COUNT(DISTINCT f.${INSTALACAO_INSTALADOR_COLUMN}) AS total
         FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id
        WHERE ne.is_deleted = 0
          AND ne.states_id = ?
          AND f.${INSTALACAO_INSTALADOR_COLUMN} > 0`,
      [STATE_EM_INSTALACAO]
    ),
    query<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id
        WHERE ne.is_deleted = 0
          AND ne.states_id = ?
          AND f.datadeinstalaofield >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [STATE_INSTALADO]
    ),
    countInstalacaoRejeicoesPendentes(),
  ]);

  const byState = new Map(statesRows.map((r) => [Number(r.states_id), Number(r.total)]));

  return {
    liberados: byState.get(STATE_LIBERADO_INSTALACAO) ?? 0,
    emInstalacao: byState.get(STATE_EM_INSTALACAO) ?? 0,
    instaladores24h: Number(instaladoresRows[0]?.total ?? 0),
    instaladas30d: Number(instaladasRows[0]?.total ?? 0),
    rejeitadasPendentes,
    geradoEm: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Mapa em tempo real
// ────────────────────────────────────────────────────────────────────────

interface MapaInstaladorRow {
  users_id: number;
  firstname: string | null;
  realname: string | null;
  username: string;
  email: string | null;
  latitude: string | null;
  longitude: string | null;
  accuracy_meters: number | null;
  speed_kmh: number | null;
  battery_level: number | null;
  created_at: string | null;
  em_instalacao_count: number;
}

/** Mesma heurística de `resolveMapaTecnicoStatus` (painel.ts, Vistoria) — duplicada de propósito, isolamento total entre módulos. */
function resolveMapaInstaladorStatus(
  minutosAtras: number | null,
  emInstalacaoCount: number,
  speedKmh: number | null
): MapaInstaladorStatus {
  if (minutosAtras == null || minutosAtras > 30) return "offline";
  if (emInstalacaoCount > 0) return "em-instalacao";
  if ((speedKmh ?? 0) >= 3 || minutosAtras < 5) return "em-operacao";
  return "parado";
}

async function fetchMapaInstaladores(): Promise<PainelInstalacoesMapaInstalador[]> {
  const rows = await query<MapaInstaladorRow>(
    `
      SELECT
        u.id AS users_id,
        u.firstname,
        u.realname,
        u.name AS username,
        (
          SELECT email FROM glpi_useremails ue
           WHERE ue.users_id = u.id
           ORDER BY ue.is_default DESC, ue.id ASC
           LIMIT 1
        ) AS email,
        CAST(loc.latitude AS CHAR) AS latitude,
        CAST(loc.longitude AS CHAR) AS longitude,
        loc.accuracy_meters,
        loc.speed_kmh,
        loc.battery_level,
        loc.created_at,
        (
          SELECT COUNT(*)
            FROM \`${TABLE_FIELDS}\` f
           INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id
           WHERE f.${INSTALACAO_INSTALADOR_COLUMN} = u.id
             AND ne.states_id = ${STATE_EM_INSTALACAO}
        ) AS em_instalacao_count
      FROM \`${TABLE_USERS}\` u
      INNER JOIN glpi_groups_users gu ON gu.users_id = u.id
      INNER JOIN glpi_groups g ON g.id = gu.groups_id AND g.name IN (?, ?)
      LEFT JOIN (
        SELECT l.users_id, l.latitude, l.longitude, l.accuracy_meters, l.speed_kmh, l.battery_level, l.created_at
          FROM glpi_plugin_vistomap_locations l
         INNER JOIN (
           SELECT users_id, MAX(created_at) AS max_created
             FROM glpi_plugin_vistomap_locations
            GROUP BY users_id
         ) lm ON lm.users_id = l.users_id AND lm.max_created = l.created_at
      ) loc ON loc.users_id = u.id
      WHERE u.is_deleted = 0 AND u.is_active = 1
      GROUP BY u.id
      ORDER BY u.name ASC
    `,
    INSTALACAO_GROUP_NAMES
  );

  const now = Date.now();
  return rows.map((r) => {
    const nome = `${r.firstname ?? ""} ${r.realname ?? ""}`.trim() || r.username;
    const minutos = r.created_at ? Math.round((now - new Date(r.created_at).getTime()) / 60000) : null;
    const emInstalacaoCount = Number(r.em_instalacao_count) || 0;
    return {
      users_id: r.users_id,
      nome,
      email: r.email,
      latitude: r.latitude != null ? Number(r.latitude) : null,
      longitude: r.longitude != null ? Number(r.longitude) : null,
      accuracy_meters: r.accuracy_meters,
      speed_kmh: r.speed_kmh,
      battery_level: r.battery_level,
      created_at: r.created_at,
      minutos_atras: minutos,
      status_operacional: resolveMapaInstaladorStatus(minutos, emInstalacaoCount, r.speed_kmh),
      em_instalacao_count: emInstalacaoCount,
    };
  });
}

async function fetchMapaPostes(): Promise<PainelInstalacoesMapaPoste[]> {
  const instalacoes = await listInstalacoes();
  return instalacoes
    .filter((i) => i.latitude != null && i.longitude != null)
    .map((i) => ({
      id: i.id,
      equipamento: i.equipamento,
      municipio: i.contexto.municipio || null,
      latitude: i.latitude as number,
      longitude: i.longitude as number,
      status: i.statusGeralId === STATE_EM_INSTALACAO ? "em-instalacao" : "liberado",
      instalador_id: i.instalador?.id ?? null,
      instalador_nome: i.instalador?.nome ?? null,
    }));
}

export async function fetchPainelInstalacoesMapa(): Promise<PainelInstalacoesMapaResponse> {
  const [instaladores, postes] = await Promise.all([fetchMapaInstaladores(), fetchMapaPostes()]);
  return { instaladores, postes, generated_at: new Date().toISOString() };
}

// ────────────────────────────────────────────────────────────────────────
// Técnicos (/painel/tecnicos) — instaladores, mesma forma de dado
// (TecnicoAtivo) que fetchTecnicos() de painel.ts já usa pra vistoriadores.
// Reaproveita o TIPO (já genérico o bastante: id/nome/status/atribuidas/
// concluidasHoje), mas a query é toda própria — nunca lê tabela de vistoria.
// ────────────────────────────────────────────────────────────────────────

interface InstaladorAtivoRow {
  id: number;
  name: string;
  firstname: string | null;
  realname: string | null;
  email: string | null;
  atribuidas: number;
  concluidas_hoje: number;
  ultima_atividade: string | null;
}

export async function fetchInstaladoresAtivos(): Promise<TecnicoAtivo[]> {
  const rows = await query<InstaladorAtivoRow>(
    `
      SELECT
        u.id,
        u.name,
        u.firstname,
        u.realname,
        (
          SELECT email FROM glpi_useremails
           WHERE users_id = u.id
        ORDER BY is_default DESC, id ASC
           LIMIT 1
        ) AS email,
        (
          SELECT COUNT(*) FROM \`${TABLE_FIELDS}\` f
            INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
           WHERE f.${INSTALACAO_INSTALADOR_COLUMN} = u.id
             AND ne.states_id = ${STATE_EM_INSTALACAO}
        ) AS atribuidas,
        (
          SELECT COUNT(*) FROM \`${TABLE_FIELDS}\` f2
            INNER JOIN \`${TABLE_NE}\` ne2 ON ne2.id = f2.items_id AND ne2.is_deleted = 0
           WHERE f2.${INSTALACAO_INSTALADOR_COLUMN} = u.id
             AND ne2.states_id = ${STATE_INSTALADO}
             AND DATE(f2.datadeinstalaofield) = CURDATE()
        ) AS concluidas_hoje,
        (
          SELECT MAX(f3.datadeinstalaofield)
            FROM \`${TABLE_FIELDS}\` f3
           WHERE f3.${INSTALACAO_INSTALADOR_COLUMN} = u.id
        ) AS ultima_atividade
      FROM \`${TABLE_USERS}\` u
      INNER JOIN glpi_groups_users gu ON gu.users_id = u.id
      INNER JOIN glpi_groups g ON g.id = gu.groups_id AND g.name IN (?, ?)
      WHERE u.is_deleted = 0 AND u.is_active = 1
      GROUP BY u.id
      ORDER BY atribuidas DESC, u.name ASC
    `,
    INSTALACAO_GROUP_NAMES
  );

  const ids = rows.map((r) => r.id);

  // Município "atual" — poste em instalação agora (mesma heurística de fetchTecnicos).
  let municipios = new Map<number, string>();
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    const muniRows = await query<{ tec: number; muni: string }>(
      `
        SELECT f.${INSTALACAO_INSTALADOR_COLUMN} AS tec, TRIM(f.municipiofield) AS muni
          FROM \`${TABLE_FIELDS}\` f
         WHERE f.${INSTALACAO_INSTALADOR_COLUMN} IN (${placeholders})
           AND f.municipiofield IS NOT NULL
           AND TRIM(f.municipiofield) <> ''
         GROUP BY f.${INSTALACAO_INSTALADOR_COLUMN}, TRIM(f.municipiofield)
      `,
      ids
    );
    for (const m of muniRows) {
      if (!municipios.has(m.tec)) municipios.set(m.tec, m.muni);
    }
  }

  // Último ping GPS — mesma tabela genérica de locations que a Vistoria usa.
  let ultimoPingGps = new Map<number, string>();
  if (ids.length > 0) {
    try {
      const placeholders = ids.map(() => "?").join(",");
      const gpsRows = await query<{ users_id: number; created_at: string }>(
        `
          SELECT l.users_id, l.created_at
            FROM glpi_plugin_vistomap_locations l
            INNER JOIN (
              SELECT users_id, MAX(created_at) AS max_created
                FROM glpi_plugin_vistomap_locations
               WHERE users_id IN (${placeholders})
               GROUP BY users_id
            ) lm ON lm.users_id = l.users_id AND lm.max_created = l.created_at
        `,
        ids
      );
      for (const g of gpsRows) {
        ultimoPingGps.set(g.users_id, g.created_at);
      }
    } catch {
      // noop
    }
  }

  return rows.map((r) => {
    const nome = `${r.firstname ?? ""} ${r.realname ?? ""}`.trim() || r.name;
    const ultimaAtividadeRef = ultimoPingGps.get(r.id) ?? r.ultima_atividade ?? null;
    const ultimaMs = ultimaAtividadeRef ? new Date(ultimaAtividadeRef).getTime() : 0;
    const minutesSince = ultimaMs ? (Date.now() - ultimaMs) / 60_000 : Infinity;
    const status: TecnicoAtivo["status"] =
      minutesSince < 5 ? "em-campo" : minutesSince < 30 ? "base" : minutesSince < 120 ? "off-shift" : "offline";
    return {
      id: String(r.id),
      nome,
      email: r.email ?? undefined,
      status,
      municipio: municipios.get(r.id),
      atribuidas: Number(r.atribuidas) || 0,
      concluidasHoje: Number(r.concluidas_hoje) || 0,
      ultimaAtividade: ultimaAtividadeRef ?? undefined,
    };
  });
}
