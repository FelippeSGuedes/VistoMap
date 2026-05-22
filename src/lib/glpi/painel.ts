import "server-only";
import { execute, query } from "@/lib/db";
import {
  ITEMTYPE_NE,
  PENDENCIA_CPFL,
  SITUACAO_AGUARDANDO_REVISITA,
  SITUACAO_COLUMN,
  SITUACAO_EM_REVISITA,
  SITUACAO_EM_VISTORIA,
  SITUACAO_REVISITADO,
  STATUS_VISTORIA_EM_ANALISE,
  STATUS_VISTORIA_REPROVADO,
  TABLE_AUX,
  TABLE_FIELDS,
  TABLE_NE,
  TABLE_STATUS_VISTORIA,
  TABLE_USERS,
} from "./constants";
import type {
  AdminStatus,
  PainelStats,
  RevisitaPendente,
  TecnicoAtivo,
  VistoriaPriority,
} from "@/types";
import type {
  PainelMapaResponse,
  PainelMapaTecnico,
  PainelMapaVistoria,
} from "@/types/painel-mapa";

/**
 * Mapeia o nome do status_vistoria_dropdown (GLPI) para AdminStatus do front.
 *
 * Como ainda não temos os 6 valores no banco (migration pendente), derivamos
 * do dropdown atual + flag is_repeat:
 *
 *   sem status OU "Pendente"     → A_VISTORIAR
 *   sem status + tem técnico     → EM_VISTORIA (heurística)
 *   "Em análise" / "Finalizada"  → VISTORIADO
 *   "Reprovada" + !is_repeat     → AGUARDANDO_REVISITA
 *   "Reprovada" + is_repeat      → EM_REVISITA   (após reatribuição)
 *   "Aprovada"                   → REVISITADO se foi revisita, senão VISTORIADO
 */
function resolveAdminStatus(
  statusName: string | null,
  isRepeat: boolean,
  hasTecnico: boolean
): AdminStatus {
  const s = (statusName ?? "").trim().toLowerCase();
  if (s === "" || s === "pendente") {
    return hasTecnico ? "EM_VISTORIA" : "A_VISTORIAR";
  }
  if (s === "em campo") return "EM_VISTORIA";
  if (s === "em análise" || s === "em analise" || s === "finalizada" || s === "finalizado") {
    return isRepeat ? "REVISITADO" : "VISTORIADO";
  }
  if (s === "reprovada" || s === "reprovado") return isRepeat ? "EM_REVISITA" : "AGUARDANDO_REVISITA";
  if (s === "aprovada" || s === "aprovado") return isRepeat ? "REVISITADO" : "VISTORIADO";
  // fallback: a vistoriar
  return "A_VISTORIAR";
}

interface StatsRow {
  status_name: string | null;
  is_repeat: number | null;
  tecnico_id: number | null;
  total: number;
}

/**
 * Agrega KPIs do painel.
 *
 * Estratégia: faz JOIN entre NE × Fields × Status × Aux e GROUP BY pelas
 * dimensões que afetam o AdminStatus (status_name, is_repeat, has_tecnico).
 * Depois resolve cada bucket em JS e soma nos slots do PainelStats.
 */
