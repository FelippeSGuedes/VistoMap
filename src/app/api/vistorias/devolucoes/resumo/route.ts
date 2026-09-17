import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { fetchDevolucoes } from "@/lib/glpi/devolucoes";
import { getVistoria, listVistorias } from "@/lib/glpi/equipments";
import { fetchAgendamentoAtivo } from "@/lib/glpi/agendamentosTecnico";
import { getExpedienteConfig } from "@/lib/expediente";
import { proximosDiasUteis } from "@/utils/diasUteis";
import { SITUACAO_EM_VISTORIA, SITUACAO_EM_DESLOCAMENTO } from "@/lib/glpi/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface PendenciaResumoItem {
  tipo: "devolucao" | "revisita";
  /** id da devolução (tipo="devolucao") ou da própria vistoria (tipo="revisita") — chave única pra UI. */
  chaveId: number;
  vistoriaId: number;
  equipamento: string;
  cidade: string;
  /** Só devolução — itens específicos apontados pelo analista (fotos/campos). Revisita não tem essa granularidade. */
  itens: string[];
  motivos: string[];
  motivoOutro: string | null;
  precisaDeslocamento: boolean;
}

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * GET /api/vistorias/devolucoes/resumo  (técnico)
 *
 * Consultado no dashboard pra decidir qual dos 2 cartões mostrar:
 * `pendentesSemAgenda` (nunca agendada, ou o dia escolhido já passou sem
 * resolver) dispara o onboarding "X vistorias voltaram para você" +
 * escolha de dia; `hojeAgendadas` dispara o prompt "Bom dia, sua rota
 * inclui pendências" no dia marcado. Os 2 grupos nunca se sobrepõem.
 *
 * Unifica 2 mecanismos diferentes de "isso voltou pro técnico":
 *  - Devolução: analista aponta itens específicos (glpi_plugin_vistomap_devolucoes).
 *  - Revisita: CPFL reprova a vistoria inteira (situação da vistoria =
 *    Aguardando/Em Revisita) — sem granularidade de itens, só o
 *    motivofield (texto livre) como motivo.
 * São mutuamente exclusivos por construção (situação só pode ser uma
 * coisa por vez: Devolvida OU Aguardando/Em Revisita, nunca as duas).
 */
export async function GET(request: Request) {
  const actor = await getActorFromRequest(request);
  if (!actor) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  const hoje = hojeISO();

  const pendentesSemAgenda: PendenciaResumoItem[] = [];
  const hojeAgendadas: Array<{
    tipo: "devolucao" | "revisita";
    chaveId: number;
    vistoriaId: number;
    equipamento: string;
    cidade: string;
  }> = [];

  // ── Devoluções ────────────────────────────────────────────────────
  const devolucoesPendentes = await fetchDevolucoes({ tecnicoId: actor.id, status: "PENDENTE" });
  for (const d of devolucoesPendentes) {
    const [agendamento, vistoria] = await Promise.all([
      fetchAgendamentoAtivo(d.vistoriaId, actor.id),
      getVistoria(d.vistoriaId),
    ]);
    const equipamento = vistoria?.equipamento ?? d.equipamento;
    const cidade = vistoria?.cidade ?? "";

    if (!agendamento) {
      pendentesSemAgenda.push({
        tipo: "devolucao",
        chaveId: d.id,
        vistoriaId: d.vistoriaId,
        equipamento,
        cidade,
        itens: d.itens,
        motivos: d.motivos,
        motivoOutro: d.motivoOutro,
        precisaDeslocamento: d.precisaDeslocamento,
      });
    } else if (agendamento.dataAgendada === hoje) {
      hojeAgendadas.push({ tipo: "devolucao", chaveId: d.id, vistoriaId: d.vistoriaId, equipamento, cidade });
    }
  }

  // ── Revisitas (CPFL reprovou a vistoria inteira) ─────────────────
  // ignorarAgendamento: precisa enxergar mesmo as que o técnico já
  // agendou pro futuro (a fila normal esconde de propósito) pra não
  // contar `totalRevisitasPendentes` errado.
  const vistoriasTecnico = await listVistorias({ tecnicoId: Number(actor.id), ignorarAgendamento: true });
  // status==="REPROVADA" sozinho não basta: pode vir de is_repeat grudado
  // de um ciclo anterior (ver fix em isRevisitaAtual) numa vistoria que o
  // técnico JÁ ESTÁ fazendo agora (situação Em Vistoria/Em Deslocamento —
  // ele iniciou, mas ainda não terminou de reenviar). Achado real em
  // produção 2026-09-17: agendar uma dessas fazia a vistoria sumir da fila
  // no meio do atendimento, não só "amanhã". Só entra no agendamento quem
  // está de fato parado esperando alguém pegar (Aguardando/Em Revisita).
  const revisitasAtivas = vistoriasTecnico.filter(
    (v) =>
      v.status === "REPROVADA" &&
      v.situacaoId !== SITUACAO_EM_VISTORIA &&
      v.situacaoId !== SITUACAO_EM_DESLOCAMENTO
  );

  let totalRevisitasPendentes = 0;
  for (const v of revisitasAtivas) {
    totalRevisitasPendentes++;
    const agendamento = await fetchAgendamentoAtivo(Number(v.id), actor.id);
    const motivo = v.fields?.motivofield?.trim();

    if (!agendamento) {
      pendentesSemAgenda.push({
        tipo: "revisita",
        chaveId: Number(v.id),
        vistoriaId: Number(v.id),
        equipamento: v.equipamento,
        cidade: v.cidade,
        itens: [],
        motivos: motivo ? [motivo] : [],
        motivoOutro: null,
        precisaDeslocamento: true,
      });
    } else if (agendamento.dataAgendada === hoje) {
      hojeAgendadas.push({
        tipo: "revisita",
        chaveId: Number(v.id),
        vistoriaId: Number(v.id),
        equipamento: v.equipamento,
        cidade: v.cidade,
      });
    }
  }

  const config = await getExpedienteConfig();

  return NextResponse.json({
    // Só devolução — alimenta o KPI "Devoluções" do dashboard, que ficaria
    // com número errado se virasse soma das duas coisas.
    totalPendentes: devolucoesPendentes.length,
    totalRevisitasPendentes,
    pendentesSemAgenda,
    hojeAgendadas,
    diasDisponiveis: proximosDiasUteis(7, config.fimDeSemana),
  });
}
