import "server-only";
import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { getActorFromRequest } from "@/lib/auth-request";
import { query, execute } from "@/lib/db";
import { TABLE_FIELDS, TABLE_NE } from "@/lib/glpi/constants";
import { atribuirVistoria } from "@/lib/glpi/painel";
import { auditInsert } from "@/lib/glpi/audit";
import { sendPushTo } from "@/lib/push";
import { montarRoteiroDoDia } from "@/lib/roteirizacao";
import { getExpedienteConfig } from "@/lib/expediente";
import { ensureAgendamentosTable } from "@/lib/ensureAgendamentosTable";
import type { AuditEntry } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AgendarBody {
  vistoria_ids: Array<number | string>;
  tecnico_id: number | string;
  data_agendada: string; // YYYY-MM-DD
  hora_inicio?: string; // HH:MM
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * POST /api/painel/agendamentos  (analista)
 *
 * Recalcula o MESMO roteiro do preview (não confia em horários vindos do
 * cliente) e grava: uma linha por vistoria em
 * glpi_plugin_vistomap_agendamentos, atribui o técnico agora
 * (atribuirVistoria — mesma função do fluxo imediato, só a VISIBILIDADE
 * na fila é que fica represada até a data), audit e push avisando a data.
 */
export async function POST(req: Request) {
  const auth = await requirePainelRole(req, "moderador");
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as AgendarBody;
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

    const [actor, rows, tecRow] = await Promise.all([
      getActorFromRequest(req),
      query<{ id: number; name: string; latitude: string | null; longitude: string | null }>(
        `SELECT ne.id, ne.name,
                REPLACE(f.latitudefield, ',', '.') + 0.0 AS latitude,
                REPLACE(f.longitudefield, ',', '.') + 0.0 AS longitude
           FROM \`${TABLE_NE}\` ne
           INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
          WHERE ne.id IN (${vIds.map(() => "?").join(",")})
            AND ne.is_deleted = 0`,
        vIds
      ),
      query<{ name: string; firstname: string | null; realname: string | null }>(
        `SELECT name, firstname, realname FROM glpi_users WHERE id = ? LIMIT 1`,
        [tId]
      ).then((r) => r[0]),
    ]);

    const paradas = rows
      .filter((r) => r.latitude != null && r.longitude != null && Number(r.latitude) !== 0)
      .map((r) => ({ id: r.id, lat: Number(r.latitude), lng: Number(r.longitude) }));

    if (paradas.length === 0) {
      return NextResponse.json(
        { message: "Nenhuma das vistorias selecionadas tem coordenada cadastrada." },
        { status: 422 }
      );
    }

    const horaInicioStr = body.hora_inicio ?? (await getExpedienteConfig()).inicio;
    const [hh, mm] = horaInicioStr.split(":").map(Number);
    const horaInicio = new Date(`${body.data_agendada}T00:00:00`);
    horaInicio.setHours(hh, mm, 0, 0);

    const roteiro = await montarRoteiroDoDia(tId, paradas, body.data_agendada, horaInicio);

    await ensureAgendamentosTable();
    const nomeMap = new Map(rows.map((r) => [r.id, r.name]));
    const actorFinal = actor ?? { id: 0, nome: "Sistema", role: "admin" as const };
    const tecNome = tecRow
      ? `${tecRow.firstname ?? ""} ${tecRow.realname ?? ""}`.trim() || tecRow.name
      : `Técnico #${tId}`;

    for (const p of roteiro) {
      const equipamento = nomeMap.get(p.id) ?? `NE-${p.id}`;

      await execute(
        `INSERT INTO glpi_plugin_vistomap_agendamentos
           (items_id, equipamento, tecnico_id, data_agendada, ordem_visita,
            horario_previsto_chegada, horario_previsto_saida,
            distancia_desde_anterior_m, risco_chuva_pct, risco_chuva_alerta, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          equipamento,
          tId,
          body.data_agendada,
          p.ordem,
          p.chegadaPrevista,
          p.saidaPrevista,
          p.distanciaDesdeAnteriorM,
          p.riscoChuvaPct,
          p.riscoChuvaAlerta ? 1 : 0,
          Number(actorFinal.id) || 0,
        ]
      );

      await atribuirVistoria(p.id, tId, false);

      void auditInsert({
        ator: actorFinal,
        acao: "vistoria-agendada" as AuditEntry["acao"],
        alvo: { tipo: "vistoria", id: String(p.id), label: equipamento },
        descricao: `Agendada para ${tecNome} em ${body.data_agendada} (parada ${p.ordem}/${roteiro.length})${
          p.riscoChuvaAlerta ? ` · risco de chuva ${p.riscoChuvaPct}%` : ""
        }`,
      });
    }

    void sendPushTo({
      usersIds: [tId],
      title: "Vistorias agendadas",
      body: `${roteiro.length} vistoria(s) agendada(s) para ${body.data_agendada}`,
      data: { url: "/app/vistorias" },
    });

    return NextResponse.json({ ok: true, agendadas: roteiro.length });
  } catch (err) {
    console.error("[api/painel/agendamentos] error", err);
    return NextResponse.json(
      { message: "Falha ao criar agendamento", error: String(err) },
      { status: 500 }
    );
  }
}

interface AgendamentoRow {
  id: number;
  items_id: number;
  equipamento: string;
  tecnico_id: number;
  tecnico_nome: string | null;
  tecnico_firstname: string | null;
  tecnico_realname: string | null;
  data_agendada: string;
  ordem_visita: number;
  horario_previsto_chegada: string | null;
  horario_previsto_saida: string | null;
  distancia_desde_anterior_m: number | null;
  risco_chuva_pct: number | null;
  risco_chuva_alerta: number;
  status: "AGENDADA" | "CANCELADA";
}

/**
 * GET /api/painel/agendamentos?tecnico_id=&de=&ate=  (leitura)
 * Lista pra tela /painel/agendamentos. Sem filtro de tecnico_id, traz todos.
 */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    await ensureAgendamentosTable();
    const url = new URL(req.url);
    const tecnicoId = url.searchParams.get("tecnico_id");
    const de = url.searchParams.get("de");
    const ate = url.searchParams.get("ate");

    const where: string[] = ["ag.status = 'AGENDADA'"];
    const params: unknown[] = [];
    if (tecnicoId) {
      where.push("ag.tecnico_id = ?");
      params.push(Number(tecnicoId));
    }
    if (de && DATA_RE.test(de)) {
      where.push("ag.data_agendada >= ?");
      params.push(de);
    }
    if (ate && DATA_RE.test(ate)) {
      where.push("ag.data_agendada <= ?");
      params.push(ate);
    }

    const rows = await query<AgendamentoRow>(
      `SELECT ag.id, ag.items_id, ag.equipamento, ag.tecnico_id,
              u.name AS tecnico_nome, u.firstname AS tecnico_firstname, u.realname AS tecnico_realname,
              ag.data_agendada, ag.ordem_visita,
              ag.horario_previsto_chegada, ag.horario_previsto_saida,
              ag.distancia_desde_anterior_m, ag.risco_chuva_pct, ag.risco_chuva_alerta, ag.status
         FROM glpi_plugin_vistomap_agendamentos ag
         LEFT JOIN glpi_users u ON u.id = ag.tecnico_id
        WHERE ${where.join(" AND ")}
        ORDER BY ag.data_agendada ASC, ag.tecnico_id ASC, ag.ordem_visita ASC`,
      params
    );

    const itens = rows.map((r) => ({
      id: r.id,
      vistoria_id: r.items_id,
      equipamento: r.equipamento,
      tecnico_id: r.tecnico_id,
      tecnico_nome: `${r.tecnico_firstname ?? ""} ${r.tecnico_realname ?? ""}`.trim() || r.tecnico_nome || `Técnico #${r.tecnico_id}`,
      data_agendada: r.data_agendada,
      ordem: r.ordem_visita,
      chegada_prevista: r.horario_previsto_chegada,
      saida_prevista: r.horario_previsto_saida,
      distancia_desde_anterior_m: r.distancia_desde_anterior_m,
      risco_chuva_pct: r.risco_chuva_pct,
      risco_chuva_alerta: !!r.risco_chuva_alerta,
    }));

    return NextResponse.json({ ok: true, itens });
  } catch (err) {
    console.error("[api/painel/agendamentos] GET error", err);
    return NextResponse.json(
      { message: "Falha ao listar agendamentos", error: String(err) },
      { status: 500 }
    );
  }
}
