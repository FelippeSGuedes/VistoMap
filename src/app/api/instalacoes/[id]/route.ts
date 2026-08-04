import { NextResponse } from "next/server";
import { getInstalacao } from "@/lib/glpi/instalacoes";
import { getActorFromRequest } from "@/lib/auth-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor) {
      return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
    }

    const id = parseId(params.id);
    if (id == null) {
      return NextResponse.json({ message: "ID inválido" }, { status: 400 });
    }

    const instalacao = await getInstalacao(id);
    if (!instalacao) {
      return NextResponse.json({ message: "Instalação não encontrada" }, { status: 404 });
    }

    return NextResponse.json(instalacao);
  } catch (error) {
    console.error("[api/instalacoes/:id] GET error", error);
    return NextResponse.json(
      { message: "Falha ao buscar instalação", error: String(error) },
      { status: 500 }
    );
  }
}
