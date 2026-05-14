import "server-only";
import { execute, query } from "@/lib/db";
import { ITEMTYPE_NE, TABLE_AUX } from "./constants";

interface AuxRow {
  id: number;
}

export interface AuxUpsertInput {
  items_id: number;
  itemtype?: string;
  project_status: string;
  project_date?: string;
  image1_path?: string;
  image2_path?: string;
  image3_path?: string;
}

export async function upsertAuxiliaryProject(input: AuxUpsertInput): Promise<number> {
  const itemtype = input.itemtype ?? ITEMTYPE_NE;
  const existing = await query<AuxRow>(
    `SELECT id FROM \`${TABLE_AUX}\` WHERE items_id = ? AND itemtype = ? LIMIT 1`,
    [input.items_id, itemtype]
  );

  const cols: string[] = ["project_status"];
  const values: unknown[] = [input.project_status];
  const pairs: string[] = ["project_status = ?"];

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
