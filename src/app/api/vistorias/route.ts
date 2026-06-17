import { NextResponse } from "next/server";
import { listVistorias } from "@/lib/glpi/equipments";
import { getActorFromRequest } from "@/lib/auth-request";
import { expedienteAtual } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lista vistorias do usuario logado (sempre filtrado pelo seu id).
 *
 * Endpoint usado SOMENTE pelo /app (mobile do tecnico). Mesmo se o user
 * for admin+tecnico, no /app ele atua como tecnico — so ve atribuidas.
 * View admin "todas" vive em /api/painel/* .
 */
export async function GET(req: Request) {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor) {
      return NextResponse.json(
        { message: "Não autenticado" },
        { status: 401 }
      );
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

    const concluidas = new URL(req.url).searchParams.get("concluidas") === "1";
    const items = await listVistorias({ tecnicoId: actor.id, concluidas });
    return NextResponse.json(items);
  } catch (error) {
    console.error("[api/vistorias] GET error", error);
    return NextResponse.json(
      { message: "Falha ao listar vistorias", error: String(error) },
      { status: 500 }
    );
  }
}
