import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { fetchDevolucoes } from "@/lib/glpi/devolucoes";
import { fetchAgendamentoAtivo, agendarDevolucoesTecnico } from "@/lib/glpi/agendamentosTecnico";
import { getExpedienteConfig } from "@/lib/expediente";
import { proximosDiasUteis } from "@/utils/diasUteis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

interface AgendarBody {
  dia: string;
}

/**
 * POST /api/vistorias/devolucoes/agendar  (técnico)
 *
 * Agenda TODAS as devoluções PENDENTE do técnico que ainda não têm
 * agendamento válido pro mesmo dia escolhido — nunca confia em ids
 * vindos do cliente, recalcula tudo no servidor (mesmo espírito do
 * bloqueio de `iniciar`, ver fetchAgendamentoAtivo).
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

  const pendentes = await fetchDevolucoes({ tecnicoId: actor.id, status: "PENDENTE" });
  const semAgenda = [];
  for (const d of pendentes) {
    const agendamento = await fetchAgendamentoAtivo(d.vistoriaId, actor.id);
    if (!agendamento) semAgenda.push(d);
  }

  if (semAgenda.length === 0) {
    return NextResponse.json({ ok: true, agendados: 0 });
  }

  await agendarDevolucoesTecnico(
    actor.id,
    semAgenda.map((d) => ({ itemsId: d.vistoriaId, equipamento: d.equipamento })),
    body.dia
  );

  return NextResponse.json({ ok: true, agendados: semAgenda.length });
}
