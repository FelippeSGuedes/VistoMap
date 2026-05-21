import { NextResponse } from "next/server";
import { fetchTecnicos } from "@/lib/glpi/painel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const tecnicos = await fetchTecnicos();
    return NextResponse.json(tecnicos);
  } catch (err) {
    console.error("[api/painel/tecnicos] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar técnicos", error: String(err) },
      { status: 500 }
    );
  }
}
