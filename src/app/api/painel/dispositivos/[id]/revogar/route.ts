import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { revokeBinding } from "@/lib/glpi/deviceBinding";
import { auditInsert } from "@/lib/glpi/audit";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/painel/dispositivos/[id]/revogar (admin)
 *
 * Revoga o vínculo ATUAL do técnico (troca de aparelho corporativo, perda,
 * etc.) — não apaga, marca revogado_em/revogado_por. Próximo login do
 * técnico cai em DEVICE_NOT_BOUND e ele reativa em /liberar-acesso.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requirePainelRole(req, "admin");
  if (!auth.ok) return auth.response;

  const id = Number(params.id);
  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  const adminId = Number(auth.claims.sub) || 0;
  const adminNome = auth.claims.email ?? "Administrador";

  try {
    const [row] = await query<{ users_id: number; nome_confirmado: string }>(
      `SELECT users_id, nome_confirmado FROM glpi_plugin_vistomap_device_binding
        WHERE id = ? AND revogado_em IS NULL LIMIT 1`,
      [id]
    );
    if (!row) {
      return NextResponse.json({ message: "Vínculo não encontrado ou já revogado" }, { status: 404 });
    }

    await revokeBinding(id, adminId);

    void auditInsert({
      ator: { id: adminId, nome: adminNome, role: "admin" },
      acao: "dados-editados",
      alvo: { tipo: "tecnico", id: String(row.users_id), label: row.nome_confirmado },
      descricao: `Vínculo de aparelho revogado — técnico precisa reativar em /liberar-acesso.`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/painel/dispositivos/[id]/revogar] POST error", err);
    return NextResponse.json(
      { message: "Falha ao revogar vínculo", error: String(err) },
      { status: 500 }
    );
  }
}
