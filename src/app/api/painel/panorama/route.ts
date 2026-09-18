import { NextResponse } from "next/server";
import { fetchPanoramaOperacao } from "@/lib/glpi/panorama";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/painel/panorama — progresso, ritmo, projeção e funil da operação. */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const panorama = await fetchPanoramaOperacao();
    return NextResponse.json(panorama);
  } catch (err) {
    console.error("[api/painel/panorama] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar o panorama da operação", error: String(err) },
      { status: 500 }
    );
  }
}
