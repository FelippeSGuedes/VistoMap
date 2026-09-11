import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { fetchOcorrencias } from "@/lib/glpi/ocorrencias";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/ocorrencias — impedimentos, recusas e exceções unificados.
 *
 * Devolve tudo de uma vez (com o resumo já agregado no servidor): a tela é um
 * painel operacional, não uma lista paginada, e os filtros precisam contar o
 * conjunto inteiro pra os indicadores baterem com o que está na tela.
 */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const dados = await fetchOcorrencias();
    return NextResponse.json(dados);
  } catch (err) {
    console.error("[api/painel/ocorrencias] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar ocorrências", error: String(err) },
      { status: 500 }
    );
  }
}
