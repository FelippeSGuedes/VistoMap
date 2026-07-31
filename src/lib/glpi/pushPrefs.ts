import "server-only";
import { execute, query } from "@/lib/db";

/**
 * Web push do painel — camada de dados.
 *
 * Duas tabelas:
 *  - push_prefs: allowlist decidida pelo ADMIN (quem deve receber). O analista
 *    não escolhe — o admin liga/desliga por usuário.
 *  - web_push_subs: a inscrição real do navegador (endpoint + chaves VAPID).
 *    Uma por dispositivo/navegador; só é criada quando o analista abre o
 *    painel logado E o admin habilitou ele.
 */

const TABLE_PREFS = "glpi_plugin_vistomap_push_prefs";
const TABLE_SUBS = "glpi_plugin_vistomap_web_push_subs";

let ensured = false;

export async function ensurePushTables(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE_PREFS}\` (
      users_id   INT             NOT NULL,
      notificar  TINYINT(1)      NOT NULL DEFAULT 0,
      updated_at timestamp       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (users_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE_SUBS}\` (
      id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      users_id   INT             NOT NULL,
      endpoint   VARCHAR(512)    NOT NULL,
      p256dh     VARCHAR(255)    NOT NULL,
      auth       VARCHAR(255)    NOT NULL,
      user_agent VARCHAR(255)    NULL,
      created_at timestamp       NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_endpoint (endpoint(191)),
      KEY idx_user (users_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

/** Mapa users_id → notificar (bool), para uma lista de usuários. */
export async function getNotificarFlags(
  usersIds: number[]
): Promise<Map<number, boolean>> {
  const m = new Map<number, boolean>();
  if (usersIds.length === 0) return m;
  await ensurePushTables();
  const placeholders = usersIds.map(() => "?").join(",");
  const rows = await query<{ users_id: number; notificar: number }>(
    `SELECT users_id, notificar FROM \`${TABLE_PREFS}\` WHERE users_id IN (${placeholders})`,
    usersIds
  );
  for (const r of rows) m.set(r.users_id, Number(r.notificar) === 1);
  return m;
}

/** Admin liga/desliga o flag de um usuário. */
export async function setNotificar(userId: number, enabled: boolean): Promise<void> {
  await ensurePushTables();
  await execute(
    `INSERT INTO \`${TABLE_PREFS}\` (users_id, notificar)
       VALUES (?, ?)
     ON DUPLICATE KEY UPDATE notificar = VALUES(notificar)`,
    [userId, enabled ? 1 : 0]
  );
  // Desligou → remove as inscrições do navegador dele (para de receber já).
  if (!enabled) {
    await execute(`DELETE FROM \`${TABLE_SUBS}\` WHERE users_id = ?`, [userId]);
  }
}

/** Quantos navegadores cada usuário tem inscritos (para UI mostrar status). */
export async function countSubscriptions(
  usersIds: number[]
): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  if (usersIds.length === 0) return m;
  await ensurePushTables();
  const placeholders = usersIds.map(() => "?").join(",");
  const rows = await query<{ users_id: number; n: number }>(
    `SELECT users_id, COUNT(*) AS n FROM \`${TABLE_SUBS}\`
      WHERE users_id IN (${placeholders}) GROUP BY users_id`,
    usersIds
  );
  for (const r of rows) m.set(r.users_id, Number(r.n));
  return m;
}

export interface WebPushSub {
  id: number;
  users_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Salva/atualiza a inscrição de um navegador (idempotente por endpoint). */
export async function saveSubscription(input: {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  await ensurePushTables();
  await execute(
    `INSERT INTO \`${TABLE_SUBS}\` (users_id, endpoint, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       users_id = VALUES(users_id),
       p256dh   = VALUES(p256dh),
       auth     = VALUES(auth),
       user_agent = VALUES(user_agent)`,
    [input.userId, input.endpoint, input.p256dh, input.auth, input.userAgent ?? null]
  );
}

/** Inscrições de todos os usuários com notificar=1 (destinatários do push). */
export async function listEnabledSubscriptions(): Promise<WebPushSub[]> {
  await ensurePushTables();
  return query<WebPushSub>(
    `SELECT s.id, s.users_id, s.endpoint, s.p256dh, s.auth
       FROM \`${TABLE_SUBS}\` s
       INNER JOIN \`${TABLE_PREFS}\` p ON p.users_id = s.users_id AND p.notificar = 1`
  );
}

/** Remove uma inscrição inválida (410/404 do endpoint). */
export async function deleteSubscriptionById(id: number): Promise<void> {
  await ensurePushTables();
  await execute(`DELETE FROM \`${TABLE_SUBS}\` WHERE id = ?`, [id]);
}
