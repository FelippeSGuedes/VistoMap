import { NextResponse } from "next/server";
import { fetchHistoricoAnalytics } from "@/lib/glpi/historico";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function diasAtras(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function diasEntre(inicio: string, fim: string): number {
  return Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000);
}

/**
 * GET /api/painel/historico — analytics operacional por período.
 *
 * `inicio`/`fim` (YYYY-MM-DD, ambos inclusive) definem o período REAL
 * selecionado (totais/taxas/médias/ranking/km/motivos). `inicioSerie`
 * (opcional) é só pra `serieDiaria` — o dashboard manda uma data mais
 * antiga aqui quando também precisa de uma janela anterior pra calcular
 * variação % (Widget de Vistorias Finalizadas), sem inflar os totais do
 * período real. Sem parâmetros, cai no default de sempre: últimos 30 dias.
 */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const inicioParam = searchParams.get("inicio");
    const fimParam = searchParams.get("fim");
    const inicioSerieParam = searchParams.get("inicioSerie");

    const fim = fimParam && ISO_DATE.test(fimParam) ? fimParam : diasAtras(0);
    const inicio = inicioParam && ISO_DATE.test(inicioParam) ? inicioParam : diasAtras(29);
    const inicioSerie =
      inicioSerieParam && ISO_DATE.test(inicioSerieParam) ? inicioSerieParam : inicio;

    // Trava de segurança: nunca deixa um range absurdo (parâmetro errado,
    // uso indevido da API) varrer a tabela inteira.
    const MAX_DIAS = 366 * 2;
    if (diasEntre(inicioSerie, fim) > MAX_DIAS || diasEntre(inicio, fim) > MAX_DIAS) {
      return NextResponse.json({ message: "Período máximo é de 2 anos." }, { status: 400 });
    }

    const data = await fetchHistoricoAnalytics(inicio, fim, inicioSerie);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/painel/historico] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar analytics", error: String(err) },
      { status: 500 }
    );
  }
}
