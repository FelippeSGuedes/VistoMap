import { NextResponse } from "next/server";
import { getVistoria } from "@/lib/glpi/equipments";
import { getActorFromRequest } from "@/lib/auth-request";
import { expedienteAtual } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }
  try {
    const actor = await getActorFromRequest(request);
    if (!actor) {
      return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
    }

    const exp = await expedienteAtual(actor.id);
    if (!exp?.emAndamento) {
      return NextResponse.json(
        {
          message: "Inicie o expediente antes de abrir o mapa e acessar as vistorias do dia.",
          precisaIniciarExpediente: true,
        },
        { status: 403 }
      );
    }

    if (exp.emPausa) {
      return NextResponse.json(
        {
          message: "Você está em pausa para almoço. Retorne do almoço para acessar as vistorias.",
          emPausaAlmoco: true,
        },
        { status: 403 }
      );
    }

    const vistoria = await getVistoria(id);
    if (!vistoria) {
      return NextResponse.json({ message: "Vistoria não encontrada" }, { status: 404 });
    }
    return NextResponse.json(vistoria);
  } catch (error) {
    console.error("[api/vistorias/:id] GET error", error);
    return NextResponse.json(
      { message: "Falha ao carregar vistoria", error: String(error) },
      { status: 500 }
    );
  }
}
