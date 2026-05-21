import { NextResponse } from "next/server";
import { fetchFilaVistorias, type FilaFilters } from "@/lib/glpi/painel";
import type { AdminStatus } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filters: FilaFilters = {
      status: (searchParams.get("status") as AdminStatus) || undefined,
      municipio: searchParams.get("municipio") || undefined,
      tecnico_id: searchParams.get("tecnico_id")
        ? Number(searchParams.get("tecnico_id"))
        : undefined,
      is_repeat:
        searchParams.get("is_repeat") === "1"
          ? true
          : searchParams.get("is_repeat") === "0"
          ? false
          : undefined,
      query: searchParams.get("q") || undefined,
      limit: searchParams.get("limit")
        ? Number(searchParams.get("limit"))
        : undefined,
      offset: searchParams.get("offset")
        ? Number(searchParams.get("offset"))
        : undefined,
    };
    const items = await fetchFilaVistorias(filters);
    return NextResponse.json(items);
  } catch (err) {
    console.error("[api/painel/vistorias] error", err);
    return NextResponse.json(
      { message: "Falha ao listar fila", error: String(err) },
      { status: 500 }
    );
  }
}
