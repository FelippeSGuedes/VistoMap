import { NextRequest, NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { fetchPainelMapa } from "@/lib/glpi/painel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }

  try {
    const claims = await verifySessionJwt(token);
    if (claims.role !== "admin") {
      return NextResponse.json(
        { message: "Acesso restrito ao admin" },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  try {
    const data = await fetchPainelMapa();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/painel/mapa] GET error", err);
    return NextResponse.json(
      { message: "Falha ao carregar mapa operacional", error: String(err) },
      { status: 500 }
    );
  }
}
