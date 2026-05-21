import { NextResponse } from "next/server";
import { listVistorias } from "@/lib/glpi/equipments";
import { getActorFromRequest } from "@/lib/auth-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lista vistorias do técnico logado.
 *
 * Regra: técnico só enxerga o que está atribuído a ele (via
 * users_id_vistoriadorafield). Admin enxerga tudo. Sem JWT válido → 401.
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
    const tecnicoId = actor.role === "admin" ? undefined : actor.id;
    const items = await listVistorias({ tecnicoId });
    return NextResponse.json(items);
  } catch (error) {
    console.error("[api/vistorias] GET error", error);
    return NextResponse.json(
      { message: "Falha ao listar vistorias", error: String(error) },
      { status: 500 }
    );
  }
}
