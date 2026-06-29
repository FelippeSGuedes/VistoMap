import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { listCentralVistorias } from "@/lib/glpi/painel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  try {
    const claims = await verifySessionJwt(token);
    if (claims.role !== "admin") return NextResponse.json({ message: "Acesso negado" }, { status: 403 });
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }
  try {
    const vistorias = await listCentralVistorias();
    return NextResponse.json({ vistorias });
  } catch (err) {
    return NextResponse.json({ message: "Erro ao listar vistorias", error: String(err) }, { status: 500 });
  }
}
