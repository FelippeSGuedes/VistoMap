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
    const data = await fetchHistoricoAnalytics(range);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/painel/historico] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar analytics", error: String(err) },
      { status: 500 }
    );
  }
}
