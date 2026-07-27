import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { fetchDevolucaoPendente } from "@/lib/glpi/devolucoes";
import { getVistoria } from "@/lib/glpi/equipments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/vistorias/devolucao-pendente  (técnico)
 *
 * Consultado no cold-start do app e periodicamente com o app aberto
 * (useDevolucaoWatcher) — se o técnico logado tem alguma devolução
 * PENDENTE, retorna os dados pro modal "Houve um problema" + tela de
 * correção. `{ devolucao: null }` quando não há nada pendente.
 */
export async function GET(request: Request) {
  const actor = await getActorFromRequest(request);
  if (!actor) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  const devolucao = await fetchDevolucaoPendente(actor.id);
  if (!devolucao) return NextResponse.json({ devolucao: null });

  const vistoria = await getVistoria(devolucao.vistoriaId);

  return NextResponse.json({
    devolucao,
    vistoria: vistoria
      ? {
          id: vistoria.id,
          equipamento: vistoria.equipamento,
          latitude: vistoria.latitude,
          longitude: vistoria.longitude,
          cidade: vistoria.cidade,
        }
      : null,
  });
}
