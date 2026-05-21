import { NextResponse } from "next/server";
import { fetchRevisitasPendentes } from "@/lib/glpi/painel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
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
