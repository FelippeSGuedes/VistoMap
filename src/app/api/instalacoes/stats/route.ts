import { NextResponse } from "next/server";
import { countInstaladasPorMim } from "@/lib/glpi/instalacoes";
import { listInstalacaoRejeicoes } from "@/lib/glpi/instalacaoRejeicoes";
import { getActorFromRequest } from "@/lib/auth-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/instalacoes/stats
 *
 * Números do instalador logado que não vêm de graça na listagem (que só
 * traz Liberadas/Em Instalação): instaladas por ele nos últimos 30 dias e
 * rejeições dele ainda pendentes de decisão do analista.
 */
export async function GET(req: Request) {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor) {
      return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
    }

    const [instaladas, rejeicoesPendentes] = await Promise.all([
      countInstaladasPorMim(actor.id),
      listInstalacaoRejeicoes("PENDENTE", 500),
    ]);

    const minhasRejeicoesPendentes = rejeicoesPendentes.filter((r) => r.instalador_id === actor.id).length;

    return NextResponse.json({
      instaladas30d: instaladas,
      rejeitadasPendentes: minhasRejeicoesPendentes,
    });
  } catch (error) {
    console.error("[api/instalacoes/stats] GET error", error);
    return NextResponse.json(
      { message: "Falha ao buscar estatísticas", error: String(error) },
      { status: 500 }
    );
  }
}
