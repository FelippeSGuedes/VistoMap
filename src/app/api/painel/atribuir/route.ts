import { NextResponse } from "next/server";
import { atribuirVistoria } from "@/lib/glpi/painel";
import { auditInsert } from "@/lib/glpi/audit";
import { getActorFromRequest } from "@/lib/auth-request";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AtribuirPayload {
  vistoria_id: number | string;
  tecnico_id: number | string;
  /** Quando true, marca project_status='PENDENTE' para regenerar PDF. */
  regenerar_pdf?: boolean;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AtribuirPayload;
    const vId = Number(String(body.vistoria_id).replace(/^NE-|^rev-/, ""));
    const tId = Number(body.tecnico_id);
    if (!Number.isFinite(vId) || !Number.isFinite(tId)) {
      return NextResponse.json({ message: "IDs inválidos" }, { status: 400 });
    }

    // Ator (admin) e labels para auditoria — busca em paralelo com update.
    const [actor, neRow, tecRow] = await Promise.all([
      getActorFromRequest(req),
      query<{ name: string }>(
        `SELECT name FROM glpi_networkequipments WHERE id = ? LIMIT 1`,
        [vId]
      ).then((r) => r[0]),
      query<{ name: string; firstname: string | null; realname: string | null }>(
        `SELECT name, firstname, realname FROM glpi_users WHERE id = ? LIMIT 1`,
        [tId]
      ).then((r) => r[0]),
    ]);

    const affected = await atribuirVistoria(vId, tId, !!body.regenerar_pdf);

    // Audit fire-and-forget — não bloqueia resposta.
    const tecNome = tecRow
      ? `${tecRow.firstname ?? ""} ${tecRow.realname ?? ""}`.trim() ||
        tecRow.name
      : `Técnico #${tId}`;
    const equipLabel = neRow?.name ?? `NE-${vId}`;
    void auditInsert({
      ator: actor ?? {
        id: 0,
        nome: "Sistema",
        role: "admin",
      },
      acao: body.regenerar_pdf ? "pdf-regenerado" : "vistoria-atribuida",
      alvo: { tipo: "vistoria", id: String(vId), label: equipLabel },
      descricao: body.regenerar_pdf
        ? `PDF marcado para regeneração · atribuído a ${tecNome}`
        : `Atribuída a ${tecNome}`,
    });

    return NextResponse.json({ ok: true, affected });
  } catch (err) {
    console.error("[api/painel/atribuir] error", err);
    return NextResponse.json(
      { message: "Falha ao atribuir vistoria", error: String(err) },
      { status: 500 }
    );
  }
}
