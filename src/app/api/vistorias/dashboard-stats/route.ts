import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { fetchTrend7d } from "@/lib/glpi/dashboardSnapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/vistorias/dashboard-stats (técnico) — tendência real de 7 dias
 * dos 5 KPIs do "Resumo operacional" (dashboard/page.tsx). Os valores de
 * HOJE continuam calculados ao vivo no cliente a partir de fetchVistorias()
 * (já eram reais) — esta rota só supre o histórico que faltava.
 */
export async function GET(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) {
    return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  }
  try {
    const trend7d = await fetchTrend7d(actor.id);
    return NextResponse.json({
      total: 0,
      pendentes: 0,
      concluidas: 0,
      reprovadas: 0,
      devolucoes: 0,
      repetidores: 0,
      ultimaSincronizacao: new Date().toISOString(),
      trend7d,
    });
  } catch (error) {
    console.error("[api/vistorias/dashboard-stats] error", error);
    return NextResponse.json(
      { message: "Falha ao carregar estatísticas", error: String(error) },
      { status: 500 }
    );
  }
}
