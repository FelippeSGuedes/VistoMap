import "server-only";
import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { fetchParadasSelecionadas, montarRoteiroDoDia } from "@/lib/roteirizacao";
import { getExpedienteConfig } from "@/lib/expediente";
import { almocoDoDia, calcularTermino } from "@/lib/roteirizacaoHorarios";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PreviewBody {
  vistoria_ids: Array<number | string>;
  tecnico_id: number | string;
  data_agendada: string; // YYYY-MM-DD
  hora_inicio?: string; // HH:MM, default = início do expediente
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * POST /api/painel/agendamentos/preview  (analista)
 *
 * Roda o roteirizador + checagem de clima SEM gravar nada — devolve a
 * ordem sugerida, horários previstos e avisos de chuva pro analista
 * revisar antes de confirmar (POST /api/painel/agendamentos).
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

    if (vIds.length === 0 || !Number.isFinite(tId) || tId <= 0) {
      return NextResponse.json({ message: "vistoria_ids e tecnico_id são obrigatórios" }, { status: 400 });
    }
    if (!DATA_RE.test(body.data_agendada ?? "")) {
      return NextResponse.json({ message: "data_agendada inválida (YYYY-MM-DD)" }, { status: 400 });
    }
    if (body.hora_inicio && !HORA_RE.test(body.hora_inicio)) {
      return NextResponse.json({ message: "hora_inicio inválida (HH:MM)" }, { status: 400 });
    }

    const { paradas, semCoordenada, nomeMap } = await fetchParadasSelecionadas(vIds);

    if (paradas.length === 0) {
      return NextResponse.json(
        { message: "Nenhuma das vistorias selecionadas tem coordenada cadastrada." },
        { status: 422 }
      );
    }

    const horaInicioStr = body.hora_inicio ?? (await getExpedienteConfig()).inicio;
    // Offset explícito (-03:00, Brasília sem horário de verão) — sem ele,
    // "T08:00:00" sem fuso é interpretado como hora LOCAL DO PROCESSO (UTC
    // neste deploy), então "08:00" virava 05:00 de Brasília.
    const horaInicio = new Date(`${body.data_agendada}T${horaInicioStr}:00-03:00`);

    const roteiro = await montarRoteiroDoDia(tId, paradas, body.data_agendada, horaInicio);

    const itens = roteiro.map((p) => ({
      vistoria_id: p.id,
      equipamento: nomeMap.get(p.id) ?? `NE-${p.id}`,
      ordem: p.ordem,
      distancia_desde_anterior_m: p.distanciaDesdeAnteriorM,
      duracao_perna_min: Math.round(p.duracaoPernaMin),
      chegada_prevista: p.chegadaPrevista.toISOString(),
      saida_prevista: p.saidaPrevista.toISOString(),
      almoco_antes: p.almocoAntes,
      risco_chuva_pct: p.riscoChuvaPct,
      risco_chuva_alerta: p.riscoChuvaAlerta,
    }));

    const termino = calcularTermino(
      roteiro.map((p) => ({ chegada: p.chegadaPrevista, saida: p.saidaPrevista, almocoAntes: p.almocoAntes })),
      almocoDoDia(body.data_agendada)
    );

    return NextResponse.json({
      ok: true,
      itens,
      resumo: {
        hora_inicio: horaInicioStr,
        hora_termino: termino?.toISOString() ?? null,
        distancia_total_m: roteiro.reduce((s, p) => s + (p.distanciaDesdeAnteriorM ?? 0), 0),
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