export async function fetchPainelStats(): Promise<PainelStats> {
  const rows = await query<StatsRow>(
    `
      SELECT
        sv.name AS status_name,
        COALESCE(aux.is_repeat, 0) AS is_repeat,
        f.users_id_vistoriadorafield AS tecnico_id,
        COUNT(*) AS total
      FROM \`${TABLE_NE}\` ne
      INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
      LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
              ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
      LEFT JOIN \`${TABLE_AUX}\` aux
              ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
      WHERE ne.is_deleted = 0
      GROUP BY sv.name, COALESCE(aux.is_repeat,0), f.users_id_vistoriadorafield
    `
  );

  let pendentes = 0;
  let emVistoria = 0;
  let vistoriadas = 0;
  let aguardandoRevisita = 0;
  let emRevisita = 0;
  let revisitadas = 0;
  let reprovadasMes = 0;
  for (const r of rows) {
    const isRepeat = Number(r.is_repeat) === 1;
    const hasTecnico = r.tecnico_id != null && Number(r.tecnico_id) > 0;
    const st = resolveAdminStatus(r.status_name, isRepeat, hasTecnico);
    const n = Number(r.total) || 0;
    switch (st) {
      case "A_VISTORIAR":
        pendentes += n;
        break;
      case "EM_VISTORIA":
        emVistoria += n;
        break;
      case "VISTORIADO":
        vistoriadas += n;
        break;
      case "AGUARDANDO_REVISITA":
        aguardandoRevisita += n;
        reprovadasMes += n;
        break;
      case "EM_REVISITA":
        emRevisita += n;
        break;
      case "REVISITADO":
        revisitadas += n;
        break;
    }
  }

  // Tecnicos ativos: grupo VistoMap-Tecnicos (count) e municipios distinct.
  const tecnicoGroup =
    process.env.GLPI_VISTOMAP_GROUP ?? "VistoMap-Tecnicos";
  const tecnicoGroupAlt =
    tecnicoGroup === "VistoMap-Tecnicos" ? "VistoMap-Técnicos" : "VistoMap-Tecnicos";
  const [tecCountRow] = await query<{ total: number }>(
    `
      SELECT COUNT(DISTINCT u.id) AS total
        FROM \`${TABLE_USERS}\` u
        INNER JOIN glpi_groups_users gu ON gu.users_id = u.id
        INNER JOIN glpi_groups g ON g.id = gu.groups_id AND g.name IN (?, ?)
       WHERE u.is_deleted = 0 AND u.is_active = 1
    `,
    [tecnicoGroup, tecnicoGroupAlt]
  );
  const tecnicosAtivos = tecCountRow?.total ?? 0;

  const [muniRow] = await query<{ total: number }>(
    `
      SELECT COUNT(DISTINCT TRIM(f.municipiofield)) AS total
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
       WHERE f.municipiofield IS NOT NULL AND TRIM(f.municipiofield) <> ''
    `
  );
  const municipiosAtivos = muniRow?.total ?? 0;

  const [pdfRow] = await query<{ total: number }>(
    `
      SELECT COUNT(*) AS total
        FROM \`${TABLE_AUX}\`
       WHERE project_status = 'GERADO'
    `
  );
  const pdfsGerados = pdfRow?.total ?? 0;

  return {
    pendentes,
    emVistoria,
    vistoriadas,
    aguardandoRevisita,
    emRevisita,
    revisitadas,
    reprovadasMes,
    municipiosAtivos,
    tecnicosAtivos,
    pdfsGerados,
    ultimaSincronizacao: new Date().toISOString(),
  };
}

/* ── Técnicos ───────────────────────────────────────────────────── */

interface TecnicoRow {
  id: number;
  name: string;
  firstname: string | null;
  realname: string | null;
  email: string | null;
  atribuidas: number;
  concluidasHoje: number;
  ultima_atividade: string | null;
}

