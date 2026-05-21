import { NextResponse } from "next/server";
import { fetchPainelStats } from "@/lib/glpi/painel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
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
