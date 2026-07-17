import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { query } from "@/lib/db";
import { DROPDOWN_TABLES, type DropdownKey } from "@/lib/glpi/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DropdownRow {
  id: number;
  name: string;
}

/**
 * Lista as opções cadastradas no GLPI para um dropdown do plugin Fields
 * (ex.: tipoifield → 2G/3G/4G). Usado pra popular <select> no app em vez
 * de o técnico digitar o valor livre (evita "4g"/"4G " virarem entradas
 * duplicadas no dropdown do GLPI).
 */
export async function GET(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) {
    return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  }

  const key = new URL(req.url).searchParams.get("key") as DropdownKey | null;
  const table = key ? DROPDOWN_TABLES[key] : undefined;
  if (!table) {
    return NextResponse.json({ message: "Dropdown desconhecido" }, { status: 400 });
  }

  const rows = await query<DropdownRow>(
    `SELECT id, name FROM \`${table}\` WHERE name IS NOT NULL AND name <> '' ORDER BY name`
  );
  return NextResponse.json(rows);
}
