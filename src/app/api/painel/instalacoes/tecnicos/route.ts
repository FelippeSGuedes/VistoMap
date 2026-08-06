import { NextResponse } from "next/server";
import { fetchInstaladoresAtivos } from "@/lib/glpi/painel-instalacoes";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const instaladores = await fetchInstaladoresAtivos();
    return NextResponse.json(instaladores);
  } catch (err) {
    console.error("[api/painel/instalacoes/tecnicos] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar instaladores", error: String(err) },
      { status: 500 }
    );
  }
}