export async function fetchTecnicos(): Promise<TecnicoAtivo[]> {
  const group = process.env.GLPI_VISTOMAP_GROUP ?? "VistoMap-Tecnicos";
  const groupAlt = group === "VistoMap-Tecnicos" ? "VistoMap-Técnicos" : "VistoMap-Tecnicos";
  const rows = await query<TecnicoRow>(
    `
      SELECT
        u.id,
        u.name,
        u.firstname,
        u.realname,
        (
          SELECT email
            FROM glpi_useremails
           WHERE users_id = u.id
        ORDER BY is_default DESC, id ASC
           LIMIT 1
        ) AS email,
        (
          SELECT COUNT(*) FROM \`${TABLE_FIELDS}\` f
            INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
            LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                   ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
           WHERE f.users_id_vistoriadorafield = u.id
             AND (sv.name IS NULL OR sv.name NOT IN ('Aprovada','Aprovado','Em análise','Em analise','Finalizada','Finalizado'))
        ) AS atribuidas,
        (
          SELECT COUNT(*) FROM \`${TABLE_FIELDS}\` f2
            INNER JOIN \`${TABLE_NE}\` ne2 ON ne2.id = f2.items_id AND ne2.is_deleted = 0
            LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv2
                   ON sv2.id = f2.plugin_fields_statusvistoriafielddropdowns_id
           WHERE f2.users_id_vistoriadorafield = u.id
             AND sv2.name IN ('Em análise','Em analise','Finalizada','Finalizado','Aprovada','Aprovado')
             AND DATE(f2.datadavistoriafield) = CURDATE()
        ) AS concluidasHoje,
        (
          SELECT MAX(f3.datadavistoriafield)
            FROM \`${TABLE_FIELDS}\` f3
           WHERE f3.users_id_vistoriadorafield = u.id
        ) AS ultima_atividade
      FROM \`${TABLE_USERS}\` u
      INNER JOIN glpi_groups_users gu ON gu.users_id = u.id
      INNER JOIN glpi_groups g ON g.id = gu.groups_id AND g.name IN (?, ?)
      WHERE u.is_deleted = 0 AND u.is_active = 1
      GROUP BY u.id
      ORDER BY atribuidas DESC, u.name ASC
    `,
    [group, groupAlt]
  );

  // Determina municipio "atual" do técnico (primeira vistoria atribuída pendente).
  const ids = rows.map((r) => r.id);
  let municipios = new Map<number, string>();
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    const muniRows = await query<{ tec: number; muni: string }>(
      `
        SELECT f.users_id_vistoriadorafield AS tec, TRIM(f.municipiofield) AS muni
          FROM \`${TABLE_FIELDS}\` f
         WHERE f.users_id_vistoriadorafield IN (${placeholders})
           AND f.municipiofield IS NOT NULL
           AND TRIM(f.municipiofield) <> ''
         GROUP BY f.users_id_vistoriadorafield, TRIM(f.municipiofield)
      `,
      ids
    );
    // Pega primeiro municipio por técnico (poderia ser mais distinct, mas serve).
    for (const m of muniRows) {
      if (!municipios.has(m.tec)) municipios.set(m.tec, m.muni);
    }
  }

  // Último ping GPS por técnico (se tabela existir).
  // Fallback silencioso: mantém heurística antiga por atividade de vistoria.
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
    const nome =
      `${r.firstname ?? ""} ${r.realname ?? ""}`.trim() || r.name;
    const ultimaAtividadeRef = ultimoPingGps.get(r.id) ?? r.ultima_atividade ?? null;
    const ultimaMs = ultimaAtividadeRef
      ? new Date(ultimaAtividadeRef).getTime()
      : 0;
    const minutesSince = ultimaMs ? (Date.now() - ultimaMs) / 60_000 : Infinity;
    // Heurística orientada a GPS:
    // <2min em-campo, <15min base, <90min off-shift, senão offline.
    const status: TecnicoAtivo["status"] =
      minutesSince < 2
        ? "em-campo"
        : minutesSince < 15
        ? "base"
        : minutesSince < 90
        ? "off-shift"
        : "offline";
    return {
      id: String(r.id),
      nome,
      email: r.email ?? undefined,
      status,
      municipio: municipios.get(r.id),
      atribuidas: Number(r.atribuidas) || 0,
      concluidasHoje: Number(r.concluidasHoje) || 0,
      ultimaAtividade: ultimaAtividadeRef ?? undefined,
    };
  });
}

/* ── Revisitas pendentes ────────────────────────────────────────── */

interface RevisitaRow {
  id: number;
  name: string;
  municipio: string | null;
  motivo: string | null;
  data_vistoria: string | null;
  status_name: string | null;
  tecnico_id: number | null;
  tecnico_name: string | null;
  tecnico_firstname: string | null;
  tecnico_realname: string | null;
  pdf_path: string | null;
}

