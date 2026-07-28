import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { execute } from "@/lib/db";
import { TABLE_FIELDS } from "@/lib/glpi/constants";
import { fetchRecusaPorId, resolverRecusa } from "@/lib/glpi/recusas";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ResponderBody {
  acao: "aprovar" | "reprovar";
  motivo?: string;
}

/**
 * POST /api/painel/notificacoes/recusas/[id]/responder  (admin)
 *
 * Aprovar: a vistoria já está desvinculada (feito no momento da recusa) —
 * fica assim, some de circulação de vez ("Rejeitada").
 * Reprovar: reatribui de volta pro MESMO técnico que recusou, com o
 * motivo da reprovação — ele vê e pode tentar de novo (ou escalar).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(request, "moderador");
  if (!auth.ok) return auth.response;
  const adminNome = auth.claims.email ?? "Administrador";
  const adminId = Number(auth.claims.sub) || 0;

  const recusaId = Number(params.id);
  if (!recusaId || !Number.isFinite(recusaId)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let body: ResponderBody = { acao: "aprovar" };
  try {
    body = (await request.json()) as ResponderBody;
  } catch {
    /* ok */
  }
  if (!["aprovar", "reprovar"].includes(body.acao)) {
    return NextResponse.json({ message: "acao inválida" }, { status: 400 });
  }
  if (body.acao === "reprovar" && !body.motivo?.trim()) {
    return NextResponse.json({ message: "Informe o motivo da reprovação" }, { status: 400 });
  }

  const recusa = await fetchRecusaPorId(recusaId);
  if (!recusa) return NextResponse.json({ message: "Recusa não encontrada" }, { status: 404 });
  if (recusa.status !== "PENDENTE") {
    return NextResponse.json({ message: "Recusa já respondida" }, { status: 409 });
  }

  const novoStatus = body.acao === "aprovar" ? "APROVADO" : "REPROVADO";
  await resolverRecusa(recusaId, novoStatus, body.motivo);

  if (body.acao === "reprovar") {
    // Volta pra fila do MESMO técnico — ele vê o motivo e tenta de novo.
    await execute(
      `UPDATE \`${TABLE_FIELDS}\` SET users_id_vistoriadorafield = ? WHERE items_id = ?`,
      [recusa.tecnicoId, recusa.vistoriaId]
    );
  }
  // Aprovado: já está desvinculada desde a solicitação — fica assim.

  void auditInsert({
    ator: { id: adminId, nome: adminNome, role: "admin" },
    acao: body.acao === "aprovar" ? "recusa-aprovada" : "recusa-reprovada",
    alvo: { tipo: "vistoria", id: String(recusa.vistoriaId), label: recusa.equipamento },
    descricao:
      body.acao === "aprovar"
        ? `Recusa aprovada — vistoria de ${recusa.tecnicoNome} sai de circulação. ${recusa.justificativa}`
        : `Recusa reprovada — volta pra fila de ${recusa.tecnicoNome}. Motivo: ${body.motivo}`,
  });

  return NextResponse.json({ ok: true, status: novoStatus });
}
