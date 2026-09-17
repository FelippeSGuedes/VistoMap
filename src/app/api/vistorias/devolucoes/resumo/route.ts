import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { fetchDevolucoes } from "@/lib/glpi/devolucoes";
import { getVistoria } from "@/lib/glpi/equipments";
import { fetchAgendamentoAtivo } from "@/lib/glpi/agendamentosTecnico";
import { getExpedienteConfig } from "@/lib/expediente";
import { proximosDiasUteis } from "@/utils/diasUteis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * GET /api/vistorias/devolucoes/resumo  (técnico)
 *
 * Consultado no dashboard pra decidir qual dos 2 cartões mostrar:
 * `pendentesSemAgenda` (nunca agendada, ou o dia escolhido já passou sem
 * resolver) dispara o onboarding "Foram devolvidas X vistorias" +
 * escolha de dia; `hojeAgendadas` dispara o prompt "Bom dia, sua rota
 * inclui devoluções" no dia marcado. Os 2 grupos nunca se sobrepõem —
 * uma devolução agendada pro futuro (nem hoje, nem sem agenda) fica
 * quieta, sem aparecer em nenhum dos dois.
 */
export async function GET(request: Request) {
  const actor = await getActorFromRequest(request);
  if (!actor) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  const pendentes = await fetchDevolucoes({ tecnicoId: actor.id, status: "PENDENTE" });
  const hoje = hojeISO();

  const pendentesSemAgenda: Array<{
    devolucaoId: number;
    vistoriaId: number;
    equipamento: string;
    cidade: string;
    itens: string[];
    motivos: string[];
    motivoOutro: string | null;
    precisaDeslocamento: boolean;
  }> = [];
  const hojeAgendadas: Array<{
    devolucaoId: number;
    vistoriaId: number;
    equipamento: string;
    cidade: string;
  }> = [];

  for (const d of pendentes) {
    const [agendamento, vistoria] = await Promise.all([
      fetchAgendamentoAtivo(d.vistoriaId, actor.id),
      getVistoria(d.vistoriaId),
    ]);
    const equipamento = vistoria?.equipamento ?? d.equipamento;
    const cidade = vistoria?.cidade ?? "";

    if (!agendamento) {
      pendentesSemAgenda.push({
        devolucaoId: d.id,
        vistoriaId: d.vistoriaId,
        equipamento,
        cidade,
        itens: d.itens,
        motivos: d.motivos,
        motivoOutro: d.motivoOutro,
        precisaDeslocamento: d.precisaDeslocamento,
      });
    } else if (agendamento.dataAgendada === hoje) {
      hojeAgendadas.push({ devolucaoId: d.id, vistoriaId: d.vistoriaId, equipamento, cidade });
    }
  }

  const config = await getExpedienteConfig();

  return NextResponse.json({
    totalPendentes: pendentes.length,
    pendentesSemAgenda,
    hojeAgendadas,
    diasDisponiveis: proximosDiasUteis(7, config.fimDeSemana),
  });
}