export async function fetchRevisitasPendentes(): Promise<RevisitaPendente[]> {
  // Inclui:
  //  • Reprovadas pela 1ª vez (is_repeat=0) → AGUARDANDO_REVISITA
  //  • Em revisita em andamento (is_repeat=1) sem status final
  // Exclui: Aprovada/Em análise/Finalizada (essas já saíram da fila).
  const rows = await query<RevisitaRow>(
    `
      SELECT
        ne.id,
        ne.name,
        f.municipiofield AS municipio,
        f.motivofield AS motivo,
        f.datadavistoriafield AS data_vistoria,
        sv.name AS status_name,
        u.id AS tecnico_id,
        u.name AS tecnico_name,
        u.firstname AS tecnico_firstname,
        u.realname AS tecnico_realname,
        aux.pdf_path
      FROM \`${TABLE_NE}\` ne
      INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
      LEFT JOIN \`${TABLE_AUX}\` aux
              ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
      LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
              ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
      LEFT JOIN \`${TABLE_USERS}\` u
              ON u.id = f.users_id_vistoriadorafield
      WHERE ne.is_deleted = 0
        AND (
              -- Situacao operacional explicita (campo novo): aguardando ou em revisita
              f.\`${SITUACAO_COLUMN}\` IN (?, ?)
              -- OU statusvistoria = Reprovado e ainda nao foi aprovado
           OR sv.name IN ('Reprovada','Reprovado')
              -- OU flag is_repeat=1 sem status final
           OR (
                COALESCE(aux.is_repeat, 0) = 1
            AND (sv.name IS NULL OR sv.name NOT IN ('Aprovada','Aprovado','Em análise','Em analise','Finalizada','Finalizado'))
              )
        )
        -- Sempre exclui aprovados (qualquer caminho)
        AND (sv.name IS NULL OR sv.name NOT IN ('Aprovada','Aprovado'))
        AND COALESCE(aux.approval_status, '') <> 'APROVADO'
      ORDER BY f.datadavistoriafield DESC
      LIMIT 100
    `,
    [SITUACAO_AGUARDANDO_REVISITA, SITUACAO_EM_REVISITA]
  );

  return rows.map((r) => {
    const prioridade: VistoriaPriority = "MEDIA"; // sem fonte real ainda
    const tecnicoNome = r.tecnico_id
      ? `${r.tecnico_firstname ?? ""} ${r.tecnico_realname ?? ""}`.trim() ||
        r.tecnico_name ||
        "—"
      : undefined;
    return {
      id: `rev-${r.id}`,
      equipamento: r.name,
      glpiId: `NE-${r.id}`,
      municipio: r.municipio ?? "—",
      motivoReprovacao: r.motivo?.trim() || "Motivo não informado.",
      reprovadoEm: r.data_vistoria ?? new Date().toISOString(),
      reprovadoPor: "Auditoria Concessionária",
      tecnicoAtribuido: r.tecnico_id
        ? { id: String(r.tecnico_id), nome: tecnicoNome! }
        : undefined,
      prioridade,
      pdfAnteriorPath: r.pdf_path ?? undefined,
    };
  });
}

/* ── Fila completa de vistorias (admin) ────────────────────────── */

export interface FilaItem {
  id: number;
  glpiId: string;
  equipamento: string;
  municipio: string;
  endereco: string | null;
  status: AdminStatus;
  isRepeat: boolean;
  motivoReprovacao: string | null;
  latitude: number | null;
  longitude: number | null;
  dataVistoria: string | null;
  tecnico: { id: number; nome: string } | null;
}

export interface FilaFilters {
  status?: AdminStatus;
  municipio?: string;
  tecnico_id?: number;
  is_repeat?: boolean;
  query?: string;
  limit?: number;
  offset?: number;
}

interface FilaRow {
  id: number;
  name: string;
  municipio: string | null;
  endereco: string | null;
  motivo: string | null;
  status_name: string | null;
  is_repeat: number | null;
  tecnico_id: number | null;
  tecnico_name: string | null;
  tecnico_firstname: string | null;
  tecnico_realname: string | null;
  latitude: string | null;
  longitude: string | null;
  data_vistoria: string | null;
}

/**
 * Fila completa de vistorias — base para /painel/vistorias.
 * Filtros opcionais aplicados em SQL; ordenação por status pendente primeiro,
 * depois data mais recente.
 */
