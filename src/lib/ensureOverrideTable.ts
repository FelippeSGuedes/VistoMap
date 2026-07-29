import "server-only";
import { execute } from "./db";

let ensured = false;

export async function ensureOverrideTable(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`glpi_plugin_vistomap_override_requests\` (
      \`id\`                int(11)      NOT NULL AUTO_INCREMENT,
      \`vistoria_id\`       int(11)      NOT NULL,
      \`users_id\`          int(11)      NOT NULL DEFAULT 0,
      \`equipamento\`       varchar(255) NOT NULL DEFAULT '',
      \`tecnico_nome\`      varchar(255) NOT NULL DEFAULT '',
      \`justificativa\`     text         NOT NULL,
      \`status\`            enum('PENDENTE','APROVADO','REPROVADO') NOT NULL DEFAULT 'PENDENTE',
      \`motivo_reprovacao\` text         DEFAULT NULL,
      \`distancia_m\`       int(11)      DEFAULT NULL,
      \`exception_label\`   varchar(100) DEFAULT NULL,
      \`created_at\`        timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\`        timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_status\`   (\`status\`),
      KEY \`idx_vistoria\` (\`vistoria_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}
