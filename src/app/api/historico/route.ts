import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import {
  fetchHistoricoTecnico,
  type PeriodoHistorico,
} from "@/lib/glpi/historicoTecnico";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PERIODOS_VALIDOS: PeriodoHistorico[] = ["7d", "30d", "90d", "all"];

/**
 * GET /api/historico?periodo=7d|30d|90d|all
 *
 * Histórico operacional PESSOAL — sempre escopado pelo técnico do token,
 * nunca por um id vindo da query string (ver /historico do app).
 */
export async function GET(request: Request) {
  const actor = await getActorFromRequest(request).catch(() => null);
  if (!actor) {
    return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const periodoRaw = url.searchParams.get("periodo") ?? "7d";
  const periodo = (PERIODOS_VALIDOS as string[]).includes(periodoRaw)
    ? (periodoRaw as PeriodoHistorico)
    : "7d";

  try {
    const summary = await fetchHistoricoTecnico(actor.id, periodo);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[api/historico] error", error);
    return NextResponse.json(
      { message: "Falha ao carregar histórico", error: String(error) },
      { status: 500 }
    );
  }
}
