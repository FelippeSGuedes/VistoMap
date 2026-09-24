import { NextResponse } from "next/server";
import { fetchConcessionariasDisponiveis } from "@/lib/glpi/painel";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/painel/concessionarias — opções do filtro global do dashboard. */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const concessionarias = await fetchConcessionariasDisponiveis();
    return NextResponse.json(concessionarias);
  } catch (err) {
    console.error("[api/painel/concessionarias] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar concessionárias", error: String(err) },
      { status: 500 }
    );
  }
}
