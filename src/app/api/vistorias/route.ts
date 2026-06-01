import { NextResponse } from "next/server";
import { listVistorias } from "@/lib/glpi/equipments";
import { getActorFromRequest } from "@/lib/auth-request";

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
    const items = await listVistorias({ tecnicoId: actor.id });
    return NextResponse.json(items);
  } catch (error) {
    console.error("[api/vistorias] GET error", error);
    return NextResponse.json(
      { message: "Falha ao listar vistorias", error: String(error) },
      { status: 500 }
    );
  }
}
