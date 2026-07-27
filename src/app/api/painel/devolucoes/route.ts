import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { fetchDevolucoes, fetchDevolucoesStats } from "@/lib/glpi/devolucoes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/devolucoes?desde=&ate=  (admin)
 *
 * Dashboard de Devoluções — totais, rank de motivos, rank de técnicos e a
 * lista das devoluções mais recentes (pra tabela de acompanhamento).
 */
export async function GET(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  try {
    const claims = await verifySessionJwt(token);
    if (claims.role !== "admin") return NextResponse.json({ message: "Acesso negado" }, { status: 403 });
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde") ?? undefined;
  const ate = searchParams.get("ate") ?? undefined;

  try {
    const [stats, recentes] = await Promise.all([
      fetchDevolucoesStats({ desde, ate }),
      fetchDevolucoes({ desde, ate, limit: 30 }),
    ]);
    return NextResponse.json({ stats, recentes });
  } catch (err) {
    return NextResponse.json({ message: "Erro ao carregar devoluções", error: String(err) }, { status: 500 });
  }
}
