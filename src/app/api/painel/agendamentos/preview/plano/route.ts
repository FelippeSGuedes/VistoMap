import "server-only";
import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import {
  fetchOrigemTecnico,
  fetchParadasSelecionadas,
  fetchSlaTecnico,
  ordenarManual,
  ordenarPorProximidade,
} from "@/lib/roteirizacao";
import { getExpedienteConfig } from "@/lib/expediente";
import { ALMOCO_HORA, ALMOCO_MIN, MARGEM_DESVIO_MIN } from "@/lib/roteirizacaoHorarios";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PlanoBody {
  vistoria_ids: Array<number | string>;
  tecnico_id: number | string;
  data_agendada: string; // YYYY-MM-DD
  hora_inicio?: string; // HH:MM
  ordem_vistoria_ids?: Array<number | string>;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * POST /api/painel/agendamentos/preview/plano  (analista)
 *
 * Só o ESQUELETO do roteiro, em milissegundos e sem chamada externa: ordem
 * das paradas, origem (último GPS do técnico), SLA médio dele e a janela
 * de expediente. O navegador traça cada perna ao vivo a partir disso
 * (SimulacaoDiaOverlay) enquanto o /preview completo (rotas + clima) roda em
 * paralelo — o loading vira o próprio resultado se montando.
 */
export async function POST(req: Request) {
  const auth = await requirePainelRole(req, "moderador");
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as PlanoBody;
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

    const [{ paradas, semCoordenada, nomeMap }, slaMin, origem, expediente] = await Promise.all([
      fetchParadasSelecionadas(vIds),
      fetchSlaTecnico(tId),
      fetchOrigemTecnico(tId),
      getExpedienteConfig(),
    ]);

    if (paradas.length === 0) {
      return NextResponse.json(
        { message: "Nenhuma das vistorias selecionadas tem coordenada cadastrada." },
        { status: 422 }
      );
    }

    const ordenadas = ordem.length ? ordenarManual(paradas, ordem) : ordenarPorProximidade(origem, paradas);

    return NextResponse.json({
      ok: true,
      data_agendada: body.data_agendada,
      hora_inicio: body.hora_inicio ?? expediente.inicio,
      expediente: { inicio: expediente.inicio, fim: expediente.fim, fim_de_semana: expediente.fimDeSemana },
      sla_min: slaMin,
      origem,
      almoco: { hora: ALMOCO_HORA, duracao_min: ALMOCO_MIN },
      margem_min: MARGEM_DESVIO_MIN,
      paradas: ordenadas.map((p, i) => ({
        vistoria_id: p.id,
        equipamento: nomeMap.get(p.id) ?? `NE-${p.id}`,
        ordem: i + 1,
        lat: p.lat,
        lng: p.lng,
      })),
      ignorados_sem_coordenada: semCoordenada,
    });
  } catch (err) {
    console.error("[api/painel/agendamentos/preview/plano] error", err);
    return NextResponse.json(
      { message: "Falha ao montar o plano do agendamento", error: String(err) },
      { status: 500 }
    );
  }
}
