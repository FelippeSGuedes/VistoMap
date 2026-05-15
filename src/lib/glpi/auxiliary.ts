import "server-only";
import { execute, query } from "@/lib/db";
import { ITEMTYPE_NE, TABLE_AUX } from "./constants";

export type AuxProjectStatus = "PENDENTE" | "GERANDO" | "GERADO" | "ERRO";

export interface AuxUpsertInput {
  items_id: number;
  itemtype?: string;
  equipment_name: string;
  project_status?: AuxProjectStatus;
  project_date?: string;
  image1_path?: string;
  image2_path?: string;
  image3_path?: string;
}

interface AuxRow {
  id: number;
}

/**
 * UPSERT na tabela auxiliar. UNIQUE KEY é `equipment_name`.
 * `ON DUPLICATE KEY UPDATE` mantém atomicidade. Campos null preservam valor antigo.
 */
export async function upsertAuxiliaryProject(input: AuxUpsertInput): Promise<number> {
  const itemtype = input.itemtype ?? ITEMTYPE_NE;
  const status: AuxProjectStatus = input.project_status ?? "PENDENTE";

  const sql = `
    INSERT INTO \`${TABLE_AUX}\`
      (equipment_name, items_id, itemtype, project_status, project_date,
       image1_path, image2_path, image3_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      items_id       = VALUES(items_id),
      itemtype       = VALUES(itemtype),
      project_status = VALUES(project_status),
      project_date   = COALESCE(VALUES(project_date), project_date),
      image1_path    = COALESCE(VALUES(image1_path), image1_path),
      image2_path    = COALESCE(VALUES(image2_path), image2_path),
      image3_path    = COALESCE(VALUES(image3_path), image3_path)
  `;
  const result = await execute(sql, [
    input.equipment_name,
    input.items_id,
    itemtype,
    status,
    input.project_date ?? null,
    input.image1_path ?? null,
    input.image2_path ?? null,
    input.image3_path ?? null,
  ]);

  if (result.insertId > 0) return result.insertId;

  // Atualização: busca o id existente.
  const rows = await query<AuxRow>(
    `SELECT id FROM \`${TABLE_AUX}\` WHERE equipment_name = ? LIMIT 1`,
    [input.equipment_name]
  );
  return rows[0]?.id ?? 0;
}
