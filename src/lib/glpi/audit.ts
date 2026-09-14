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
        ts           timestamp       NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

  // Migração defensiva: categoria escolhida pelo analista ao aprovar uma
  // recusa (impedimento/recusa — ver lib/glpi/recusas.ts). Só em
  // 'recusa-aprovada'; permite o filtro "Impedimentos"/"Recusas" da
  // Auditoria separar os dois sem depender de casar texto em `descricao`.
  const cols = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM information_schema.columns
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [TABLE_AUDIT]
  );
  if (!cols.some((c) => c.COLUMN_NAME === "categoria")) {
    await execute(
      `ALTER TABLE \`${TABLE_AUDIT}\` ADD COLUMN categoria ENUM('impedimento','recusa') NULL DEFAULT NULL AFTER acao`
    );
  }

  ensured = true;
}

export interface AuditInsertInput {
  ator: { id: number | string; nome: string; role: SessionRole };
  acao: AuditEntry["acao"];
  alvo?: { tipo: "vistoria" | "tecnico" | "revisita" | "sistema" | "instalacao"; id: string | number; label: string };
  descricao?: string;
  diff?: Array<{ campo: string; antes?: string; depois?: string }>;
  /** Só em acao='recusa-aprovada' — decisão do analista (ver lib/glpi/recusas.ts). */
  categoria?: "impedimento" | "recusa";
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
         (ator_id, ator_nome, ator_role, acao, categoria, alvo_tipo, alvo_id, alvo_label, descricao, diff_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(input.ator.id) || 0,
        input.ator.nome,
        input.ator.role,
        input.acao,
        input.categoria ?? null,
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
  /**
   * Agrupamento por natureza de ocorrência (2026-09-14) — separado do
   * histórico completo, que ficou lotado demais na Central de Ocorrências.
   * "Impedimento"/"Recusa" nasce indefinido (o pedido é o mesmo evento pros
   * dois) e só se define quando o analista aprova (`categoria`); por isso o
   * pedido/reprovação de recusa aparece nos DOIS filtros — ainda não se
   * sabe em qual das duas categorias ele ia cair.
   */
  tipo?: "impedimento" | "recusa" | "excecao";
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
  if (filters.tipo === "excecao") {
    where.push("acao IN ('override-solicitado','override-aprovado','override-reprovado')");
  } else if (filters.tipo === "impedimento" || filters.tipo === "recusa") {
    // Pedido e reprovação ainda não têm categoria definida — aparecem nos
    // dois filtros. Só a aprovação (categoria já gravada) separa de fato.
    where.push(
      "(acao IN ('recusa-solicitada','recusa-reprovada') OR (acao = 'recusa-aprovada' AND categoria = ?))"
    );
    params.push(filters.tipo);
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
