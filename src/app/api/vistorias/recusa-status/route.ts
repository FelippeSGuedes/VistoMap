import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { fetchRecusaPorId } from "@/lib/glpi/recusas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/vistorias/recusa-status?recusaId=  (técnico)
 *
 * Polling do status de uma recusa enquanto o técnico espera aprovação —
 * mesmo padrão do override-request, tabela própria.
 */
export async function GET(request: Request) {
  const actor = await getActorFromRequest(request);
  if (!actor) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const recusaId = Number(searchParams.get("recusaId"));
  if (!recusaId || !Number.isFinite(recusaId)) {
    return NextResponse.json({ message: "recusaId inválido" }, { status: 400 });
  }

  const recusa = await fetchRecusaPorId(recusaId);
  if (!recusa) return NextResponse.json({ message: "Recusa não encontrada" }, { status: 404 });

  return NextResponse.json({
    status: recusa.status,
    motivoReprovacao: recusa.motivoReprovacao,
  });
}