export async function fetchFilaVistorias(
  filtros: FilaFilters = {}
): Promise<FilaItem[]> {
  const where: string[] = ["ne.is_deleted = 0"];
  const params: unknown[] = [];

  if (filtros.municipio) {
    where.push("TRIM(f.municipiofield) = ?");
    params.push(filtros.municipio.trim());
  }
  if (filtros.tecnico_id != null) {
    where.push("f.users_id_vistoriadorafield = ?");
    params.push(filtros.tecnico_id);
  }
  if (filtros.is_repeat === true) {
    where.push("COALESCE(aux.is_repeat,0) = 1");
  } else if (filtros.is_repeat === false) {
    where.push("COALESCE(aux.is_repeat,0) = 0");
  }
  if (filtros.query) {
    where.push(
      "(ne.name LIKE ? OR f.municipiofield LIKE ? OR f.endereofield LIKE ?)"
    );
    const q = `%${filtros.query}%`;
    params.push(q, q, q);
  }

  const limit = Math.min(Math.max(filtros.limit ?? 200, 1), 500);
  const offset = Math.max(filtros.offset ?? 0, 0);

  const rows = await query<FilaRow>(
    `
      SELECT
        ne.id,
        ne.name,
        f.municipiofield AS municipio,
        f.endereofield AS endereco,
        f.motivofield AS motivo,
        sv.name AS status_name,
        COALESCE(aux.is_repeat, 0) AS is_repeat,
        f.users_id_vistoriadorafield AS tecnico_id,
        u.name AS tecnico_name,
        u.firstname AS tecnico_firstname,
        u.realname AS tecnico_realname,
        f.latitudefield AS latitude,
        f.longitudefield AS longitude,
        f.datadavistoriafield AS data_vistoria
      FROM \`${TABLE_NE}\` ne
      INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
      LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
              ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
      LEFT JOIN \`${TABLE_AUX}\` aux
              ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
      LEFT JOIN \`${TABLE_USERS}\` u
              ON u.id = f.users_id_vistoriadorafield
      WHERE ${where.join(" AND ")}
      ORDER BY
        CASE WHEN sv.name IS NULL OR sv.name = 'Pendente' THEN 0
             WHEN sv.name IN ('Reprovada','Reprovado') THEN 1
             ELSE 2 END,
        f.datadavistoriafield DESC,
        ne.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    params
  );

  const items: FilaItem[] = rows.map((r) => {
    const isRepeat = Number(r.is_repeat) === 1;
    const hasTecnico = r.tecnico_id != null && Number(r.tecnico_id) > 0;
    const status = resolveAdminStatus(r.status_name, isRepeat, hasTecnico);
    const tecnicoNome = hasTecnico
      ? `${r.tecnico_firstname ?? ""} ${r.tecnico_realname ?? ""}`.trim() ||
        r.tecnico_name ||
        "—"
      : null;
    const parseCoord = (s: string | null): number | null => {
      if (s == null || String(s).trim() === "") return null;
      const n = Number(String(s).replace(",", "."));
      return Number.isFinite(n) && n !== 0 ? n : null;
    };
    return {
      id: r.id,
      glpiId: `NE-${r.id}`,
      equipamento: r.name,
      municipio: r.municipio?.trim() ?? "—",
      endereco: r.endereco?.trim() ?? null,
      status,
      isRepeat,
      motivoReprovacao: r.motivo?.trim() ?? null,
      latitude: parseCoord(r.latitude),
      longitude: parseCoord(r.longitude),
      dataVistoria: r.data_vistoria,
      tecnico: hasTecnico
        ? { id: Number(r.tecnico_id), nome: tecnicoNome! }
        : null,
    };
  });

  // Filtro de status admin é feito em JS (deriva do dropdown × is_repeat).
  return filtros.status
    ? items.filter((i) => i.status === filtros.status)
    : items;
}

/* ── Atualizar campos de vistoria (admin edita) ─────────────────── */

export interface AtualizarCamposInput {
  endereofield?: string;
  motivofield?: string;
  alturadaantenafield?: string;
  aterramentofield?: string;
  intensidadedesinalfield?: string;
  velocidadefield?: string;
  observaofield?: string;
}

const EDITAVEL_COLS = new Set<keyof AtualizarCamposInput>([
  "endereofield",
  "motivofield",
  "alturadaantenafield",
  "aterramentofield",
  "intensidadedesinalfield",
  "velocidadefield",
  "observaofield",
]);

export async function atualizarCamposVistoria(
  vistoriaId: number,
  input: AtualizarCamposInput,
  marcarProjetoPendente = false
): Promise<{ affected: number; before: AtualizarCamposInput }> {
  // Snapshot ANTES (pra diff de auditoria).
  const beforeRows = await query<AtualizarCamposInput>(
    `SELECT ${[...EDITAVEL_COLS].join(",")}
       FROM \`${TABLE_FIELDS}\`
      WHERE items_id = ? LIMIT 1`,
    [vistoriaId]
  );
  const before = beforeRows[0] ?? {};

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (!EDITAVEL_COLS.has(k as keyof AtualizarCamposInput)) continue;
    if (v == null) continue;
    sets.push(`\`${k}\` = ?`);
    params.push(v);
  }
  if (sets.length === 0) return { affected: 0, before };

  params.push(vistoriaId);
  const result = await execute(
    `UPDATE \`${TABLE_FIELDS}\` SET ${sets.join(", ")} WHERE items_id = ?`,
    params
  );

  if (marcarProjetoPendente) {
    await execute(
      `UPDATE \`${TABLE_AUX}\`
          SET project_status = 'PENDENTE'
        WHERE items_id = ? AND itemtype = '${ITEMTYPE_NE}'`,
      [vistoriaId]
    );
  }
  return { affected: result.affectedRows, before };
}

