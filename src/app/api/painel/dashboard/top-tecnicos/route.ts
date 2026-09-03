import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { fetchRankingTecnicosPeriodo } from "@/lib/glpi/topTecnicosDashboard";
import { fetchPendentesCpflPorMunicipio } from "@/lib/glpi/cpfl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolve o intervalo [inicio, fim] (ambos inclusivos, 'YYYY-MM-DD') a
 * partir do período nomeado do widget, ou de inicio/fim explícitos quando
 * periodo=personalizado.
 */
function resolvePeriodo(
  periodo: string,
  inicioParam: string | null,
  fimParam: string | null
): { inicio: string; fim: string } {
  const hoje = new Date();
  const fimDefault = isoDate(hoje);

  if (periodo === "personalizado" && inicioParam && fimParam && DATE_RE.test(inicioParam) && DATE_RE.test(fimParam)) {
    // inicio > fim seria um range invertido — troca em vez de rejeitar,
    // já que o datepicker do cliente não impede essa ordem.
    const [inicio, fim] = inicioParam <= fimParam ? [inicioParam, fimParam] : [fimParam, inicioParam];
    // Trava um teto de 366 dias — evita full-scan acidental de anos de dado
    // por um range digitado errado.
    const diasMs = new Date(fim).getTime() - new Date(inicio).getTime();
    const dias = diasMs / 86_400_000;
    if (dias > 366) {
      const inicioLimitado = new Date(new Date(fim).getTime() - 366 * 86_400_000);
      return { inicio: isoDate(inicioLimitado), fim };
    }
    return { inicio, fim };
  }

  const dias = periodo === "hoje" ? 0 : periodo === "semana" ? 6 : 29; // "mes" e default
  const inicioDate = new Date(hoje);
  inicioDate.setDate(inicioDate.getDate() - dias);
  return { inicio: isoDate(inicioDate), fim: fimDefault };
}

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const periodo = searchParams.get("periodo") ?? "mes";
    const { inicio, fim } = resolvePeriodo(
      periodo,
      searchParams.get("inicio"),
      searchParams.get("fim")
    );

    const [tecnicos, pendentesCpflPorMunicipio] = await Promise.all([
      fetchRankingTecnicosPeriodo(inicio, fim, 8),
      fetchPendentesCpflPorMunicipio(),
    ]);

    return NextResponse.json({ periodo: { inicio, fim }, tecnicos, pendentesCpflPorMunicipio });
  } catch (err) {
    console.error("[api/painel/dashboard/top-tecnicos] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar Top Técnicos", error: String(err) },
      { status: 500 }
    );
  }
}
