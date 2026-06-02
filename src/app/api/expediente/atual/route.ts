import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import {
  expedienteAtual,
  jaAceitouLGPD,
} from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/expediente/atual
 * Retorna expediente em aberto do usuario logado (ou null) + flag de LGPD.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  }
  let userId: number;
  try {
    const claims = await verifySessionJwt(token);
    userId = Number(claims.sub);
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }
  const [exp, lgpd] = await Promise.all([
    expedienteAtual(userId),
    jaAceitouLGPD(userId),
  ]);
  return NextResponse.json({ expediente: exp, lgpdAceito: lgpd });
}
