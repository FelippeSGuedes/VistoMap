import { NextResponse } from "next/server";
import { fetchPainelStats } from "@/lib/glpi/painel";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const stats = await fetchPainelStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[api/painel/stats] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar KPIs", error: String(err) },
      { status: 500 }
    );
  }
}
