import "server-only";
import { execute, query } from "@/lib/db";

/**
 * Devoluções — analista aponta itens (fotos/campos) errados numa vistoria
 * já enviada e devolve pro técnico corrigir só aquilo, sem refazer tudo.
 *
 * Tabela própria do VistoMap (não é GLPI Fields) — só a situação da
 * vistoria (SITUACAO_DEVOLVIDA=8) é que muda no lado GLPI; o restante do
 * ciclo (itens apontados, motivos, quem resolveu) vive aqui.
 */

const TABLE = "glpi_plugin_vistomap_devolucoes";

let ensured = false;

export async function ensureDevolucoesTable(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
      id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      vistoria_id          INT             NOT NULL,
      equipamento          VARCHAR(255)    NOT NULL,
      tecnico_id           INT             NULL,
      tecnico_nome         VARCHAR(255)    NULL,
      analista_id          INT             NOT NULL,
      analista_nome        VARCHAR(255)    NOT NULL,
      itens_json           JSON            NOT NULL,
      motivos_json         JSON            NOT NULL,
      motivo_outro         TEXT            NULL,
      precisa_deslocamento TINYINT(1)      NOT NULL DEFAULT 0,
      status               ENUM('PENDENTE','RESOLVIDA','CANCELADA') NOT NULL DEFAULT 'PENDENTE',
      criado_em            timestamp       NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolvido_em         timestamp       NULL DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_vistoria (vistoria_id),
      KEY idx_status   (status),
      KEY idx_tecnico  (tecnico_id),
      KEY idx_criado   (criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Migração defensiva: se a tabela já existia de uma versão anterior
  // (coluna única `motivo`, sem `motivos_json`), adiciona a coluna nova
  // sem mexer na antiga — evita perder dado de quem já tiver testado.
  const cols = await query<{ COLUMN_NAME: string; COLUMN_TYPE: string }>(
    `SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.columns
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [TABLE]
  );
  const names = new Set(cols.map((c) => c.COLUMN_NAME));
  if (!names.has("motivos_json")) {
    await execute(`ALTER TABLE \`${TABLE}\` ADD COLUMN motivos_json JSON NULL AFTER itens_json`);
    if (names.has("motivo")) {
      // Migra o valor único antigo pra um array de 1 item, best-effort.
      await execute(
        `UPDATE \`${TABLE}\` SET motivos_json = JSON_ARRAY(motivo) WHERE motivos_json IS NULL`
      );
    }
  }

  // Migração defensiva: tabelas criadas antes de CANCELADA existir no ENUM
  // (devolução anulada — vistoria cancelada antes do técnico corrigir, ou
  // devolução indevida anulada manualmente pelo admin).
  const statusCol = cols.find((c) => c.COLUMN_NAME === "status");
  if (statusCol && !statusCol.COLUMN_TYPE.includes("CANCELADA")) {
    await execute(
      `ALTER TABLE \`${TABLE}\` MODIFY COLUMN status ENUM('PENDENTE','RESOLVIDA','CANCELADA') NOT NULL DEFAULT 'PENDENTE'`
    );
  }

  ensured = true;
}

export interface CriarDevolucaoInput {
  vistoriaId: number;
  equipamento: string;
  tecnicoId: number | null;
  tecnicoNome: string | null;
  analistaId: number;
  analistaNome: string;
  itens: string[];
  motivos: string[];
  motivoOutro?: string | null;
  precisaDeslocamento: boolean;
}

export async function criarDevolucao(input: CriarDevolucaoInput): Promise<number> {
  await ensureDevolucoesTable();
  const { insertId } = await execute(
    `INSERT INTO \`${TABLE}\`
       (vistoria_id, equipamento, tecnico_id, tecnico_nome, analista_id, analista_nome,
        itens_json, motivos_json, motivo_outro, precisa_deslocamento, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE')`,
    [
      input.vistoriaId,
      input.equipamento,
      input.tecnicoId,
      input.tecnicoNome,
      input.analistaId,
      input.analistaNome,
      JSON.stringify(input.itens),
      JSON.stringify(input.motivos),
      input.motivoOutro ?? null,
      input.precisaDeslocamento ? 1 : 0,
    ]
  );
  return insertId;
}

