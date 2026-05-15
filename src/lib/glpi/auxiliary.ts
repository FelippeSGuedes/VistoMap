import "server-only";
import { execute, query } from "@/lib/db";
import { ITEMTYPE_NE, TABLE_AUX } from "./constants";

async function ensureTableExists(): Promise<void> {
  await execute(
    `CREATE TABLE IF NOT EXISTS \`${TABLE_AUX}\` (
      id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
      items_id       INT UNSIGNED NOT NULL,
      itemtype       VARCHAR(100) NOT NULL DEFAULT 'NetworkEquipment',
      equipment_name VARCHAR(255) NOT NULL,
      project_status VARCHAR(50)  NOT NULL DEFAULT 'PENDENTE',
      project_date   DATETIME NULL,
      image1_path    TEXT NULL,
      image2_path    TEXT NULL,
      image3_path    TEXT NULL,
      PRIMARY KEY (id),
      KEY idx_items (items_id, itemtype)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    []
  );
}

interface AuxRow {
  id: number;
}

export interface AuxUpsertInput {
  items_id: number;
  itemtype?: string;
  equipment_name: string;
  project_status: string;
  project_date?: string;
  image1_path?: string;
  image2_path?: string;
  image3_path?: string;
}

export async function upsertAuxiliaryProject(input: AuxUpsertInput): Promise<number> {
  await ensureTableExists();
  const itemtype = input.itemtype ?? ITEMTYPE_NE;
  const existing = await query<AuxRow>(
    `SELECT id FROM \`${TABLE_AUX}\` WHERE items_id = ? AND itemtype = ? LIMIT 1`,
    [input.items_id, itemtype]
  );

  // equipment_name + project_status são obrigatórios no INSERT.
  const cols: string[] = ["equipment_name", "project_status"];
  const values: unknown[] = [input.equipment_name, input.project_status];
  const pairs: string[] = [
    "equipment_name = ?",
    "project_status = ?",
  ];

  if (input.project_date) {
    cols.push("project_date");
    values.push(input.project_date);
    pairs.push("project_date = ?");
  }
  if (input.image1_path) {
    cols.push("image1_path");
    values.push(input.image1_path);
    pairs.push("image1_path = ?");
  }
  if (input.image2_path) {
    cols.push("image2_path");
    values.push(input.image2_path);
    pairs.push("image2_path = ?");
  }
  if (input.image3_path) {
    cols.push("image3_path");
    values.push(input.image3_path);
    pairs.push("image3_path = ?");
  }

  if (existing.length > 0) {
    const id = existing[0].id;
    const sql = `UPDATE \`${TABLE_AUX}\` SET ${pairs.join(", ")} WHERE id = ?`;
    await execute(sql, [...values, id]);
    return id;
  }

  const insertCols = ["items_id", "itemtype", ...cols];
  const placeholders = insertCols.map(() => "?").join(", ");
  const sql = `INSERT INTO \`${TABLE_AUX}\` (${insertCols
    .map((c) => `\`${c}\``)
    .join(", ")}) VALUES (${placeholders})`;
  const result = await execute(sql, [input.items_id, itemtype, ...values]);
  return result.insertId;
}
