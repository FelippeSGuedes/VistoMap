import { NextResponse } from "next/server";
import { fetchHistoricoAnalytics } from "@/lib/glpi/historico";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const dias = Number(searchParams.get("dias") ?? 30);
    const range = Number.isFinite(dias) && dias > 0 && dias <= 365 ? dias : 30;
    // diasAgregado: janela pros totais/taxas/médias — só difere de `dias`
    // quando o chamador (dashboard) também precisa de um período anterior
    // pra calcular variação %, sem inflar totais/taxas com ele.
    const diasAgregadoParam = searchParams.get("diasAgregado");
    const diasAgregado =
      diasAgregadoParam != null
        ? (() => {
            const n = Number(diasAgregadoParam);
            return Number.isFinite(n) && n > 0 && n <= 365 ? n : range;
          })()
        : range;
    const data = await fetchHistoricoAnalytics(range, diasAgregado);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/painel/historico] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar analytics", error: String(err) },
      { status: 500 }
    );
  }
}