export interface DevolucaoRow {
  id: number;
  vistoria_id: number;
  equipamento: string;
  tecnico_id: number | null;
  tecnico_nome: string | null;
  analista_id: number;
  analista_nome: string;
  itens_json: string;
  motivos_json: string | null;
  motivo_outro: string | null;
  precisa_deslocamento: number;
  status: "PENDENTE" | "RESOLVIDA" | "CANCELADA";
  criado_em: string;
  resolvido_em: string | null;
}

export interface Devolucao {
  id: number;
  vistoriaId: number;
  equipamento: string;
  tecnicoId: number | null;
  tecnicoNome: string | null;
  analistaId: number;
  analistaNome: string;
  itens: string[];
  motivos: string[];
  motivoOutro: string | null;
  precisaDeslocamento: boolean;
  status: "PENDENTE" | "RESOLVIDA" | "CANCELADA";
  criadoEm: string;
  resolvidoEm: string | null;
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function mapRow(r: DevolucaoRow): Devolucao {
  return {
    id: r.id,
    vistoriaId: r.vistoria_id,
    equipamento: r.equipamento,
    tecnicoId: r.tecnico_id,
    tecnicoNome: r.tecnico_nome,
    analistaId: r.analista_id,
    analistaNome: r.analista_nome,
    itens: parseJsonArray(r.itens_json),
    motivos: parseJsonArray(r.motivos_json),
    motivoOutro: r.motivo_outro,
    precisaDeslocamento: !!r.precisa_deslocamento,
    status: r.status,
    criadoEm: r.criado_em,
    resolvidoEm: r.resolvido_em,
  };
}

/**
 * true se `criadoEm` foi num dia de calendário ANTERIOR a hoje (servidor).
 * Usado pro bloqueio "responder a devolutiva é obrigatório antes de iniciar
 * nova vistoria no dia seguinte" — no mesmo dia é só lembrete, não bloqueia.
 */
export function devolucaoEhDeOutroDia(criadoEm: string): boolean {
  const d = new Date(criadoEm.includes("T") ? criadoEm : criadoEm.replace(" ", "T") + "Z");
  const hoje = new Date();
  return (
    d.getFullYear() !== hoje.getFullYear() ||
    d.getMonth() !== hoje.getMonth() ||
    d.getDate() !== hoje.getDate()
  );
}

/** Devolução PENDENTE mais recente de um técnico (gate diário do app). */
export async function fetchDevolucaoPendente(tecnicoId: number): Promise<Devolucao | null> {
  await ensureDevolucoesTable();
  const rows = await query<DevolucaoRow>(
    `SELECT * FROM \`${TABLE}\`
      WHERE tecnico_id = ? AND status = 'PENDENTE'
      ORDER BY criado_em DESC
      LIMIT 1`,
    [tecnicoId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Devolução PENDENTE de uma vistoria específica (rota de correção). */
export async function fetchDevolucaoPendentePorVistoria(
  vistoriaId: number
): Promise<Devolucao | null> {
  await ensureDevolucoesTable();
  const rows = await query<DevolucaoRow>(
    `SELECT * FROM \`${TABLE}\`
      WHERE vistoria_id = ? AND status = 'PENDENTE'
      ORDER BY criado_em DESC
      LIMIT 1`,
    [vistoriaId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function resolverDevolucao(id: number): Promise<void> {
  await ensureDevolucoesTable();
  await execute(
    `UPDATE \`${TABLE}\` SET status = 'RESOLVIDA', resolvido_em = NOW() WHERE id = ?`,
    [id]
  );
}

/** Anula manualmente uma devolução PENDENTE (indevida, duplicada etc). */
export async function cancelarDevolucao(id: number): Promise<void> {
  await ensureDevolucoesTable();
  await execute(
    `UPDATE \`${TABLE}\` SET status = 'CANCELADA', resolvido_em = NOW() WHERE id = ? AND status = 'PENDENTE'`,
    [id]
  );
}

/**
 * Cancela toda devolução PENDENTE de uma vistoria — chamado quando a
 * vistoria em si é cancelada (Central de Vistorias), pra não deixar a
 * devolução presa em PENDENTE pra sempre (isso bloqueava o técnico de
 * iniciar vistorias novas no dia seguinte, via fetchDevolucaoPendente).
 * Retorna quantas linhas foram canceladas (pra log/auditoria).
 */
export async function cancelarDevolucoesPorVistoria(vistoriaId: number): Promise<number> {
  await ensureDevolucoesTable();
  const result = await execute(
    `UPDATE \`${TABLE}\` SET status = 'CANCELADA', resolvido_em = NOW() WHERE vistoria_id = ? AND status = 'PENDENTE'`,
    [vistoriaId]
  );
  return result.affectedRows;
}

export interface EditarDevolucaoInput {
  itens: string[];
  motivos: string[];
  motivoOutro?: string | null;
  precisaDeslocamento: boolean;
  tecnicoId?: number | null;
  tecnicoNome?: string | null;
}

/** Edita itens/motivos/técnico responsável de uma devolução ainda PENDENTE. */
export async function editarDevolucao(id: number, input: EditarDevolucaoInput): Promise<void> {
  await ensureDevolucoesTable();
  await execute(
    `UPDATE \`${TABLE}\`
        SET itens_json = ?, motivos_json = ?, motivo_outro = ?, precisa_deslocamento = ?,
            tecnico_id = ?, tecnico_nome = ?
      WHERE id = ? AND status = 'PENDENTE'`,
    [
      JSON.stringify(input.itens),
      JSON.stringify(input.motivos),
      input.motivoOutro ?? null,
      input.precisaDeslocamento ? 1 : 0,
      input.tecnicoId ?? null,
      input.tecnicoNome ?? null,
      id,
    ]
  );
}

export async function fetchDevolucaoPorId(id: number): Promise<Devolucao | null> {
  await ensureDevolucoesTable();
  const rows = await query<DevolucaoRow>(`SELECT * FROM \`${TABLE}\` WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export interface FetchDevolucoesFilters {
  desde?: string;
  ate?: string;
  tecnicoId?: number;
  status?: "PENDENTE" | "RESOLVIDA" | "CANCELADA";
  limit?: number;
}

export async function fetchDevolucoes(
  filters: FetchDevolucoesFilters = {}
): Promise<Devolucao[]> {
  await ensureDevolucoesTable();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.desde) {
    where.push("criado_em >= ?");
    params.push(filters.desde);
  }
  if (filters.ate) {
    where.push("criado_em <= ?");
    params.push(filters.ate);
  }
  if (filters.tecnicoId != null) {
    where.push("tecnico_id = ?");
    params.push(filters.tecnicoId);
  }
  if (filters.status) {
    where.push("status = ?");
    params.push(filters.status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 2000);
  const rows = await query<DevolucaoRow>(
    `SELECT * FROM \`${TABLE}\` ${whereSql} ORDER BY criado_em DESC LIMIT ${limit}`,
    params
  );
  return rows.map(mapRow);
}

export interface DevolucoesStats {
  total: number;
  pendentes: number;
  canceladas: number;
  rankMotivos: Array<{ motivo: string; total: number }>;
  rankTecnicos: Array<{ tecnicoId: number; tecnicoNome: string; total: number }>;
}

export async function fetchDevolucoesStats(
  filters: { desde?: string; ate?: string } = {}
): Promise<DevolucoesStats> {
  const itens = await fetchDevolucoes({ ...filters, limit: 2000 });

  const motivoCount = new Map<string, number>();
  const tecnicoCount = new Map<number, { nome: string; total: number }>();
  let pendentes = 0;
  let canceladas = 0;

  for (const d of itens) {
    if (d.status === "PENDENTE") pendentes++;
    if (d.status === "CANCELADA") canceladas++;
    // Devolução anulada não reflete um padrão real de correção — fora do rank.
    if (d.status === "CANCELADA") continue;
    // Uma devolução com N motivos conta 1x pra CADA motivo no rank
    // (o rank mede "quantas vezes esse motivo apareceu", não devoluções).
    for (const motivo of d.motivos) {
      motivoCount.set(motivo, (motivoCount.get(motivo) ?? 0) + 1);
    }
    if (d.tecnicoId != null) {
      const cur = tecnicoCount.get(d.tecnicoId) ?? { nome: d.tecnicoNome ?? "—", total: 0 };
      cur.total += 1;
      tecnicoCount.set(d.tecnicoId, cur);
    }
  }

  const rankMotivos = [...motivoCount.entries()]
    .map(([motivo, total]) => ({ motivo, total }))
    .sort((a, b) => b.total - a.total);

  const rankTecnicos = [...tecnicoCount.entries()]
    .map(([tecnicoId, v]) => ({ tecnicoId, tecnicoNome: v.nome, total: v.total }))
    .sort((a, b) => b.total - a.total);

  return { total: itens.length, pendentes, canceladas, rankMotivos, rankTecnicos };
}
