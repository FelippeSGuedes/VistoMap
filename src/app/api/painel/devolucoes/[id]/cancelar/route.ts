import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { fetchDevolucaoPorId, cancelarDevolucao } from "@/lib/glpi/devolucoes";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/painel/devolucoes/[id]/cancelar  (moderador)
 *
 * Anula manualmente uma devolução PENDENTE indevida ou presa (ex: a
 * vistoria já foi resolvida/cancelada por outro caminho e a devolução
 * ficou órfã). Não mexe em nada do lado GLPI — só marca CANCELADA aqui.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requirePainelRole(request, "moderador");
  if (!auth.ok) return auth.response;
  const adminNome = auth.claims.email ?? "Administrador";
  const adminId = Number(auth.claims.sub) || 0;

  const id = Number(params.id);
  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  try {
    const devolucao = await fetchDevolucaoPorId(id);
    if (!devolucao) return NextResponse.json({ message: "Devolução não encontrada" }, { status: 404 });
    if (devolucao.status !== "PENDENTE") {
      return NextResponse.json({ message: "Essa devolução não está mais pendente" }, { status: 409 });
    }

    await cancelarDevolucao(id);

    void auditInsert({
      ator: { id: adminId, nome: adminNome, role: "admin" },
      acao: "devolucao-cancelada",
      alvo: { tipo: "vistoria", id: String(devolucao.vistoriaId), label: devolucao.equipamento },
      descricao: `Devolução #${id} anulada manualmente.`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/painel/devolucoes/cancelar] error", err);
    return NextResponse.json(
      { message: "Falha ao cancelar devolução", error: String(err) },
      { status: 500 }
    );
  }
}
