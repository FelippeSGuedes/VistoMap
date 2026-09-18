import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { fetchDevolucaoPendente, fetchDevolucaoPendentePorVistoria } from "@/lib/glpi/devolucoes";
import { getVistoria } from "@/lib/glpi/equipments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/vistorias/devolucao-pendente  (técnico)
 * GET /api/vistorias/devolucao-pendente?vistoriaId=123
 *
 * Sem `vistoriaId`: consultado no cold-start do app e periodicamente com o
 * app aberto (useDevolucaoWatcher) — devolve a devolução PENDENTE mais
 * recente do técnico (assume no máximo 1 "em foco" por vez; é o que
 * alimenta o modal "Houve um problema").
 *
 * Com `vistoriaId`: usado por /vistoria-corrigir pra abrir a tela de
 * correção de UMA vistoria específica. Achado em campo 2026-09-18 (Marco):
 * quando o técnico tem 2+ devoluções PENDENTES ao mesmo tempo, a variante
 * "mais recente" acima sempre aponta pra UMA só — tocar em qualquer uma
 * das OUTRAS levava a essa mesma tela, que então comparava o id da URL com
 * o id da devolução "mais recente" (errado) e mostrava "Não há devolução
 * pendente para essa vistoria" mesmo havendo uma de fato pendente pra
 * aquele id. Buscar pela vistoria exata resolve isso independente de
 * quantas o técnico tenha em aberto.
 *
 * `{ devolucao: null }` quando não há nada pendente.
 */
export async function GET(request: Request) {
  const actor = await getActorFromRequest(request);
  if (!actor) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  const vistoriaIdParam = new URL(request.url).searchParams.get("vistoriaId");

  let devolucao;
  if (vistoriaIdParam) {
    const vistoriaId = Number(vistoriaIdParam);
    if (!Number.isFinite(vistoriaId) || vistoriaId <= 0) {
      return NextResponse.json({ message: "vistoriaId inválido" }, { status: 400 });
    }
    const found = await fetchDevolucaoPendentePorVistoria(vistoriaId);
    // Só devolve se for do próprio técnico logado — fetchDevolucaoPendentePorVistoria
    // não filtra por dono (é usada também pelo lado admin em corrigir-devolucao,
    // que já valida acesso por outro caminho).
    devolucao = found && String(found.tecnicoId) === String(actor.id) ? found : null;
  } else {
    devolucao = await fetchDevolucaoPendente(actor.id);
  }

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
          pspostefield: vistoria.fields.pspostefield,
        }
      : null,
  });
}
