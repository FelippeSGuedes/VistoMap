import { NextRequest, NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { expedienteHistorico } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/expediente/historico?users_id=X&desde=&ate=&limit=  (admin)
 *
 * Histórico completo de turnos de um técnico — não só o expediente em
 * aberto. Cada linha de `glpi_plugin_vistomap_expediente` é um registro
 * permanente (nunca sobrescrito), então dá pra auditar exatamente quando
 * cada expediente começou/terminou, sem depender do que o técnico "disse".
 */
export async function GET(req: NextRequest) {
  const auth = await requirePainelRole(req, "moderador");
  if (!auth.ok) return auth.response;

  const usersId = Number(req.nextUrl.searchParams.get("users_id"));
  if (!usersId || Number.isNaN(usersId)) {
    return NextResponse.json({ message: "users_id obrigatorio" }, { status: 400 });
  }
  const desde = req.nextUrl.searchParams.get("desde") ?? undefined;
  const ate = req.nextUrl.searchParams.get("ate") ?? undefined;
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const itens = await expedienteHistorico(usersId, { desde, ate, limit });
  return NextResponse.json({ users_id: usersId, itens, total: itens.length });
}
