import { NextResponse } from "next/server";
import { fetchPainelInstalacoesStats } from "@/lib/glpi/painel-instalacoes";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const stats = await fetchPainelInstalacoesStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[api/painel/instalacoes/stats] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar KPIs de instalação", error: String(err) },
      { status: 500 }
    );
  }
}
