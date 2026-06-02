import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { finalizarExpediente } from "@/lib/expediente";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/expediente/finalizar
 * Encerra expediente em aberto. No-op se nao houver.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  let userId: number;
  let userNome = "Tecnico";
  try {
    const claims = await verifySessionJwt(token);
    userId = Number(claims.sub);
    userNome = claims.email ?? "Tecnico";
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }
  const r = await finalizarExpediente(userId);
  if (!r.ok) {
    return NextResponse.json(
      { message: "Nenhum expediente em aberto" },
      { status: 404 }
    );
  }
  void auditInsert({
    ator: { id: userId, nome: userNome, role: "tecnico" },
    acao: "expediente-finalizado",
    alvo: r.expedienteId
      ? { tipo: "expediente", id: String(r.expedienteId) }
      : undefined,
    descricao: "Expediente encerrado",
  });
  return NextResponse.json({ ok: true });
}
