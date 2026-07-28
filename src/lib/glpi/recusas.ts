import "server-only";
import { execute, query } from "@/lib/db";

/**
 * Recusas — técnico declara que uma vistoria é impossível de fazer
 * (propriedade privada, risco, poste removido, sem alternativa nas
 * redondezas, etc.) e pede aprovação do analista.
 *
 * Diferente de devolução (analista aponta erro numa vistoria já feita):
 * aqui é o técnico que sinaliza ANTES de conseguir fazer a vistoria.
 * Enquanto PENDENTE, o técnico fica desvinculado da vistoria (some da
 * fila dele) — aprovada, some de circulação de vez; reprovada, volta
 * pra fila do mesmo técnico.
 */

const TABLE = "glpi_plugin_vistomap_recusas";

let ensured = false;

export async function ensureRecusasTable(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
      id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      vistoria_id       INT             NOT NULL,
      equipamento       VARCHAR(255)    NOT NULL,
      tecnico_id        INT             NOT NULL,
      tecnico_nome      VARCHAR(255)    NOT NULL,
      motivo            VARCHAR(64)     NOT NULL,
      respostas_json    JSON            NULL,
      justificativa     TEXT            NOT NULL,
      foto_path         VARCHAR(255)    NULL,
      status            ENUM('PENDENTE','APROVADO','REPROVADO') NOT NULL DEFAULT 'PENDENTE',
      motivo_reprovacao TEXT            NULL,
      criado_em         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolvido_em      DATETIME        NULL,
      PRIMARY KEY (id),
      KEY idx_vistoria (vistoria_id),
      KEY idx_status   (status),
      KEY idx_tecnico  (tecnico_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Migração defensiva: tabela pode já existir de antes do upload de foto
  // (Fase 1 saiu sem essa coluna).
  const cols = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM information_schema.columns
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [TABLE]
  );
  const names = new Set(cols.map((c) => c.COLUMN_NAME));
  if (!names.has("foto_path")) {
    await execute(`ALTER TABLE \`${TABLE}\` ADD COLUMN foto_path VARCHAR(255) NULL AFTER justificativa`);
  }

  ensured = true;
}

export interface CriarRecusaInput {
  vistoriaId: number;
  equipamento: string;
  tecnicoId: number;
  tecnicoNome: string;
  motivo: string;
  respostas: Record<string, string>;
  justificativa: string;
  fotoPath?: string | null;
}

export async function criarRecusa(input: CriarRecusaInput): Promise<number> {
  await ensureRecusasTable();
  const { insertId } = await execute(
    `INSERT INTO \`${TABLE}\`
       (vistoria_id, equipamento, tecnico_id, tecnico_nome, motivo, respostas_json, justificativa, foto_path, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE')`,
    [
      input.vistoriaId,
      input.equipamento,
      input.tecnicoId,
      input.tecnicoNome,
      input.motivo,
      JSON.stringify(input.respostas),
      input.justificativa,
      input.fotoPath ?? null,
    ]
  );
  return insertId;
}

export interface RecusaRow {
  id: number;
  vistoria_id: number;
  equipamento: string;
  tecnico_id: number;
  tecnico_nome: string;
  motivo: string;
  respostas_json: string | null;
  justificativa: string;
  foto_path: string | null;
  status: "PENDENTE" | "APROVADO" | "REPROVADO";
  motivo_reprovacao: string | null;
  criado_em: string;
  resolvido_em: string | null;
}

export interface Recusa {
  id: number;
  vistoriaId: number;
  equipamento: string;
  tecnicoId: number;
  tecnicoNome: string;
  motivo: string;
  respostas: Record<string, string>;
  justificativa: string;
  fotoPath: string | null;
  status: "PENDENTE" | "APROVADO" | "REPROVADO";
  motivoReprovacao: string | null;
  criadoEm: string;
  resolvidoEm: string | null;
}

function mapRow(r: RecusaRow): Recusa {
  let respostas: Record<string, string> = {};
  try {
    respostas = r.respostas_json ? JSON.parse(r.respostas_json) : {};
  } catch {
    /* ignora respostas malformadas */
  }
  return {
    id: r.id,
    vistoriaId: r.vistoria_id,
    equipamento: r.equipamento,
    tecnicoId: r.tecnico_id,
    tecnicoNome: r.tecnico_nome,
    motivo: r.motivo,
    respostas,
    justificativa: r.justificativa,
    fotoPath: r.foto_path,
    status: r.status,
    motivoReprovacao: r.motivo_reprovacao,
    criadoEm: r.criado_em,
    resolvidoEm: r.resolvido_em,
  };
}

export async function fetchRecusaPendentePorVistoria(vistoriaId: number): Promise<Recusa | null> {
  await ensureRecusasTable();
  const rows = await query<RecusaRow>(
    `SELECT * FROM \`${TABLE}\` WHERE vistoria_id = ? AND status = 'PENDENTE' ORDER BY criado_em DESC LIMIT 1`,
    [vistoriaId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function fetchRecusaPorId(id: number): Promise<Recusa | null> {
  await ensureRecusasTable();
  const rows = await query<RecusaRow>(`SELECT * FROM \`${TABLE}\` WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function resolverRecusa(
  id: number,
  status: "APROVADO" | "REPROVADO",
  motivoReprovacao?: string
): Promise<void> {
  await ensureRecusasTable();
  await execute(
    `UPDATE \`${TABLE}\` SET status = ?, motivo_reprovacao = ?, resolvido_em = NOW() WHERE id = ?`,
    [status, status === "REPROVADO" ? (motivoReprovacao ?? "").trim() : null, id]
  );
}

export interface FetchRecusasFilters {
  status?: "PENDENTE" | "APROVADO" | "REPROVADO";
  limit?: number;
}

export async function listRecusas(filters: FetchRecusasFilters = {}): Promise<Recusa[]> {
  await ensureRecusasTable();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    where.push("status = ?");
    params.push(filters.status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const rows = await query<RecusaRow>(
    `SELECT * FROM \`${TABLE}\` ${whereSql} ORDER BY criado_em DESC LIMIT ${limit}`,
    params
  );
  return rows.map(mapRow);
}
