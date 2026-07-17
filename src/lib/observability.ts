import "server-only";
import { execute, query } from "@/lib/db";

/**
 * Observabilidade VistoMap — log de erros centralizado (mini "Sentry
 * interno"), pra parar de depender de SSH + docker logs toda vez que algo
 * quebra. Mesmo padrao do audit.ts: tabela criada on-demand, insercao
 * fire-and-forget (log nunca derruba a operacao principal).
 */

const TABLE_LOG = "glpi_plugin_vistomap_errorlog";

export type LogSource = "app" | "painel" | "worker" | "glpi";
export type LogLevel = "error" | "warning";

let ensured = false;

export async function ensureErrorLogTable(): Promise<void> {
  if (ensured) return;
  await execute(
    `
      CREATE TABLE IF NOT EXISTS \`${TABLE_LOG}\` (
        id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ts       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        source   VARCHAR(16)     NOT NULL,
        level    VARCHAR(16)     NOT NULL DEFAULT 'error',
        rota     VARCHAR(128)    NULL,
        mensagem TEXT            NOT NULL,
        contexto JSON            NULL,
        PRIMARY KEY (id),
        KEY idx_ts     (ts),
        KEY idx_source (source),
        KEY idx_level  (level)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
  ensured = true;
}

/**
 * Registra um erro. Fire-and-forget — nunca lança, nunca bloqueia a rota
 * que chamou. Chame de dentro de um catch, ao lado do console.error já
 * existente (não substitui — só passa a persistir também).
 */
export async function logError(
  source: LogSource,
  rota: string,
  err: unknown,
  contexto?: Record<string, unknown>
): Promise<void> {
  try {
    await ensureErrorLogTable();
    const mensagem = err instanceof Error ? err.message : String(err);
    await execute(
      `INSERT INTO \`${TABLE_LOG}\` (source, level, rota, mensagem, contexto)
       VALUES (?, 'error', ?, ?, ?)`,
      [source, rota, mensagem.slice(0, 2000), contexto ? JSON.stringify(contexto) : null]
    );
  } catch {
    // Log de log falhando não pode derrubar nada — silencioso de propósito.
  }
}

export interface ErrorLogRow {
  id: number;
  ts: string;
  source: LogSource;
  level: LogLevel;
  rota: string | null;
  mensagem: string;
  contexto: string | null;
}

export async function fetchRecentErrors(limit = 100): Promise<ErrorLogRow[]> {
  await ensureErrorLogTable();
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  return query<ErrorLogRow>(
    `SELECT id, ts, source, level, rota, mensagem, contexto
       FROM \`${TABLE_LOG}\`
      ORDER BY ts DESC, id DESC
      LIMIT ${safeLimit}`
  );
}

export async function countErrorsSince(hours: number): Promise<number> {
  await ensureErrorLogTable();
  const rows = await query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM \`${TABLE_LOG}\`
      WHERE ts >= DATE_SUB(NOW(), INTERVAL ${Math.max(1, Math.floor(hours))} HOUR)`
  );
  return Number(rows[0]?.total ?? 0);
}
