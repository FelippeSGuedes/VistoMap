import "server-only";
import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { fetchParadasSelecionadas, montarRoteiroDoDia } from "@/lib/roteirizacao";
import { getExpedienteConfig } from "@/lib/expediente";
import { resumirDias } from "@/lib/roteirizacaoHorarios";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PreviewBody {
  vistoria_ids: Array<number | string>;
  tecnico_id: number | string;
  data_agendada: string; // YYYY-MM-DD
  hora_inicio?: string; // HH:MM, default = início do expediente
  /** Ordem escolhida à mão na simulação (remover/reordenar). Sem isso, vizinho mais próximo. */
  ordem_vistoria_ids?: Array<number | string>;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * POST /api/painel/agendamentos/preview  (analista)
 *
 * Roda o roteirizador + checagem de clima SEM gravar nada — devolve a
 * ordem, o dia e os horários previstos de cada parada (respeitando o
 * expediente: o que não cabe vai pro próximo dia útil) e avisos de chuva
 * pro analista revisar antes de confirmar (POST /api/painel/agendamentos).
 */
export async function POST(req: Request) {
  const auth = await requirePainelRole(req, "moderador");
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as PreviewBody;
    const vIds = (body.vistoria_ids ?? [])
      .map((v) => Number(String(v).replace(/^NE-/, "")))
      .filter((v) => Number.isFinite(v) && v > 0);
    const tId = Number(body.tecnico_id);
    const ordem = (body.ordem_vistoria_ids ?? [])
      .map((v) => Number(String(v).replace(/^NE-/, "")))
      .filter((v) => vIds.includes(v));

    if (vIds.length === 0 || !Number.isFinite(tId) || tId <= 0) {
      return NextResponse.json({ message: "vistoria_ids e tecnico_id são obrigatórios" }, { status: 400 });
    }
    if (!DATA_RE.test(body.data_agendada ?? "")) {
      return NextResponse.json({ message: "data_agendada inválida (YYYY-MM-DD)" }, { status: 400 });
    }
    if (body.hora_inicio && !HORA_RE.test(body.hora_inicio)) {
      return NextResponse.json({ message: "hora_inicio inválida (HH:MM)" }, { status: 400 });
    }

    const [{ paradas, semCoordenada, nomeMap }, expediente] = await Promise.all([
      fetchParadasSelecionadas(vIds),
      getExpedienteConfig(),
    ]);

    if (paradas.length === 0) {
      return NextResponse.json(
        { message: "Nenhuma das vistorias selecionadas tem coordenada cadastrada." },
        { status: 422 }
      );
    }

    const roteiro = await montarRoteiroDoDia(tId, paradas, body.data_agendada, expediente, {
      horaInicio: body.hora_inicio,
      ordem,
    });

    const itens = roteiro.map((p) => ({
      vistoria_id: p.id,
      equipamento: nomeMap.get(p.id) ?? `NE-${p.id}`,
      ordem: p.ordem,
      data: p.dia,
      novo_dia: p.novoDia,
      distancia_desde_anterior_m: p.distanciaDesdeAnteriorM,
      duracao_perna_min: Math.round(p.duracaoPernaMin),
      chegada_prevista: p.chegadaPrevista.toISOString(),
      saida_prevista: p.saidaPrevista.toISOString(),
      almoco_antes: p.almocoAntes,
      risco_chuva_pct: p.riscoChuvaPct,
      risco_chuva_alerta: p.riscoChuvaAlerta,
    }));

    const dias = resumirDias(
      roteiro.map((p) => ({ dia: p.dia, chegada: p.chegadaPrevista, saida: p.saidaPrevista, almocoAntes: p.almocoAntes, novoDia: p.novoDia }))
    );

    return NextResponse.json({
      ok: true,
      itens,
      resumo: {
        hora_inicio: body.hora_inicio ?? expediente.inicio,
        expediente: { inicio: expediente.inicio, fim: expediente.fim, fim_de_semana: expediente.fimDeSemana },
        distancia_total_m: roteiro.reduce((s, p) => s + (p.distanciaDesdeAnteriorM ?? 0), 0),
        dias: dias.map((d) => ({ data: d.dia, paradas: d.paradas, hora_termino: d.termino.toISOString() })),
      },
      ignorados_sem_coordenada: semCoordenada,
    });
  } catch (err) {
    console.error("[api/painel/agendamentos/preview] error", err);
    return NextResponse.json(
      { message: "Falha ao calcular prévia do agendamento", error: String(err) },
      { status: 500 }
    );
  }
}
