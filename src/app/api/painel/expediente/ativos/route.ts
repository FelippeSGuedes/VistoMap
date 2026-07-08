import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { expedientesAtivos, fecharExpedientesPendurados } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/expediente/ativos  (admin)
 * Lista todos os expedientes em aberto AGORA. Antes de listar, varre e fecha
 * expedientes "pendurados" (abertos num dia anterior — ex.: app do técnico
 * ficou sem sinal no fim do turno) para o painel nunca mostrar alguém
 * "em campo há 2 dias" por erro de sincronização.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  try {
    const claims = await verifySessionJwt(token);
    if (claims.role !== "admin") {
      return NextResponse.json({ message: "Acesso restrito" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }
  await fecharExpedientesPendurados();
  const items = await expedientesAtivos();
  return NextResponse.json({ ativos: items, total: items.length });
}
