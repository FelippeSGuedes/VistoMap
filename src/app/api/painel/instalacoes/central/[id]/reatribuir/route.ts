import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";
import { reatribuirInstalacao } from "@/lib/glpi/instalacoes";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/painel/instalacoes/central/[id]/reatribuir — espelha central-vistorias/[id]/reatribuir. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(request, "moderador");
  if (!auth.ok) return auth.response;
  const analistaNome = auth.claims.email ?? "Administrador";
  const analistaId = Number(auth.claims.sub) || 0;

  const itemsId = Number(params.id);
  if (!itemsId || !Number.isFinite(itemsId)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let body: { instaladorId?: number; motivo?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  if (!body.instaladorId || body.instaladorId <= 0) {
    return NextResponse.json({ message: "Instalador inválido" }, { status: 400 });
  }
  if (!body.motivo?.trim()) {
    return NextResponse.json({ message: "Motivo obrigatório" }, { status: 400 });
  }

  const [ne] = await query<{ name: string }>(
    "SELECT name FROM glpi_networkequipments WHERE id = ? AND is_deleted = 0 LIMIT 1",
    [itemsId]
  );
  if (!ne) return NextResponse.json({ message: "Equipamento não encontrado" }, { status: 404 });

  const [inst] = await query<{ name: string }>("SELECT name FROM glpi_users WHERE id = ? LIMIT 1", [
    body.instaladorId,
  ]);

  await reatribuirInstalacao(itemsId, body.instaladorId);

  void auditInsert({
    ator: { id: analistaId, nome: analistaNome, role: auth.claims.role ?? "admin" },
    acao: "instalacao-reatribuida",
    alvo: { tipo: "instalacao", id: String(itemsId), label: ne.name },
    descricao: `Reatribuído para ${inst?.name ?? body.instaladorId}. Motivo: ${body.motivo.trim()}`,
  });

  return NextResponse.json({ ok: true });
}
