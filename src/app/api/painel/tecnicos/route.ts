import { NextResponse } from "next/server";
import { fetchTecnicos } from "@/lib/glpi/painel";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

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
