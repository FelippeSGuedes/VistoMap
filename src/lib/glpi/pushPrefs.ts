import "server-only";
import { execute, query } from "@/lib/db";
import { NOTIF_CATEGORIAS, type NotifCategoria } from "@/lib/notifCategorias";

/**
 * Web push do painel — camada de dados.
 *
 * Três tabelas:
 *  - push_prefs: allowlist antiga (booleano único), mantida só como
 *    histórico pro backfill de notif_prefs — não é mais lida depois disso.
 *  - notif_prefs: preferência por (usuário, categoria) — o admin decide,
 *    por analista, quais categorias de evento disparam push pra ele.
 *  - web_push_subs: a inscrição real do navegador (endpoint + chaves VAPID).
 *    Uma por dispositivo/navegador; só é criada quando o analista abre o
 *    painel logado E tem pelo menos 1 categoria habilitada.
 */

const TABLE_PREFS = "glpi_plugin_vistomap_push_prefs";
const TABLE_NOTIF_PREFS = "glpi_plugin_vistomap_notif_prefs";
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

  // notif_prefs é criada + populada uma vez só: se ela ainda não existia
  // antes desta chamada, faz backfill a partir de push_prefs.notificar pra
  // ninguém perder a preferência que já tinha nem ser opt-in de graça.
  let existiaAntes = true;
  try {
    await query(`SELECT 1 FROM \`${TABLE_NOTIF_PREFS}\` LIMIT 1`);
  } catch (err) {
    if (String(err).includes("doesn't exist")) existiaAntes = false;
    else throw err;
  }

  await execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE_NOTIF_PREFS}\` (
      users_id   INT          NOT NULL,
      categoria  VARCHAR(32)  NOT NULL,
      ativo      TINYINT(1)   NOT NULL DEFAULT 0,
      updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (users_id, categoria)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  if (!existiaAntes) {
    const antigos = await query<{ users_id: number; notificar: number }>(
      `SELECT users_id, notificar FROM \`${TABLE_PREFS}\``
    );
    for (const row of antigos) {
      const ativo = Number(row.notificar) === 1 ? 1 : 0;
      for (const categoria of NOTIF_CATEGORIAS) {
        await execute(
          `INSERT INTO \`${TABLE_NOTIF_PREFS}\` (users_id, categoria, ativo)
             VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE ativo = VALUES(ativo)`,
          [row.users_id, categoria, ativo]
        );
      }
    }
  }

  ensured = true;
}

/**
 * Mapa users_id → "tem pelo menos 1 categoria ativa" (elegibilidade geral) —
 * é o que /api/painel/push/status usa pra decidir se o navegador do analista
 * deve sequer TENTAR se inscrever no push.
 *
 * Sem NENHUMA linha em notif_prefs = nunca abriu Configurações › Notificações
 * = habilitado por padrão (mesma regra de getCategoriaPrefs/
 * listEnabledSubscriptions, 2026-09-14). Sem este default, um analista que
 * nunca visitou as configurações nunca chegava a se inscrever no push —
 * o problema começava aqui, antes mesmo de qualquer categoria importar.
 * Uma configuração explícita (mesmo que tudo desligado de propósito)
 * continua sendo respeitada.
 */
export async function getNotificarFlags(
  usersIds: number[]
): Promise<Map<number, boolean>> {
  const m = new Map<number, boolean>();
  if (usersIds.length === 0) return m;
  await ensurePushTables();
  for (const id of usersIds) m.set(id, true);
  const placeholders = usersIds.map(() => "?").join(",");
  const rows = await query<{ users_id: number; any_on: number }>(
    `SELECT users_id, MAX(ativo) AS any_on FROM \`${TABLE_NOTIF_PREFS}\`
      WHERE users_id IN (${placeholders}) GROUP BY users_id`,
    usersIds
  );
  for (const r of rows) m.set(r.users_id, Number(r.any_on) === 1);
  return m;
}

