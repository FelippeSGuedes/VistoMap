import "server-only";
import { execute, query } from "@/lib/db";
import type { AuditEntry, SessionRole } from "@/types";

/**
 * Auditoria operacional VistoMap.
 *
 * Tabela `glpi_plugin_vistomap_audit` é criada on-demand na primeira
 * chamada (`ensureAuditTable`). Inserções são fire-and-forget pra não
 * bloquear ações principais — em qualquer falha o erro é logado e
 * descartado (auditoria nunca derruba a operação).
 */

const TABLE_AUDIT = "glpi_plugin_vistomap_audit";

let ensured = false;

export async function ensureAuditTable(): Promise<void> {
  if (ensured) return;
  await execute(
    `
      CREATE TABLE IF NOT EXISTS \`${TABLE_AUDIT}\` (
        id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ts           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ator_id      INT             NOT NULL,
        ator_nome    VARCHAR(255)    NOT NULL,
        ator_role    VARCHAR(16)     NOT NULL,
        acao         VARCHAR(64)     NOT NULL,
        alvo_tipo    VARCHAR(24)     NULL,
        alvo_id      VARCHAR(64)     NULL,
        alvo_label   VARCHAR(255)    NULL,
        descricao    TEXT            NULL,
        diff_json    JSON            NULL,
        PRIMARY KEY (id),
        KEY idx_ts          (ts),
        KEY idx_acao        (acao),
        KEY idx_ator        (ator_id),
        KEY idx_alvo        (alvo_tipo, alvo_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
  ensured = true;
}

export interface AuditInsertInput {
  ator: { id: number | string; nome: string; role: SessionRole };
  acao: AuditEntry["acao"];
  alvo?: { tipo: "vistoria" | "tecnico" | "revisita" | "sistema"; id: string | number; label: string };
  descricao?: string;
  diff?: Array<{ campo: string; antes?: string; depois?: string }>;
}

/**
 * Insere um registro de auditoria. Erros são logados e descartados —
 * auditoria nunca deve bloquear a ação principal.
 */
export async function auditInsert(input: AuditInsertInput): Promise<void> {
  try {
    await ensureAuditTable();
    await execute(
      `INSERT INTO \`${TABLE_AUDIT}\`
         (ator_id, ator_nome, ator_role, acao, alvo_tipo, alvo_id, alvo_label, descricao, diff_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(input.ator.id) || 0,
        input.ator.nome,
        input.ator.role,
        input.acao,
        input.alvo?.tipo ?? null,
        input.alvo ? String(input.alvo.id) : null,
        input.alvo?.label ?? null,
        input.descricao ?? null,
        input.diff ? JSON.stringify(input.diff) : null,
      ]
    );
  } catch (err) {
    console.error("[audit] insert error (descartado)", err);
  }
}

export interface FetchAuditFilters {
  acao?: string;
  ator_id?: number;
  alvo_id?: string;
  limit?: number;
  offset?: number;
}

interface AuditRow {
  id: number;
  ts: string;
  ator_id: number;
  ator_nome: string;
  ator_role: string;
  acao: string;
  alvo_tipo: string | null;
  alvo_id: string | null;
  alvo_label: string | null;
  descricao: string | null;
  diff_json: string | null;
}

export async function fetchAudit(
  filters: FetchAuditFilters = {}
): Promise<AuditEntry[]> {
  await ensureAuditTable();

  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.acao) {
    where.push("acao = ?");
    params.push(filters.acao);
  }
  if (filters.ator_id) {
    where.push("ator_id = ?");
    params.push(filters.ator_id);
  }
  if (filters.alvo_id) {
    where.push("alvo_id = ?");
    params.push(filters.alvo_id);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);

  const rows = await query<AuditRow>(
    `
      SELECT id, ts, ator_id, ator_nome, ator_role,
             acao, alvo_tipo, alvo_id, alvo_label, descricao, diff_json
        FROM \`${TABLE_AUDIT}\`
        ${whereSql}
       ORDER BY ts DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}
    `,
    params
  );

  return rows.map((r) => ({
    id: String(r.id),
    timestamp: r.ts,
    ator: {
      id: String(r.ator_id),
      nome: r.ator_nome,
      role: (r.ator_role as SessionRole) ?? "tecnico",
    },
    acao: r.acao as AuditEntry["acao"],
    alvo: r.alvo_tipo
      ? {
          tipo: r.alvo_tipo as "vistoria" | "tecnico" | "revisita" | "sistema",
          id: r.alvo_id ?? "",
          label: r.alvo_label ?? "",
        }
      : undefined,
    descricao: r.descricao ?? undefined,
    diff: r.diff_json
      ? (() => {
          try {
            return JSON.parse(r.diff_json) as AuditEntry["diff"];
          } catch {
            return undefined;
          }
        })()
      : undefined,
  }));
}
