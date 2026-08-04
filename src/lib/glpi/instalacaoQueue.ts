import "server-only";
import { execute, query } from "@/lib/db";
import { ITEMTYPE_NE } from "./constants";

/**
 * Fila de geração de PDF do módulo de Instalação — tabela PRÓPRIA, separada
 * de `glpi_plugin_vistomap_projects` (fila do worker de vistoria). Um
 * worker Python novo e isolado (Fase 3) vai consumir esta tabela; o worker
 * de vistoria nunca a enxerga, nem ela a dele.
 */
const TABLE_INSTALACAO_AUX = "glpi_plugin_vistomap_instalacao_projects";

export type InstalacaoAuxStatus = "PENDENTE" | "GERANDO" | "GERADO" | "ERRO";

export interface InstalacaoAuxUpsertInput {
  items_id: number;
  itemtype?: string;
  equipment_name: string;
  project_status?: InstalacaoAuxStatus;
  project_date?: string;
  imagePaths: string[];
}

let ensured = false;

async function ensureTable(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE_INSTALACAO_AUX}\` (
      id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      equipment_name VARCHAR(255)    NOT NULL,
      items_id       INT UNSIGNED    NOT NULL,
      itemtype       VARCHAR(100)    NOT NULL DEFAULT 'NetworkEquipment',
      project_status VARCHAR(16)     NOT NULL DEFAULT 'PENDENTE',
      project_date   DATETIME        NULL,
      image1_path    VARCHAR(500)    NULL,
      image2_path    VARCHAR(500)    NULL,
      image3_path    VARCHAR(500)    NULL,
      image4_path    VARCHAR(500)    NULL,
      image5_path    VARCHAR(500)    NULL,
      image6_path    VARCHAR(500)    NULL,
      image7_path    VARCHAR(500)    NULL,
      pdf_path          VARCHAR(500) NULL,
      approved_pdf_path VARCHAR(500) NULL,
      error_log      TEXT            NULL,
      generated_at   DATETIME        NULL,
      approved_at    DATETIME        NULL,
      created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_equipment_name (equipment_name),
      KEY idx_items (items_id, itemtype),
      KEY idx_status (project_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

interface AuxRow {
  id: number;
}

/** UPSERT na fila — UNIQUE KEY é `equipment_name`, igual ao padrão da vistoria. */
export async function upsertInstalacaoQueue(input: InstalacaoAuxUpsertInput): Promise<number> {
  await ensureTable();
  const itemtype = input.itemtype ?? ITEMTYPE_NE;
  const status: InstalacaoAuxStatus = input.project_status ?? "PENDENTE";
  const [i1, i2, i3, i4, i5, i6, i7] = input.imagePaths;

  const sql = `
    INSERT INTO \`${TABLE_INSTALACAO_AUX}\`
      (equipment_name, items_id, itemtype, project_status, project_date,
       image1_path, image2_path, image3_path, image4_path, image5_path, image6_path, image7_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      items_id       = VALUES(items_id),
      itemtype       = VALUES(itemtype),
      project_status = VALUES(project_status),
      project_date   = COALESCE(VALUES(project_date), project_date),
      image1_path    = COALESCE(VALUES(image1_path), image1_path),
      image2_path    = COALESCE(VALUES(image2_path), image2_path),
      image3_path    = COALESCE(VALUES(image3_path), image3_path),
      image4_path    = COALESCE(VALUES(image4_path), image4_path),
      image5_path    = COALESCE(VALUES(image5_path), image5_path),
      image6_path    = COALESCE(VALUES(image6_path), image6_path),
      image7_path    = COALESCE(VALUES(image7_path), image7_path)
  `;
  const result = await execute(sql, [
    input.equipment_name,
    input.items_id,
    itemtype,
    status,
    input.project_date ?? null,
    i1 ?? null,
    i2 ?? null,
    i3 ?? null,
    i4 ?? null,
    i5 ?? null,
    i6 ?? null,
    i7 ?? null,
  ]);

  if (result.insertId > 0) return result.insertId;

  const rows = await query<AuxRow>(
    `SELECT id FROM \`${TABLE_INSTALACAO_AUX}\` WHERE equipment_name = ? LIMIT 1`,
    [input.equipment_name]
  );
  return rows[0]?.id ?? 0;
}
