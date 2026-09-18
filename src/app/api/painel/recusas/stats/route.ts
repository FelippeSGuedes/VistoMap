import { NextResponse } from "next/server";
import { fetchRecusasStats } from "@/lib/glpi/recusas";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/painel/recusas/stats — impedimentos/recusas por motivo, pro dashboard. */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const stats = await fetchRecusasStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[api/painel/recusas/stats] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar estatísticas de impedimentos/recusas", error: String(err) },
      { status: 500 }
    );
  }
}