/* ── Aprovar / Reprovar (admin) ──────────────────────────────────── */

function nowDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" + pad(d.getMonth() + 1) +
    "-" + pad(d.getDate()) +
    " " + pad(d.getHours()) +
    ":" + pad(d.getMinutes()) +
    ":" + pad(d.getSeconds())
  );
}

/**
 * Aprova uma vistoria (admin internamente, antes do envio à CPFL).
 *
 * Comportamento alinhado ao fluxo operacional real:
 *   - statusvistoria = Em Análise (5)
 *   - situaodavistoria = Revisitado (6) — caso encerrado pelo admin
 *   - pendencia = Pendência CPFL (1)
 *   - datadavistoriafield = agora
 *   - dataenvioconcessionriafield = agora
 *   - NÃO preenche dataaprovaoconcessionria (esse campo é da CPFL)
 *   - aux.approval_status = 'APROVADO'; is_repeat = 0 (sai da fila revisitas)
 */
export async function aprovarVistoria(vistoriaId: number): Promise<{
  affected: number;
  eraRevisita: boolean;
}> {
  const [auxRow] = await query<{ is_repeat: number }>(
    `SELECT COALESCE(is_repeat,0) AS is_repeat
       FROM \`${TABLE_AUX}\`
      WHERE items_id = ? AND itemtype = '${ITEMTYPE_NE}' LIMIT 1`,
    [vistoriaId]
  );
  const eraRevisita = Number(auxRow?.is_repeat ?? 0) === 1;
  const now = nowDateTime();

  const r = await execute(
    `UPDATE \`${TABLE_FIELDS}\`
        SET plugin_fields_statusvistoriafielddropdowns_id = ?,
            plugin_fields_pendnciafielddropdowns_id = ?,
            \`${SITUACAO_COLUMN}\` = ?,
            datadavistoriafield = ?,
            dataenvioconcessionriafield = ?
      WHERE items_id = ?`,
    [
      STATUS_VISTORIA_EM_ANALISE,
      PENDENCIA_CPFL,
      SITUACAO_REVISITADO,
      now,
      now,
      vistoriaId,
    ]
  );

  // Aux: marca como aprovado internamente + remove flag revisita.
  await execute(
    `UPDATE \`${TABLE_AUX}\`
        SET approval_status = 'APROVADO',
            is_repeat = 0,
            approved_at = NOW(),
            project_status = 'PENDENTE'
      WHERE items_id = ? AND itemtype = '${ITEMTYPE_NE}'`,
    [vistoriaId]
  );

  return { affected: r.affectedRows, eraRevisita };
}

/**
 * Reprova uma vistoria → vai pra fila de revisitas:
 *   - statusvistoria = Reprovado (4)
 *   - situaodavistoria = Aguardando Revisita (4)
 *   - aux.approval_status = 'REPROVADO'
 *   - aux.is_repeat = 1
 */
