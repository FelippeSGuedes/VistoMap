import { NextResponse } from "next/server";
import { fetchVistoriasRealizadas, fetchVistoriasRealizadasStats } from "@/lib/glpi/painel";
import { requirePainelRole } from "@/lib/painel-auth";

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const { searchParams: p } = new URL(req.url);
  const municipio  = p.get("municipio")  ?? undefined;
  const tecnico_id = p.get("tecnico_id") ? Number(p.get("tecnico_id")) : undefined;
  const qParam     = p.get("q")          ?? undefined;
  const status     = (p.get("status") as "VISTORIADO" | "REVISITADO" | null) ?? undefined;
  const limit      = p.get("limit")  ? Number(p.get("limit"))  : undefined;
  const offset     = p.get("offset") ? Number(p.get("offset")) : undefined;

  try {
    const [items, stats] = await Promise.all([
      fetchVistoriasRealizadas({ municipio, tecnico_id, query: qParam, status, limit, offset }),
      // Contagens reais (sem LIMIT) — nunca refletem só a página atual.
      fetchVistoriasRealizadasStats({ municipio, tecnico_id, query: qParam }),
    ]);
    return NextResponse.json({ items, stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/painel/realizadas]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
