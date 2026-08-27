import "server-only";
import { execute, query } from "@/lib/db";
import {
  AVALIADOR_CPFL_USER_COLUMN,
  DROPDOWN_COLUMNS,
  DROPDOWN_TABLES,
  ITEMTYPE_NE,
  PENDENCIA_CPFL,
  SITUACAO_A_VISTORIAR,
  SITUACAO_AGUARDANDO_REVISITA,
  SITUACAO_COLUMN,
  SITUACAO_DEVOLVIDA,
  SITUACAO_EM_DESLOCAMENTO,
  SITUACAO_EM_REVISITA,
  SITUACAO_EM_VISTORIA,
  SITUACAO_REVISITADO,
  STATUS_VISTORIA_PENDENTE,
  STATUS_VISTORIA_EM_ANALISE,
  STATUS_VISTORIA_REPROVADO,
  TABLE_AUX,
  TABLE_PROJETOS_PLUGIN,
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
 * Mapeia situaodavistoriafield (1-6) + heurística de dropdown para AdminStatus.
 *
 * Prioridade 1: campo situaodavistoriafield quando preenchido (1=A_VISTORIAR … 6=REVISITADO).
 * Prioridade 2: heurística pelo nome do dropdown statusvistoria (legado / fallback).
 */
function resolveAdminStatus(
  statusName: string | null,
  isRepeat: boolean,
  hasTecnico: boolean,
  situacaoId?: number | null
): AdminStatus {
  // 1ª prioridade: campo nativo (migration aplicada)
  switch (Number(situacaoId ?? 0)) {
    case 1: return "A_VISTORIAR";
    case 2: return "EM_VISTORIA";
    case 3: return "VISTORIADO";
    case 4: return "AGUARDANDO_REVISITA";
    case 5: return "EM_REVISITA";
    case 6: return "REVISITADO";
    case 8: return "DEVOLVIDA";
  }
  // 2ª prioridade: heurística pelo dropdown (fallback para registros sem o campo)
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
  return "A_VISTORIAR";
}

interface StatsRow {
  status_name: string | null;
  is_repeat: number | null;
  tecnico_id: number | null;
  situacao_id: number | null;
  total: number;
}

/**
 * Agrega KPIs do painel.
 *
 * Estratégia: faz JOIN entre NE × Fields × Status × Aux e GROUP BY pelas
 * dimensões que afetam o AdminStatus (status_name, is_repeat, has_tecnico,
 * situacao_id). Depois resolve cada bucket em JS e soma nos slots do
 * PainelStats.
 *
 * situacao_id (campo nativo `situaodavistoriafield`) entra como prioridade 1
 * em resolveAdminStatus — sem ele, vistorias com o dropdown `statusvistoria`
 * legado vazio/desatualizado mas já concluídas via situação nova ficavam de
 * fora da contagem de "Concluídas" (o card mostrava menos do que o real,
 * divergindo de /painel/realizadas, que já cruzava os dois campos).
 */
export async function fetchPainelStats(): Promise<PainelStats> {
  const rows = await query<StatsRow>(
    `
      SELECT
        sv.name AS status_name,
        COALESCE(aux.is_repeat, 0) AS is_repeat,
        f.users_id_vistoriadorafield AS tecnico_id,
        f.\`${SITUACAO_COLUMN}\` AS situacao_id,
        COUNT(*) AS total
      FROM \`${TABLE_NE}\` ne
      INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
      LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
              ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
      LEFT JOIN \`${TABLE_AUX}\` aux
              ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
      WHERE ne.is_deleted = 0
      GROUP BY sv.name, COALESCE(aux.is_repeat,0), f.users_id_vistoriadorafield, f.\`${SITUACAO_COLUMN}\`
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
    const st = resolveAdminStatus(r.status_name, isRepeat, hasTecnico, r.situacao_id);
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

  // Devolvidas (situação 8) e rejeitadas (recusa aprovada) — não caem no
  // GROUP BY de status acima (que não olha situacao_id), então contamos à
  // parte pra alimentar o gráfico de distribuição do pipeline.
  const [devolRow] = await query<{ total: number }>(
    `
      SELECT COUNT(*) AS total
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
       WHERE f.\`${SITUACAO_COLUMN}\` = ?
    `,
    [SITUACAO_DEVOLVIDA]
  );
  const devolvidas = devolRow?.total ?? 0;

  let rejeitadas = 0;
  try {
    const [rejRow] = await query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM \`glpi_plugin_vistomap_recusas\` WHERE status = 'APROVADO'`
    );
    rejeitadas = rejRow?.total ?? 0;
  } catch {
    /* tabela de recusas pode não existir em dev — mantém 0 */
  }

  // Atividade das últimas 24h a partir do audit log (dado real, com ts).
  // atribuidas24h = quantas SAÍRAM do backlog; finalizadas24h = throughput.
  let atribuidas24h = 0;
  let finalizadas24h = 0;
  try {
    const rows24h = await query<{ acao: string; total: number }>(
      `
        SELECT acao, COUNT(DISTINCT alvo_id) AS total
          FROM \`glpi_plugin_vistomap_audit\`
         WHERE acao IN ('vistoria-atribuida', 'vistoria-finalizada')
           AND alvo_tipo = 'vistoria'
           AND ts >= NOW() - INTERVAL 24 HOUR
         GROUP BY acao
      `
    );
    for (const r of rows24h) {
      if (r.acao === "vistoria-atribuida") atribuidas24h = Number(r.total) || 0;
      if (r.acao === "vistoria-finalizada") finalizadas24h = Number(r.total) || 0;
    }
  } catch {
    /* tabela de audit pode não existir em dev — mantém 0 */
  }

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
    devolvidas,
    rejeitadas,
    atribuidas24h,
    finalizadas24h,
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
    // <5min em-campo, <30min base, <120min off-shift, senão offline.
    // Thresholds afrouxados pra reduzir flicker entre verde e amarelo.
    const status: TecnicoAtivo["status"] =
      minutesSince < 5
        ? "em-campo"
        : minutesSince < 30
        ? "base"
        : minutesSince < 120
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
  situacao_id: number | null;
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

  const limit = Math.min(Math.max(filtros.limit ?? 200, 1), 10000);
  const offset = Math.max(filtros.offset ?? 0, 0);

  // O status admin (A_VISTORIAR/AGUARDANDO_REVISITA/etc.) so' e' conhecido
  // depois de resolveAdminStatus() em JS (mistura dropdown + is_repeat +
  // situacao_id — regra demais pra replicar 1:1 em SQL sem risco de
  // divergir). Por isso, quando ha filtro de status, NAO aplicamos
  // LIMIT/OFFSET na query — buscamos tudo que bate no WHERE base, filtramos
  // por status em JS, e SO' ENTAO paginamos. Aplicar o LIMIT antes do
  // filtro (como era) cortava resultado por status incompleto sempre que o
  // total de linhas (todas as situacoes somadas) passava do limite — um
  // "A_VISTORIAR" podia nem chegar a ser buscado do banco.
  const applyLimitInSql = !filtros.status;

  const rows = await query<FilaRow>(
    `
      SELECT
        ne.id,
        ne.name,
        f.municipiofield AS municipio,
        f.endereofield AS endereco,
        f.motivofield AS motivo,
        sv.name AS status_name,
        f.\`${SITUACAO_COLUMN}\` AS situacao_id,
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
        CASE WHEN COALESCE(f.\`${SITUACAO_COLUMN}\`, 0) = 1 OR sv.name IS NULL OR sv.name = 'Pendente' THEN 0
             WHEN sv.name IN ('Reprovada','Reprovado') THEN 1
             ELSE 2 END,
        f.datadavistoriafield DESC,
        ne.id DESC
      ${applyLimitInSql ? `LIMIT ${limit} OFFSET ${offset}` : ""}
    `,
    params
  );

  const items: FilaItem[] = rows.map((r) => {
    const isRepeat = Number(r.is_repeat) === 1;
    const hasTecnico = r.tecnico_id != null && Number(r.tecnico_id) > 0;
    const status = resolveAdminStatus(r.status_name, isRepeat, hasTecnico, r.situacao_id);
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
  // Quando ha' filtro, a query acima buscou TUDO (sem LIMIT) — pagina aqui,
  // depois de filtrar, pra nao cortar resultado por status incompleto.
  if (!filtros.status) return items;
  const filtered = items.filter((i) => i.status === filtros.status);
  return filtered.slice(offset, offset + limit);
}

/* ── Atualizar campos de vistoria (admin edita) ─────────────────── */

export interface AtualizarCamposInput {
  endereofield?: string;
  motivofield?: string;
  alturadaantenafield?: string;
  aterramentofield?: string;
  observaofield?: string;
  latitudefield?: string;
  longitudefield?: string;
  pspostefield?: string;
}

const EDITAVEL_COLS = new Set<keyof AtualizarCamposInput>([
  "endereofield",
  "motivofield",
  "alturadaantenafield",
  "aterramentofield",
  "observaofield",
  "latitudefield",
  "longitudefield",
  "pspostefield",
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
export async function aprovarVistoria(
  vistoriaId: number,
  avaliadorId?: number
): Promise<{
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

  const sets = [
    "plugin_fields_statusvistoriafielddropdowns_id = ?",
    "plugin_fields_pendnciafielddropdowns_id = ?",
    `\`${SITUACAO_COLUMN}\` = ?`,
    "datadavistoriafield = ?",
    "dataenvioconcessionriafield = ?",
  ];
  const params: unknown[] = [
    STATUS_VISTORIA_EM_ANALISE,
    PENDENCIA_CPFL,
    SITUACAO_REVISITADO,
    now,
    now,
  ];
  if (avaliadorId != null && avaliadorId > 0) {
    sets.push(`\`${AVALIADOR_CPFL_USER_COLUMN}\` = ?`);
    params.push(avaliadorId);
  }
  params.push(vistoriaId);

  const r = await execute(
    `UPDATE \`${TABLE_FIELDS}\` SET ${sets.join(", ")} WHERE items_id = ?`,
    params
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
  motivo?: string,
  avaliadorId?: number
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
  if (avaliadorId != null && avaliadorId > 0) {
    sets.push(`\`${AVALIADOR_CPFL_USER_COLUMN}\` = ?`);
    params.push(avaliadorId);
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
  // Atribuir só designa o técnico — situação fica "aguardando ele iniciar"
  // (deriva pra "Atribuído" em resolveSituacaoOperacional). Antes pulava
  // direto pra Em Vistoria (2), o que fazia o card aparecer como "Em
  // Vistoria" mesmo sem o técnico ter feito nada — quem avança de verdade
  // pra Em Vistoria é o próprio técnico em POST /api/vistorias/[id]/iniciar
  // (geofence + audit "vistoria-iniciada"). Revisita mantido como estava
  // (situação 5 só é setada aqui hoje; mudar isso é escopo maior, fora do
  // que foi reportado).
  const situacao = eraRevisita ? SITUACAO_EM_REVISITA : SITUACAO_A_VISTORIAR;

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

/**
 * Desvincula técnico de uma vistoria → volta à fila (situação 1 = A Vistoriar).
 */
export async function desvincularVistoria(
  vistoriaId: number
): Promise<{ affected: number; situacao: number }> {
  const r = await execute(
    `UPDATE \`${TABLE_FIELDS}\`
        SET users_id_vistoriadorafield = 0,
            \`${SITUACAO_COLUMN}\` = ?
      WHERE items_id = ?`,
    [SITUACAO_A_VISTORIAR, vistoriaId]
  );
  return { affected: r.affectedRows, situacao: SITUACAO_A_VISTORIAR };
}

/* ── Vistorias Realizadas (auditoria) ───────────────────────────── */

export interface VistoriaRealizada {
  id: number;
  glpiId: string;
  equipamento: string;
  municipio: string;
  endereco: string | null;
  status: "VISTORIADO" | "REVISITADO";
  isRepeat: boolean;
  dataVistoria: string | null;
  dataEnvio: string | null;
  approvedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  tecnico: { id: number; nome: string } | null;
  motivo: string | null;
  alturaAntena: string | null;
  aterramento: string | null;
  rsrpClaro: string | null;
  rsrpVivo: string | null;
  /** Tipo do equipamento (DCU/Repetidor/etc.) — quando "Repetidor", indica
   *  provável zona rural / baixa cobertura de rede (sinalizado pelos
   *  técnicos em campo). */
  tipoEquipamento: string | null;
  observacao: string | null;
  pdfPath: string | null;
  projectStatus: "PENDENTE" | "GERADO" | "ERRO";
  approvalStatus: "APROVADO" | "REPROVADO" | null;
}

export interface RealizadasFilters {
  municipio?: string;
  tecnico_id?: number;
  query?: string;
  status?: "VISTORIADO" | "REVISITADO";
  limit?: number;
  offset?: number;
}

interface RealizadaRow {
  id: number;
  name: string;
  municipio: string | null;
  endereco: string | null;
  motivo: string | null;
  altura_antena: string | null;
  aterramento: string | null;
  rsrp_claro: string | null;
  rsrp_vivo: string | null;
  tipo_equipamento: string | null;
  observacao: string | null;
  data_vistoria: string | null;
  data_envio: string | null;
  latitude: string | null;
  longitude: string | null;
  status_name: string | null;
  situacao_id: number | null;
  is_repeat: number | null;
  project_status: string | null;
  pdf_path: string | null;
  approval_status: string | null;
  approved_at: string | null;
  tecnico_id: number | null;
  tecnico_name: string | null;
  tecnico_firstname: string | null;
  tecnico_realname: string | null;
}

export async function fetchVistoriasRealizadas(
  filtros: RealizadasFilters = {}
): Promise<VistoriaRealizada[]> {
  const where: string[] = [
    "ne.is_deleted = 0",
    `(f.\`${SITUACAO_COLUMN}\` IN (3, 6)
      OR sv.name IN ('Em análise','Em analise','Finalizada','Finalizado','Aprovada','Aprovado')
      OR COALESCE(aux.approval_status,'') = 'APROVADO')`,
  ];
  const params: unknown[] = [];

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

  // Teto de 300 escondia registros: a tela /painel/realizadas pede 2000 e
  // filtra/conta no cliente, mas recebia no máximo 300 — com 311 vistorias,
  // 11 ficavam invisíveis na lista, e os cards com filtro (que contam sobre o
  // que foi carregado) divergiam dos cards sem filtro (que contam no banco).
  // Foi assim que o problema apareceu: 311 sem filtro contra 300 filtrando
  // por "Vistoriado".
  //
  // Este teto vai precisar virar paginação de verdade quando a base crescer;
  // por ora o conjunto é pequeno e carregar tudo é o que a tela espera.
  const limit = Math.min(Math.max(filtros.limit ?? 100, 1), 5000);
  const offset = Math.max(filtros.offset ?? 0, 0);

  const rows = await query<RealizadaRow>(
    `
      SELECT
        ne.id,
        ne.name,
        f.municipiofield       AS municipio,
        f.endereofield         AS endereco,
        f.motivofield          AS motivo,
        f.alturadaantenafield  AS altura_antena,
        f.aterramentofield     AS aterramento,
        f.rsrpifield            AS rsrp_claro,
        f.rsrpllfield           AS rsrp_vivo,
        d_eq.name               AS tipo_equipamento,
        f.observaofield        AS observacao,
        f.datadavistoriafield         AS data_vistoria,
        f.dataenvioconcessionriafield AS data_envio,
        f.latitudefield        AS latitude,
        f.longitudefield       AS longitude,
        sv.name                AS status_name,
        f.\`${SITUACAO_COLUMN}\`              AS situacao_id,
        COALESCE(aux.is_repeat, 0)           AS is_repeat,
        COALESCE(aux.project_status,'PENDENTE') AS project_status,
        aux.pdf_path,
        aux.approval_status,
        aux.approved_at,
        f.users_id_vistoriadorafield AS tecnico_id,
        u.name       AS tecnico_name,
        u.firstname  AS tecnico_firstname,
        u.realname   AS tecnico_realname
      FROM \`${TABLE_NE}\` ne
      INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
      LEFT  JOIN \`${TABLE_STATUS_VISTORIA}\` sv
             ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
      LEFT  JOIN \`${TABLE_AUX}\` aux
             ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
      LEFT  JOIN \`${TABLE_USERS}\` u
             ON u.id = f.users_id_vistoriadorafield
      LEFT  JOIN \`${DROPDOWN_TABLES.equipamento}\` d_eq
             ON d_eq.id = f.${DROPDOWN_COLUMNS.equipamento}
      WHERE ${where.join(" AND ")}
      ORDER BY f.datadavistoriafield DESC, ne.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    params
  );

  const parseCoord = (s: string | null): number | null => {
    if (s == null || String(s).trim() === "") return null;
    const n = Number(String(s).replace(",", "."));
    return Number.isFinite(n) && n !== 0 ? n : null;
  };

  const items = rows.map((r): VistoriaRealizada => {
    const isRepeat = Number(r.is_repeat) === 1;
    const hasTecnico = r.tecnico_id != null && Number(r.tecnico_id) > 0;
    const isRevisitado = Number(r.situacao_id) === 6 || isRepeat;
    const status: VistoriaRealizada["status"] = isRevisitado ? "REVISITADO" : "VISTORIADO";
    const tecnicoNome = hasTecnico
      ? `${r.tecnico_firstname ?? ""} ${r.tecnico_realname ?? ""}`.trim() || r.tecnico_name || "—"
      : null;
    const ps = (r.project_status ?? "PENDENTE").toUpperCase();
    return {
      id: r.id,
      glpiId: `NE-${r.id}`,
      equipamento: r.name,
      municipio: r.municipio?.trim() ?? "—",
      endereco: r.endereco?.trim() ?? null,
      status,
      isRepeat,
      dataVistoria: r.data_vistoria ?? null,
      dataEnvio: r.data_envio ?? null,
      approvedAt: r.approved_at ?? null,
      latitude: parseCoord(r.latitude),
      longitude: parseCoord(r.longitude),
      tecnico: hasTecnico ? { id: Number(r.tecnico_id), nome: tecnicoNome! } : null,
      motivo: r.motivo?.trim() ?? null,
      alturaAntena: r.altura_antena != null ? String(r.altura_antena).trim() || null : null,
      aterramento: r.aterramento != null && Number(r.aterramento) !== 0 ? String(r.aterramento).trim() || null : null,
      rsrpClaro: r.rsrp_claro != null ? String(r.rsrp_claro).trim() || null : null,
      rsrpVivo: r.rsrp_vivo != null ? String(r.rsrp_vivo).trim() || null : null,
      tipoEquipamento: r.tipo_equipamento?.trim() || null,
      observacao: r.observacao != null ? String(r.observacao).trim() || null : null,
      pdfPath: r.pdf_path ?? null,
      projectStatus: (["PENDENTE", "GERADO", "ERRO"].includes(ps) ? ps : "PENDENTE") as VistoriaRealizada["projectStatus"],
      approvalStatus: r.approval_status as VistoriaRealizada["approvalStatus"] ?? null,
    };
  });

  return filtros.status ? items.filter(i => i.status === filtros.status) : items;
}

export interface VistoriasRealizadasStats {
  total: number;
  vistoriados: number;
  revisitados: number;
  pdfsGerados: number;
}

/**
 * "É revisita?" — MESMA regra que a lista aplica por item (ver o mapeamento
 * de `status` em fetchVistoriasRealizadas): conta como revisita quem está com
 * a situação REVISITADO no GLPI **ou** com is_repeat marcado na aux.
 *
 * Alinhamento preventivo, não correção de bug observado: os cards contavam só
 * por is_repeat e a lista usa as duas condições. Hoje isso não muda número
 * nenhum (a base tem zero registros em cada uma das duas condições), mas ter
 * a mesma pergunta respondida de dois jeitos em lugares diferentes é o tipo
 * de coisa que diverge silenciosamente assim que aparecer a primeira
 * revisita de verdade.
 */
const EH_REVISITA_SQL = `(f.\`${SITUACAO_COLUMN}\` = ${SITUACAO_REVISITADO} OR COALESCE(aux.is_repeat,0) = 1)`;

/**
 * Contagens REAIS (sem LIMIT) pra /painel/realizadas — a lista em si é
 * paginada (fetchVistoriasRealizadas usa LIMIT/OFFSET), mas o card de
 * "resultados" não pode derivar de `items.length`: isso mostrava o limite
 * (100) como se fosse o total real sempre que havia mais resultados do que
 * a página buscou. Mesmo WHERE de fetchVistoriasRealizadas (situacao_id
 * IN (3,6) OR status legado OR aprovado), só que agregado direto no banco.
 */
export async function fetchVistoriasRealizadasStats(
  filtros: Pick<RealizadasFilters, "municipio" | "tecnico_id" | "query"> = {}
): Promise<VistoriasRealizadasStats> {
  const where: string[] = [
    "ne.is_deleted = 0",
    `(f.\`${SITUACAO_COLUMN}\` IN (3, 6)
      OR sv.name IN ('Em análise','Em analise','Finalizada','Finalizado','Aprovada','Aprovado')
      OR COALESCE(aux.approval_status,'') = 'APROVADO')`,
  ];
  const params: unknown[] = [];
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

  const [row] = await query<{ total: number; vistoriados: number; revisitados: number; pdfs_gerados: number }>(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN ${EH_REVISITA_SQL} THEN 0 ELSE 1 END) AS vistoriados,
        SUM(CASE WHEN ${EH_REVISITA_SQL} THEN 1 ELSE 0 END) AS revisitados,
        SUM(CASE WHEN COALESCE(aux.project_status,'') = 'GERADO' THEN 1 ELSE 0 END) AS pdfs_gerados
      FROM \`${TABLE_NE}\` ne
      INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
      LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
              ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
      LEFT JOIN \`${TABLE_AUX}\` aux
              ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
      WHERE ${where.join(" AND ")}
    `,
    params
  );

  return {
    total: Number(row?.total ?? 0),
    vistoriados: Number(row?.vistoriados ?? 0),
    revisitados: Number(row?.revisitados ?? 0),
    pdfsGerados: Number(row?.pdfs_gerados ?? 0),
  };
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
  situacao_id: number | null;
  is_repeat: number;
  tecnico_id: number | null;
  tecnico_firstname: string | null;
  tecnico_realname: string | null;
  tecnico_username: string | null;
  data_vistoria: string | null;
  rejeitada: number;
}

function resolveSituacaoOperacional(
  situacaoId: number | null,
  statusName: string | null,
  isRepeat: boolean,
  hasTecnico: boolean,
  rejeitada?: boolean
): import("@/types/painel-mapa").SituacaoOperacional {
  // Recusa aprovada vence qualquer situação/status — a vistoria está fora
  // de circulação, o que sobrou nesses campos é só o estado de antes.
  if (rejeitada) return "REJEITADA";
  // 1ª prioridade: campo nativo situaodavistoriafield (1..6)
  switch (Number(situacaoId ?? 0)) {
    case 2: return "EM_VISTORIA";
    case 3: return "VISTORIADO";
    case 4: return "AGUARDANDO_REVISITA";
    case 5: return "EM_REVISITA";
    case 6: return "REVISITADO";
    case 1: return hasTecnico ? "ATRIBUIDO" : "A_VISTORIAR";
    case SITUACAO_EM_DESLOCAMENTO: return "EM_DESLOCAMENTO";
    case 8: return "DEVOLVIDA";
  }
  // Fallback: deriva de statusvistoria + is_repeat
  const s = (statusName ?? "").trim().toLowerCase();
  if (s === "reprovada" || s === "reprovado") {
    return isRepeat ? "EM_REVISITA" : "AGUARDANDO_REVISITA";
  }
  if (
    s === "aprovada" || s === "aprovado" ||
    s === "finalizada" || s === "finalizado" ||
    s === "em análise" || s === "em analise"
  ) {
    return isRepeat ? "REVISITADO" : "VISTORIADO";
  }
  return hasTecnico ? "EM_VISTORIA" : "A_VISTORIAR";
}

function resolveStatusAprovacao(
  statusName: string | null
): PainelMapaVistoria["status_aprovacao"] {
  const s = (statusName ?? "").trim().toLowerCase();
  if (s === "aprovada" || s === "aprovado") return "APROVADO";
  if (s === "reprovada" || s === "reprovado") return "REPROVADO";
  if (s === "em análise" || s === "em analise") return "EM_ANALISE";
  return "PENDENTE";
}

function resolveMapaVistoriaStatus(
  statusName: string | null,
  isRepeat: boolean,
  situacaoId?: number | null,
  rejeitada?: boolean
): PainelMapaVistoria["status"] {
  if (rejeitada) return "REJEITADA";
  if (Number(situacaoId ?? 0) === 8) return "DEVOLVIDA";
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
  // Tolerância maior: ping a cada 30s, polling do mapa a cada 15s.
  // Threshold curto demais fazia status oscilar entre verde e amarelo.
  if (minutosAtras == null || minutosAtras > 30) return "offline";
  if (emVistoriaCount > 0) return "em-vistoria";
  if ((speedKmh ?? 0) >= 3 || minutosAtras < 5) return "em-operacao";
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
      GROUP BY u.id
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
        f.\`${SITUACAO_COLUMN}\` AS situacao_id,
        COALESCE(aux.is_repeat, 0) AS is_repeat,
        f.users_id_vistoriadorafield AS tecnico_id,
        u.firstname AS tecnico_firstname,
        u.realname AS tecnico_realname,
        u.name AS tecnico_username,
        f.datadavistoriafield AS data_vistoria,
        (rec.id IS NOT NULL) AS rejeitada
      FROM \`${TABLE_NE}\` ne
      INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
      LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
        ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
      LEFT JOIN \`${TABLE_AUX}\` aux
        ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
      LEFT JOIN \`${TABLE_USERS}\` u
        ON u.id = f.users_id_vistoriadorafield
      LEFT JOIN \`glpi_plugin_vistomap_recusas\` rec
        ON rec.vistoria_id = ne.id AND rec.status = 'APROVADO'
      WHERE ne.is_deleted = 0
        AND f.latitudefield IS NOT NULL AND f.longitudefield IS NOT NULL
        AND TRIM(f.latitudefield) <> '' AND TRIM(f.longitudefield) <> ''
        AND REPLACE(f.latitudefield, ',', '.') + 0.0 <> 0
        AND REPLACE(f.longitudefield, ',', '.') + 0.0 <> 0
      LIMIT 10000
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
    const hasTecnico = r.tecnico_id != null && Number(r.tecnico_id) > 0;
    const tecnicoNome = hasTecnico
      ? `${r.tecnico_firstname ?? ""} ${r.tecnico_realname ?? ""}`.trim() ||
        r.tecnico_username ||
        null
      : null;
    return {
      id: r.id,
      equipamento: r.equipamento,
      municipio: r.municipio,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      status: resolveMapaVistoriaStatus(r.status_name, isRevisita, r.situacao_id, !!r.rejeitada),
      is_revisita: isRevisita,
      tecnico_id: r.tecnico_id,
      tecnico_nome: tecnicoNome,
      situacao_id: Number(r.situacao_id ?? 0) || 0,
      situacao: resolveSituacaoOperacional(
        r.situacao_id,
        r.status_name,
        isRevisita,
        hasTecnico,
        !!r.rejeitada
      ),
      status_aprovacao: resolveStatusAprovacao(r.status_name),
      data_vistoria: r.data_vistoria,
    };
  });

  return {
    tecnicos,
    vistorias,
    generated_at: new Date().toISOString(),
  };
}

/* ── Central de Vistorias ────────────────────────────────────────── */

export interface CentralVistoria {
  id: number;
  equipamento: string;
  municipio: string | null;
  situacao_id: number;
  situacao: string;
  status_name: string | null;
  tecnico_id: number | null;
  tecnico_nome: string | null;
  data_vistoria: string | null;
  is_repeat: number;
}

export async function listCentralVistorias(): Promise<CentralVistoria[]> {
  return query<CentralVistoria>(
    `SELECT
       ne.id,
       ne.name                                           AS equipamento,
       TRIM(f.municipiofield)                            AS municipio,
       COALESCE(f.\`${SITUACAO_COLUMN}\`, 0)            AS situacao_id,
       COALESCE(sv.name, 'Pendente')                    AS situacao,
       sv.name                                           AS status_name,
       f.users_id_vistoriadorafield                     AS tecnico_id,
       u.name                                            AS tecnico_nome,
       f.datadavistoriafield                            AS data_vistoria,
       COALESCE(aux.is_repeat, 0)                       AS is_repeat
     FROM \`${TABLE_NE}\` ne
     JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
     LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
           ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
     LEFT JOIN \`${TABLE_USERS}\` u
           ON u.id = f.users_id_vistoriadorafield
     LEFT JOIN \`${TABLE_AUX}\` aux
           ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
     WHERE ne.is_deleted = 0
       AND (
         -- exclui pendentes sem técnico: só aparecem aqui quem já foi trabalhado ou está atribuído
         COALESCE(f.\`${SITUACAO_COLUMN}\`, 0) > 1
         OR f.users_id_vistoriadorafield > 0
       )
     ORDER BY
       -- sequência: A Vistoriar → Em Vistoria → Vistoriado → revisitas
       CASE COALESCE(f.\`${SITUACAO_COLUMN}\`, 0)
         WHEN 8 THEN 0  -- Devolvida para Correção (mais urgente)
         WHEN 1 THEN 1  -- A Vistoriar
         WHEN 2 THEN 2  -- Em Vistoria
         WHEN 3 THEN 3  -- Vistoriado
         WHEN 4 THEN 4  -- Ag. Revisita
         WHEN 5 THEN 5  -- Em Revisita
         WHEN 6 THEN 6  -- Revisitado
         ELSE 9
       END,
       ne.name ASC`
  );
}

/**
 * Cancela uma vistoria: volta ao estado inicial (A Vistoriar), remove
 * técnico atribuído, limpa datas e pendência, e apaga os registros de
 * projeto (aux interno + aba nativa "VistoMap - Projetos"). Os arquivos
 * físicos são removidos pela API (tem acesso ao filesystem).
 *
 * Achado em produção (18/08): quando uma vistoria já tinha sido aprovada
 * internamente antes (aprovarVistoria() grava pendencia=PENDENCIA_CPFL) e
 * DEPOIS era cancelada, a pendência ficava presa em "Pendência CPFL" pra
 * sempre — o equipamento voltava pra fila "A Vistoriar" mas continuava
 * marcado como se tivesse uma pendência da concessionária real. Da mesma
 * forma, o registro na aba "VistoMap - Projetos" (glpi_plugin_vistomapprojetos_projects,
 * gerenciado pela classe PHP do plugin — tabela DIFERENTE de TABLE_AUX)
 * nunca era tocado aqui, então um projeto que já tinha ido a
 * análise/aprovação ficava órfão com status "in_review"/"approved" mesmo
 * com a vistoria zerada (casos reais: CAM-P-A-405/511/622/695).
 */
export async function cancelarVistoria(vistoriaId: number): Promise<void> {
  await execute(
    `UPDATE \`${TABLE_FIELDS}\`
        SET \`${SITUACAO_COLUMN}\`                        = ?,
            plugin_fields_statusvistoriafielddropdowns_id = ?,
            plugin_fields_pendnciafielddropdowns_id       = 0,
            users_id_vistoriadorafield                    = 0,
            datadavistoriafield                           = NULL,
            dataenvioconcessionriafield                   = NULL
      WHERE items_id = ?`,
    [SITUACAO_A_VISTORIAR, STATUS_VISTORIA_PENDENTE, vistoriaId]
  );
  await execute(
    `DELETE FROM \`${TABLE_AUX}\`
      WHERE items_id = ? AND itemtype = '${ITEMTYPE_NE}'`,
    [vistoriaId]
  );
  await execute(
    `DELETE FROM \`${TABLE_PROJETOS_PLUGIN}\`
      WHERE items_id = ? AND itemtype = '${ITEMTYPE_NE}'`,
    [vistoriaId]
  );
}

/**
 * Devolve uma vistoria pro técnico corrigir itens específicos (fotos e/ou
 * campos apontados pelo analista) — diferente de reprovar/revisita: o
 * técnico só refaz o que foi apontado, o resto do envio permanece.
 *
 *   - situaodavistoria = Devolvida para Correção (8)
 *   - datadavistoriafield / dataenvioconcessionriafield = NULL (aguardando reenvio)
 *   - statusvistoria volta pra Pendente (1) — o finalizar/route.ts deixa ele em
 *     "Em análise" (5), e listVistorias() EXCLUI status 3/4/5 da fila do
 *     técnico (regra "não deve ver vistorias concluídas/aprovadas"). Sem
 *     resetar aqui, a vistoria devolvida ficava invisível na lista/mapa do
 *     próprio app do técnico — só aparecia via o modal/banner de devolução.
 *   - o registro de projeto no aux NÃO é tocado aqui — o PDF só é regerado
 *     quando o técnico corrigir e reenviar (Fase 2), via o mesmo fluxo que já
 *     popula o aux no finalizar/route.ts.
 */
/**
 * @param novoTecnicoId Se informado, também redireciona a vistoria pra
 *   outro técnico como parte da mesma devolução — usado quando o técnico
 *   original não tem como resolver a correção (ex.: mudou de rota, saiu da
 *   empresa). Sem isso, a devolução sempre volta pro MESMO técnico.
 */
export async function devolverVistoria(
  vistoriaId: number,
  novoTecnicoId?: number
): Promise<{ affected: number }> {
  const sets = [
    `\`${SITUACAO_COLUMN}\` = ?`,
    `plugin_fields_statusvistoriafielddropdowns_id = ?`,
    `datadavistoriafield = NULL`,
    `dataenvioconcessionriafield = NULL`,
  ];
  const params: unknown[] = [SITUACAO_DEVOLVIDA, STATUS_VISTORIA_PENDENTE];
  if (novoTecnicoId != null && novoTecnicoId > 0) {
    sets.push(`users_id_vistoriadorafield = ?`);
    params.push(novoTecnicoId);
  }
  params.push(vistoriaId);
  const r = await execute(
    `UPDATE \`${TABLE_FIELDS}\` SET ${sets.join(", ")} WHERE items_id = ?`,
    params
  );
  return { affected: r.affectedRows };
}

/**
 * Reatribui a vistoria a outro técnico.
 * Mantém o estado/situação atual — apenas troca o vistoriador.
 */
export async function reatribuirVistoria(
  vistoriaId: number,
  novoTecnicoId: number
): Promise<void> {
  await execute(
    `UPDATE \`${TABLE_FIELDS}\`
        SET users_id_vistoriadorafield = ?,
            \`${SITUACAO_COLUMN}\`    = ?
      WHERE items_id = ?`,
    [novoTecnicoId, SITUACAO_A_VISTORIAR, vistoriaId]
  );
}

/**
 * Troca só o técnico responsável, SEM mexer na situação — usado ao editar
 * uma devolução já enviada (a vistoria continua Devolvida para Correção,
 * só muda quem tem que resolver). Diferente de reatribuirVistoria(), que
 * reseta a situação pra "A Vistoriar" (fluxo de reatribuição normal).
 */
export async function trocarTecnicoResponsavel(
  vistoriaId: number,
  novoTecnicoId: number
): Promise<void> {
  await execute(
    `UPDATE \`${TABLE_FIELDS}\` SET users_id_vistoriadorafield = ? WHERE items_id = ?`,
    [novoTecnicoId, vistoriaId]
  );
}
