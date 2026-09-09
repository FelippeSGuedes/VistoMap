import "server-only";
import { execute } from "./db";

let ensured = false;

/**
 * Controla "já alertei esse episódio de técnico parado, não repetir a cada
 * ciclo do cron" — `resolvido_em IS NULL` = alerta em aberto pra esse
 * técnico; fecha quando ele volta a se mover ou entra em vistoria. Ver
 * api/painel/cron/tecnico-parado/route.ts.
 */
export async function ensureIdleAlertsTable(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`glpi_plugin_vistomap_idle_alerts\` (
      \`id\`           int(11)   NOT NULL AUTO_INCREMENT,
      \`users_id\`     int(11)   NOT NULL,
      \`alertado_em\`  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`resolvido_em\` timestamp NULL DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      KEY \`idx_users_aberto\` (\`users_id\`, \`resolvido_em\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}
