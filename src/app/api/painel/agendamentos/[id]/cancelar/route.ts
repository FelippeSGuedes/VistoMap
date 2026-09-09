import "server-only";
import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { getActorFromRequest } from "@/lib/auth-request";
import { query, execute } from "@/lib/db";
import { ensureAgendamentosTable } from "@/lib/ensureAgendamentosTable";
import { auditInsert } from "@/lib/glpi/audit";
import type { AuditEntry } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/painel/agendamentos/[id]/cancelar  (analista)
 *
 * Só cancela a MARCAÇÃO de data — a vistoria continua com o técnico
 * atribuído (users_id_vistoriadorafield intocado) e volta a aparecer na
 * fila dele imediatamente (listVistorias() só esconde quem tem
 * agendamento AGENDADA com data futura).
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requirePainelRole(req, "moderador");
  if (!auth.ok) return auth.response;

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  try {
    await ensureAgendamentosTable();
    const [row] = await query<{ items_id: number; equipamento: string; status: string }>(
      `SELECT items_id, equipamento, status FROM glpi_plugin_vistomap_agendamentos WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!row) return NextResponse.json({ message: "Agendamento não encontrado" }, { status: 404 });
    if (row.status === "CANCELADA") {
      return NextResponse.json({ message: "Agendamento já cancelado" }, { status: 409 });
    }

    await execute(`UPDATE glpi_plugin_vistomap_agendamentos SET status = 'CANCELADA' WHERE id = ?`, [id]);

    const actor = (await getActorFromRequest(req)) ?? { id: 0, nome: "Sistema", role: "admin" as const };
    void auditInsert({
      ator: actor,
      acao: "vistoria-agendamento-cancelado" as AuditEntry["acao"],
      alvo: { tipo: "vistoria", id: String(row.items_id), label: row.equipamento },
      descricao: "Agendamento cancelado — vistoria volta a aparecer na fila do técnico normalmente.",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/painel/agendamentos/[id]/cancelar] error", err);
    return NextResponse.json(
      { message: "Falha ao cancelar agendamento", error: String(err) },
      { status: 500 }
    );
  }
}
