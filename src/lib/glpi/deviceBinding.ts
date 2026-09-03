import "server-only";
import { execute, query } from "@/lib/db";

/**
 * Vínculo técnico ↔ aparelho (/liberar-acesso). Tabela criada on-demand,
 * mesmo padrão de audit.ts/observability.ts.
 *
 * "Vínculo ativo" = linha com `revogado_em IS NULL`. Sem UNIQUE KEY pra
 * isso (MySQL/MariaDB não faz unique parcial de forma limpa) — checar em
 * código antes de cada insert é o mesmo espírito de outros status
 * controlados em aplicação já usados no projeto (ex.: project_status da
 * TABLE_AUX). Cada revogação vira uma nova linha na próxima ativação —
 * mantém histórico completo, nunca apaga.
 */

const TABLE_DEVICE_BINDING = "glpi_plugin_vistomap_device_binding";

let ensured = false;

export async function ensureDeviceBindingTable(): Promise<void> {
  if (ensured) return;
  await execute(
    `
      CREATE TABLE IF NOT EXISTS \`${TABLE_DEVICE_BINDING}\` (
        id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        users_id              INT             NOT NULL,
        device_id             VARCHAR(191)    NOT NULL,
        device_model          VARCHAR(255)    NULL,
        nome_confirmado       VARCHAR(255)    NOT NULL,
        email_confirmado      VARCHAR(255)    NOT NULL,
        matricula_confirmada  VARCHAR(64)     NULL,
        termo_versao          VARCHAR(16)     NOT NULL DEFAULT 'v1',
        aceito_em             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revogado_em           TIMESTAMP       NULL,
        revogado_por          INT             NULL,
        PRIMARY KEY (id),
        KEY idx_users_ativo  (users_id, revogado_em),
        KEY idx_device_ativo (device_id, revogado_em)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
  ensured = true;
}

export interface DeviceBindingRow {
  id: number;
  users_id: number;
  device_id: string;
  device_model: string | null;
  nome_confirmado: string;
  email_confirmado: string;
  matricula_confirmada: string | null;
  termo_versao: string;
  aceito_em: string;
  revogado_em: string | null;
  revogado_por: number | null;
}

export async function fetchActiveBindingByUser(usersId: number): Promise<DeviceBindingRow | null> {
  await ensureDeviceBindingTable();
  const rows = await query<DeviceBindingRow>(
    `SELECT * FROM \`${TABLE_DEVICE_BINDING}\`
      WHERE users_id = ? AND revogado_em IS NULL
      LIMIT 1`,
    [usersId]
  );
  return rows[0] ?? null;
}

export async function fetchActiveBindingByDevice(deviceId: string): Promise<DeviceBindingRow | null> {
  await ensureDeviceBindingTable();
  const rows = await query<DeviceBindingRow>(
    `SELECT * FROM \`${TABLE_DEVICE_BINDING}\`
      WHERE device_id = ? AND revogado_em IS NULL
      LIMIT 1`,
    [deviceId]
  );
  return rows[0] ?? null;
}

export interface CreateBindingInput {
  usersId: number;
  deviceId: string;
  deviceModel?: string | null;
  nomeConfirmado: string;
  emailConfirmado: string;
  matriculaConfirmada?: string | null;
}

export async function createBinding(input: CreateBindingInput): Promise<void> {
  await ensureDeviceBindingTable();
  await execute(
    `INSERT INTO \`${TABLE_DEVICE_BINDING}\`
       (users_id, device_id, device_model, nome_confirmado, email_confirmado, matricula_confirmada)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.usersId,
      input.deviceId,
      input.deviceModel ?? null,
      input.nomeConfirmado,
      input.emailConfirmado,
      input.matriculaConfirmada ?? null,
    ]
  );
}

export async function revokeBinding(id: number, adminId: number): Promise<void> {
  await ensureDeviceBindingTable();
  await execute(
    `UPDATE \`${TABLE_DEVICE_BINDING}\`
        SET revogado_em = CURRENT_TIMESTAMP, revogado_por = ?
      WHERE id = ? AND revogado_em IS NULL`,
    [adminId, id]
  );
}

export interface BindingComTecnico extends DeviceBindingRow {
  tecnico_nome: string;
}

/** Lista pro painel — um vínculo ATIVO por técnico (histórico fica de fora). */
export async function fetchAllBindingsAtivos(): Promise<BindingComTecnico[]> {
  await ensureDeviceBindingTable();
  return query<BindingComTecnico>(
    `SELECT b.*,
            COALESCE(NULLIF(TRIM(CONCAT(u.firstname, ' ', u.realname)), ''), u.name) AS tecnico_nome
       FROM \`${TABLE_DEVICE_BINDING}\` b
       LEFT JOIN glpi_users u ON u.id = b.users_id
      WHERE b.revogado_em IS NULL
      ORDER BY b.aceito_em DESC`
  );
}
