import { NextResponse } from "next/server";
import { getInstalacao } from "@/lib/glpi/instalacoes";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Detalhe completo de um poste do módulo de Instalação, pro painel administrativo. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  try {
    const instalacao = await getInstalacao(id);
    if (!instalacao) {
      return NextResponse.json({ message: "Instalação não encontrada" }, { status: 404 });
    }
    return NextResponse.json(instalacao);
  } catch (err) {
    console.error("[api/painel/instalacoes/[id]] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar detalhe da instalação", error: String(err) },
      { status: 500 }
    );
  }
}