export async function reprovarVistoria(
  vistoriaId: number,
  motivo?: string
): Promise<{ affected: number }> {
  const sets: string[] = [
    "plugin_fields_statusvistoriafielddropdowns_id = ?",
    `\`${SITUACAO_COLUMN}\` = ?`,
  ];
  const params: unknown[] = [STATUS_VISTORIA_REPROVADO, SITUACAO_AGUARDANDO_REVISITA];
  if (motivo != null) {
    sets.push("motivofield = ?");
    params.push(motivo);
  }
  params.push(vistoriaId);
  const r = await execute(
    `UPDATE \`${TABLE_FIELDS}\` SET ${sets.join(", ")} WHERE items_id = ?`,
    params
  );

  // Aux: marca como revisita + project_status PENDENTE p/ worker regerar PDF.
  await execute(
    `UPDATE \`${TABLE_AUX}\`
        SET approval_status = 'REPROVADO',
            is_repeat = 1,
            project_status = 'PENDENTE'
      WHERE items_id = ? AND itemtype = '${ITEMTYPE_NE}'`,
    [vistoriaId]
  );

  return { affected: r.affectedRows };
}

/* ── Atribuir vistoria a técnico ────────────────────────────────── */

/**
 * Atribui vistoria a um técnico + ajusta situação operacional.
 *
 *   - users_id_vistoriadorafield = tecnicoId
 *   - situaodavistoria:
 *       • Em Revisita (5) se aux.is_repeat=1
 *       • Em Vistoria (2) caso contrário
 *   - Opcional: project_status='PENDENTE' (worker regera PDF)
 */
export async function atribuirVistoria(
  vistoriaId: number,
  tecnicoId: number,
  marcarProjetoPendente: boolean
): Promise<{ affected: number; situacao: number }> {
  // Detecta se é revisita pra decidir situação.
  const [auxRow] = await query<{ is_repeat: number }>(
    `SELECT COALESCE(is_repeat,0) AS is_repeat
       FROM \`${TABLE_AUX}\`
      WHERE items_id = ? AND itemtype = '${ITEMTYPE_NE}' LIMIT 1`,
    [vistoriaId]
  );
  const eraRevisita = Number(auxRow?.is_repeat ?? 0) === 1;
  const situacao = eraRevisita ? SITUACAO_EM_REVISITA : SITUACAO_EM_VISTORIA;

  const r = await execute(
    `UPDATE \`${TABLE_FIELDS}\`
        SET users_id_vistoriadorafield = ?,
            \`${SITUACAO_COLUMN}\` = ?
      WHERE items_id = ?`,
    [tecnicoId, situacao, vistoriaId]
  );
  if (marcarProjetoPendente) {
    await execute(
      `UPDATE \`${TABLE_AUX}\`
          SET project_status = 'PENDENTE'
        WHERE items_id = ? AND itemtype = '${ITEMTYPE_NE}'`,
      [vistoriaId]
    );
  }
  return { affected: r.affectedRows, situacao };
}

/* ── Mapa operacional (tempo real) ─────────────────────────────── */

interface MapaTecnicoRow {
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
  em_vistoria_count: number;
  revisita_count: number;
  ativos_count: number;
  municipios_ativos: number;
}

interface MapaVistoriaRow {
  id: number;
  equipamento: string;
  municipio: string | null;
  latitude: number;
  longitude: number;
  status_name: string | null;
  is_repeat: number;
  tecnico_id: number | null;
}

function resolveMapaVistoriaStatus(
  statusName: string | null,
  isRepeat: boolean
): PainelMapaVistoria["status"] {
  const s = (statusName ?? "").trim().toLowerCase();
  if (isRepeat) return "REVISITA";
  if (s === "reprovada" || s === "reprovado") return "REPROVADO";
  if (s === "em campo") return "EM_VISTORIA";
  if (
    s === "aprovada" ||
    s === "finalizada" ||
    s === "em análise" ||
    s === "em analise"
  ) {
    return "VISTORIADO";
  }
  return "A_VISTORIAR";
}

function resolveMapaTecnicoStatus(
  minutosAtras: number | null,
  emVistoriaCount: number,
  speedKmh: number | null
): PainelMapaTecnico["status_operacional"] {
  if (minutosAtras == null || minutosAtras > 20) return "offline";
  if (emVistoriaCount > 0) return "em-vistoria";
  if ((speedKmh ?? 0) >= 3 || minutosAtras < 2) return "em-operacao";
  return "parado";
}

