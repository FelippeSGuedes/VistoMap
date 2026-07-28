import { NextResponse } from "next/server";
import { fetchRevisitasPendentes } from "@/lib/glpi/painel";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const lista = await fetchRevisitasPendentes();
    return NextResponse.json(lista);
  } catch (err) {
    console.error("[api/painel/revisitas] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar revisitas", error: String(err) },
      { status: 500 }
    );
  }
}