/**
 * Mapa users_id → {categoria: ativo}, para a grade de preferências do admin
 * e pro filtro de alertas (api/painel/alertas).
 *
 * Categoria SEM linha na tabela = HABILITADA por padrão (2026-09-14) — achado
 * real em produção: um moderador (Matheus Rosa) nunca tinha aberto
 * Configurações › Notificações, então `notif_prefs` não tinha nenhuma linha
 * pra ele, e com o default antigo (ausente = desligado) ele nunca recebia
 * toast nem push de recusa/impedimento — "às vezes aparece, às vezes não"
 * dependia inteiramente de QUEM estava logado ter passado por lá antes.
 * Uma linha explícita (o admin desligou de propósito em Configurações)
 * continua sendo respeitada — só o "nunca configurou" virou opt-out.
 */
export async function getCategoriaPrefs(
  usersIds: number[]
): Promise<Map<number, Record<NotifCategoria, boolean>>> {
  const m = new Map<number, Record<NotifCategoria, boolean>>();
  if (usersIds.length === 0) return m;
  await ensurePushTables();
  const vazio = () =>
    Object.fromEntries(NOTIF_CATEGORIAS.map((c) => [c, true])) as Record<NotifCategoria, boolean>;
  for (const id of usersIds) m.set(id, vazio());

  const placeholders = usersIds.map(() => "?").join(",");
  const rows = await query<{ users_id: number; categoria: NotifCategoria; ativo: number }>(
    `SELECT users_id, categoria, ativo FROM \`${TABLE_NOTIF_PREFS}\` WHERE users_id IN (${placeholders})`,
    usersIds
  );
  for (const r of rows) {
    const prefs = m.get(r.users_id);
    if (prefs) prefs[r.categoria] = Number(r.ativo) === 1;
  }
  return m;
}

/** Admin liga/desliga uma categoria de um usuário. */
export async function setCategoriaPref(
  userId: number,
  categoria: NotifCategoria,
  enabled: boolean
): Promise<void> {
  await ensurePushTables();
  await execute(
    `INSERT INTO \`${TABLE_NOTIF_PREFS}\` (users_id, categoria, ativo)
       VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE ativo = VALUES(ativo)`,
    [userId, categoria, enabled ? 1 : 0]
  );
  // Se não sobrou nenhuma categoria ativa, remove as inscrições do
  // navegador dele (para de receber já) — mesmo comportamento de antes,
  // só que condicionado a "zero categorias", não a um único flag.
  if (!enabled) {
    const [row] = await query<{ any_on: number }>(
      `SELECT MAX(ativo) AS any_on FROM \`${TABLE_NOTIF_PREFS}\` WHERE users_id = ?`,
      [userId]
    );
    if (!row || Number(row.any_on) !== 1) {
      await execute(`DELETE FROM \`${TABLE_SUBS}\` WHERE users_id = ?`, [userId]);
    }
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

/** Inscrições dos usuários com a categoria dada ativa (destinatários do push desse evento). */
/**
 * Inscrições que devem receber push desta categoria. LEFT JOIN + COALESCE (não
 * INNER JOIN): sem linha em notif_prefs a categoria é HABILITADA por padrão
 * — mesma regra de getCategoriaPrefs, ver comentário lá. Com INNER JOIN, um
 * analista que nunca abriu Configurações › Notificações tinha o navegador
 * inscrito (web_push_subs existe) mas NUNCA recebia push nenhum, silenciosamente.
 */
export async function listEnabledSubscriptions(categoria: NotifCategoria): Promise<WebPushSub[]> {
  await ensurePushTables();
  return query<WebPushSub>(
    `SELECT s.id, s.users_id, s.endpoint, s.p256dh, s.auth
       FROM \`${TABLE_SUBS}\` s
       LEFT JOIN \`${TABLE_NOTIF_PREFS}\` p
              ON p.users_id = s.users_id AND p.categoria = ?
      WHERE COALESCE(p.ativo, 1) = 1`,
    [categoria]
  );
}

/** Remove uma inscrição inválida (410/404 do endpoint). */
export async function deleteSubscriptionById(id: number): Promise<void> {
  await ensurePushTables();
  await execute(`DELETE FROM \`${TABLE_SUBS}\` WHERE id = ?`, [id]);
}
