import { NextResponse } from "next/server";
import { listCentralInstalacoes } from "@/lib/glpi/instalacoes";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/instalacoes/central — postes já tocados (Em Instalação ou
 * Instalado) pro console administrativo (reatribuir/devolver/cancelar).
 * Espelha GET /api/painel/central-vistorias.
 */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "moderador");
  if (!auth.ok) return auth.response;

  try {
    const instalacoes = await listCentralInstalacoes();
    return NextResponse.json({ instalacoes });
  } catch (err) {
    console.error("[api/painel/instalacoes/central] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar Central das Instalações", error: String(err) },
      { status: 500 }
    );
  }
}
