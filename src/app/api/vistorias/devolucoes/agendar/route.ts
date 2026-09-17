import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { fetchDevolucoes } from "@/lib/glpi/devolucoes";
import { getVistoria, listVistorias } from "@/lib/glpi/equipments";
import { fetchAgendamentoAtivo, agendarDevolucoesTecnico } from "@/lib/glpi/agendamentosTecnico";
import { getExpedienteConfig } from "@/lib/expediente";
import { proximosDiasUteis } from "@/utils/diasUteis";
import { SITUACAO_EM_VISTORIA, SITUACAO_EM_DESLOCAMENTO } from "@/lib/glpi/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

interface AgendarBody {
  dia: string;
}

/**
 * POST /api/vistorias/devolucoes/agendar  (técnico)
 *
 * Agenda TODAS as pendências do técnico sem agendamento válido pro mesmo
 * dia escolhido — devoluções E revisitas juntas (ver resumo/route.ts).
 * Nunca confia em ids vindos do cliente, recalcula tudo no servidor
 * (mesmo espírito do bloqueio de `iniciar`, ver fetchAgendamentoAtivo).
 */
export async function POST(request: Request) {
  const actor = await getActorFromRequest(request);
  if (!actor) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  let body: AgendarBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  if (!DATA_RE.test(body.dia ?? "")) {
    return NextResponse.json({ message: "dia inválido (YYYY-MM-DD)" }, { status: 400 });
  }

  const config = await getExpedienteConfig();
  const diasValidos = proximosDiasUteis(7, config.fimDeSemana);
  if (!diasValidos.includes(body.dia)) {
    return NextResponse.json(
      { message: "Escolha um dia dentro dos próximos 7 dias úteis." },
      { status: 400 }
    );
  }

  const itensParaAgendar: Array<{ itemsId: number; equipamento: string }> = [];

  const devolucoesPendentes = await fetchDevolucoes({ tecnicoId: actor.id, status: "PENDENTE" });
  for (const d of devolucoesPendentes) {
    const agendamento = await fetchAgendamentoAtivo(d.vistoriaId, actor.id);
    if (agendamento) continue;
    const vistoria = await getVistoria(d.vistoriaId);
    itensParaAgendar.push({ itemsId: d.vistoriaId, equipamento: vistoria?.equipamento ?? d.equipamento });
  }

  const vistoriasTecnico = await listVistorias({ tecnicoId: Number(actor.id), ignorarAgendamento: true });
  // Mesmo corte de resumo/route.ts: nunca agenda (e portanto nunca esconde
  // da fila) uma vistoria que o técnico já está fazendo agora.
  const revisitasAtivas = vistoriasTecnico.filter(
    (v) =>
      v.status === "REPROVADA" &&
      v.situacaoId !== SITUACAO_EM_VISTORIA &&
      v.situacaoId !== SITUACAO_EM_DESLOCAMENTO
  );
  for (const v of revisitasAtivas) {
    const agendamento = await fetchAgendamentoAtivo(Number(v.id), actor.id);
    if (agendamento) continue;
    itensParaAgendar.push({ itemsId: Number(v.id), equipamento: v.equipamento });
  }

  if (itensParaAgendar.length === 0) {
    return NextResponse.json({ ok: true, agendados: 0 });
  }

  await agendarDevolucoesTecnico(actor.id, itensParaAgendar, body.dia);

  return NextResponse.json({ ok: true, agendados: itensParaAgendar.length });
}
