import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { query } from "@/lib/db";
import { reatribuirVistoria } from "@/lib/glpi/painel";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  let adminNome = "Administrador";
  let adminId = 0;
  try {
    const claims = await verifySessionJwt(token);
    if (claims.role !== "admin") return NextResponse.json({ message: "Acesso negado" }, { status: 403 });
    adminNome = claims.email ?? "Administrador";
    adminId = Number(claims.sub) || 0;
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  const vistoriaId = Number(params.id);
  if (!vistoriaId || !Number.isFinite(vistoriaId)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let body: { tecnicoId: number; motivo: string } = { tecnicoId: 0, motivo: "" };
  try { body = await request.json(); } catch { /* ok */ }

  if (!body.tecnicoId || body.tecnicoId <= 0) {
    return NextResponse.json({ message: "Técnico inválido" }, { status: 400 });
  }
  if (!body.motivo?.trim()) {
    return NextResponse.json({ message: "Motivo obrigatório" }, { status: 400 });
  }

  const [ne] = await query<{ name: string }>(
    "SELECT name FROM glpi_networkequipments WHERE id = ? AND is_deleted = 0 LIMIT 1",
    [vistoriaId]
  );
  if (!ne) return NextResponse.json({ message: "Equipamento não encontrado" }, { status: 404 });

  const [tec] = await query<{ name: string }>(
    "SELECT name FROM glpi_users WHERE id = ? LIMIT 1",
    [body.tecnicoId]
  );

  await reatribuirVistoria(vistoriaId, body.tecnicoId);

  void auditInsert({
    ator: { id: adminId, nome: adminNome, role: "admin" },
    acao: "vistoria-atribuida",
    alvo: { tipo: "vistoria", id: String(vistoriaId), label: ne.name },
    descricao: `Reatribuído para ${tec?.name ?? body.tecnicoId}. Motivo: ${body.motivo.trim()}`,
  });

  return NextResponse.json({ ok: true });
}
