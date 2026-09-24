import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { excluirTecnicoObservacao } from "@/lib/glpi/tecnicoObservacoes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** DELETE /api/painel/tecnico-observacoes/[id] (leitura) */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(request, "leitura");
  if (!auth.ok) return auth.response;

  const id = Number(params.id);
  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  try {
    await excluirTecnicoObservacao(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/painel/tecnico-observacoes/[id]] DELETE error", err);
    return NextResponse.json({ message: "Falha ao excluir observação", error: String(err) }, { status: 500 });
  }
}
