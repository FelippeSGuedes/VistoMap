import { NextResponse } from "next/server";
import { fetchPainelInstalacoesMapa } from "@/lib/glpi/painel-instalacoes";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const mapa = await fetchPainelInstalacoesMapa();
    return NextResponse.json(mapa);
  } catch (err) {
    console.error("[api/painel/instalacoes/mapa] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar mapa de instalação", error: String(err) },
      { status: 500 }
    );
  }
}