export async function fetchPainelMapa(): Promise<PainelMapaResponse> {
  const group = process.env.GLPI_VISTOMAP_GROUP ?? "VistoMap-Tecnicos";
  const groupAlt =
    group === "VistoMap-Tecnicos" ? "VistoMap-Técnicos" : "VistoMap-Tecnicos";

  const tecnicosRows = await query<MapaTecnicoRow>(
    `
      SELECT
        u.id AS users_id,
        u.firstname,
        u.realname,
        u.name AS username,
        (
          SELECT email
          FROM glpi_useremails ue
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
          LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
            ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
          WHERE f.users_id_vistoriadorafield = u.id
            AND COALESCE(sv.name, 'Pendente') IN ('Em campo', 'Pendente')
        ) AS ativos_count,
        (
          SELECT COUNT(*)
          FROM \`${TABLE_FIELDS}\` f
          LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
            ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
          WHERE f.users_id_vistoriadorafield = u.id
            AND COALESCE(sv.name, '') IN ('Em campo')
        ) AS em_vistoria_count,
        (
          SELECT COUNT(*)
          FROM \`${TABLE_FIELDS}\` f
          INNER JOIN \`${TABLE_AUX}\` aux
            ON aux.items_id = f.items_id AND aux.itemtype = '${ITEMTYPE_NE}'
          WHERE f.users_id_vistoriadorafield = u.id
            AND COALESCE(aux.is_repeat, 0) = 1
        ) AS revisita_count,
        (
          SELECT COUNT(DISTINCT TRIM(f.municipiofield))
          FROM \`${TABLE_FIELDS}\` f
          WHERE f.users_id_vistoriadorafield = u.id
            AND f.municipiofield IS NOT NULL
            AND TRIM(f.municipiofield) <> ''
        ) AS municipios_ativos
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
      ORDER BY u.name ASC
    `,
    [group, groupAlt]
  );

  const vistoriasRows = await query<MapaVistoriaRow>(
    `
      SELECT
        ne.id,
        ne.name AS equipamento,
        f.municipiofield AS municipio,
        REPLACE(f.latitudefield, ',', '.') + 0.0 AS latitude,
        REPLACE(f.longitudefield, ',', '.') + 0.0 AS longitude,
        sv.name AS status_name,
        COALESCE(aux.is_repeat, 0) AS is_repeat,
        f.users_id_vistoriadorafield AS tecnico_id
      FROM \`${TABLE_NE}\` ne
      INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
      LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
        ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
      LEFT JOIN \`${TABLE_AUX}\` aux
        ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
      WHERE ne.is_deleted = 0
        AND f.latitudefield IS NOT NULL AND f.longitudefield IS NOT NULL
        AND TRIM(f.latitudefield) <> '' AND TRIM(f.longitudefield) <> ''
        AND REPLACE(f.latitudefield, ',', '.') + 0.0 <> 0
        AND REPLACE(f.longitudefield, ',', '.') + 0.0 <> 0
      LIMIT 3000
    `
  );

  const now = Date.now();
  const tecnicos: PainelMapaTecnico[] = tecnicosRows.map((r) => {
    const nome = `${r.firstname ?? ""} ${r.realname ?? ""}`.trim() || r.username;
    const minutos = r.created_at
      ? Math.round((now - new Date(r.created_at).getTime()) / 60000)
      : null;
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
      status_operacional: resolveMapaTecnicoStatus(
        minutos,
        Number(r.em_vistoria_count) || 0,
        r.speed_kmh
      ),
      municipios_ativos: Number(r.municipios_ativos) || 0,
      vistorias_ativas: Number(r.ativos_count) || 0,
      revisitas_ativas: Number(r.revisita_count) || 0,
    };
  });

  const vistorias: PainelMapaVistoria[] = vistoriasRows.map((r) => {
    const isRevisita = Number(r.is_repeat) === 1;
    return {
      id: r.id,
      equipamento: r.equipamento,
      municipio: r.municipio,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      status: resolveMapaVistoriaStatus(r.status_name, isRevisita),
      is_revisita: isRevisita,
      tecnico_id: r.tecnico_id,
    };
  });

  return {
    tecnicos,
    vistorias,
    generated_at: new Date().toISOString(),
  };
}
