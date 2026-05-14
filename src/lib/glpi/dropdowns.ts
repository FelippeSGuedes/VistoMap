import "server-only";
import { execute, query } from "@/lib/db";
import { DROPDOWN_TABLES, type DropdownKey } from "./constants";

interface DropdownRow {
  id: number;
  name: string;
}

/**
 * Procura o id pelo `name`. Se não existir, cria automaticamente.
 * Retorna o id ou null se o valor for vazio.
 */
export async function findOrCreateDropdown(
  key: DropdownKey,
  value: string | null | undefined
): Promise<number | null> {
  const trimmed = (value ?? "").toString().trim();
  if (!trimmed) return null;

  const table = DROPDOWN_TABLES[key];
  if (!table) throw new Error(`Dropdown desconhecido: ${key}`);

  const found = await query<DropdownRow>(
    `SELECT id, name FROM \`${table}\` WHERE name = ? LIMIT 1`,
    [trimmed]
  );
  if (found.length > 0) return Number(found[0].id);

  const result = await execute(
    `INSERT INTO \`${table}\` (name, completename, comment, level) VALUES (?, ?, '', 0)`,
    [trimmed, trimmed]
  );
  return Number(result.insertId);
}

/** Resolve em paralelo um mapa parcial de dropdowns para ids. */
export async function resolveDropdowns(
  input: Partial<Record<DropdownKey, string | null | undefined>>
): Promise<Partial<Record<DropdownKey, number | null>>> {
  const entries = Object.entries(input) as Array<[DropdownKey, string | null | undefined]>;
  const resolved = await Promise.all(
    entries.map(async ([key, value]) => [key, await findOrCreateDropdown(key, value)] as const)
  );
  return Object.fromEntries(resolved) as Partial<Record<DropdownKey, number | null>>;
}
