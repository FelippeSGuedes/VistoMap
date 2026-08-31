import { NextResponse } from "next/server";
import { fetchCPFLStats, fetchVistoriasCPFL, type EtapaCPFL } from "@/lib/glpi/cpfl";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ETAPAS: EtapaCPFL[] = ["AGUARDANDO", "APROVADA", "REPROVADA"];

/**
 * Acompanhamento da validação da concessionária (CPFL).
 *
 * Somente leitura: quem aprova/reprova é a CPFL, direto no GLPI. Por isso
 * este arquivo não expõe POST/PATCH — e o papel exigido é "leitura".
 */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const { searchParams: p } = new URL(req.url);
  const etapaRaw = p.get("etapa");
  const etapa = ETAPAS.includes(etapaRaw as EtapaCPFL)
    ? (etapaRaw as EtapaCPFL)
    : undefined;

  const filtros = {
    etapa,
    municipio: p.get("municipio") ?? undefined,
    tecnico_id: p.get("tecnico_id") ? Number(p.get("tecnico_id")) : undefined,
    query: p.get("q") ?? undefined,
    limit: p.get("limit") ? Number(p.get("limit")) : undefined,
    offset: p.get("offset") ? Number(p.get("offset")) : undefined,
  };

  try {
    const [items, stats] = await Promise.all([
      fetchVistoriasCPFL(filtros),
      fetchCPFLStats(filtros),
    ]);
    return NextResponse.json({ items, stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/painel/cpfl]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
