import { NextRequest, NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { fetchPainelMapa } from "@/lib/glpi/painel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const data = await fetchPainelMapa();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/painel/mapa] GET error", err);
    return NextResponse.json(
      { message: "Falha ao carregar mapa operacional", error: String(err) },
      { status: 500 }
    );
  }
}
