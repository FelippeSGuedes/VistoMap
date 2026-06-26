import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { query, execute } from "@/lib/db";
import { ensureOverrideTable } from "@/lib/ensureOverrideTable";
import { TABLE_FIELDS, SITUACAO_COLUMN, SITUACAO_EM_VISTORIA } from "@/lib/glpi/constants";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ResponderBody {
  acao: "aprovar" | "reprovar";
  motivo?: string;
}

/** Admin: POST /api/painel/notificacoes/[reqId]/responder */
export async function POST(
  request: Request,
  { params }: { params: { reqId: string } }
) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
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

  const reqId = Number(params.reqId);
  if (!reqId || !Number.isFinite(reqId)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let body: ResponderBody = { acao: "aprovar" };
  try { body = (await request.json()) as ResponderBody; } catch { /* ok */ }

  if (!["aprovar", "reprovar"].includes(body.acao)) {
    return NextResponse.json({ message: "acao inválida" }, { status: 400 });
  }
  if (body.acao === "reprovar" && !body.motivo?.trim()) {
    return NextResponse.json({ message: "Informe o motivo da reprovação" }, { status: 400 });
  }

  await ensureOverrideTable();

  const rows = await query<{ id: number; vistoria_id: number; equipamento: string; tecnico_nome: string; status: string }>(
    "SELECT id, vistoria_id, equipamento, tecnico_nome, status FROM `glpi_plugin_vistomap_override_requests` WHERE id = ? LIMIT 1",
    [reqId]
  );
  if (!rows.length) return NextResponse.json({ message: "Solicitação não encontrada" }, { status: 404 });

  const row = rows[0];
  if (row.status !== "PENDENTE") {
    return NextResponse.json({ message: "Solicitação já respondida" }, { status: 409 });
  }

  const novoStatus = body.acao === "aprovar" ? "APROVADO" : "REPROVADO";

  await execute(
    `UPDATE \`glpi_plugin_vistomap_override_requests\`
     SET status = ?, motivo_reprovacao = ?, updated_at = NOW()
     WHERE id = ?`,
    [novoStatus, body.acao === "reprovar" ? (body.motivo ?? "").trim() : null, reqId]
  );

  // Aprovação → seta situação Em Vistoria imediatamente
  if (body.acao === "aprovar") {
    const vistoriaId = row.vistoria_id;
    if (vistoriaId > 0) {
      await execute(
        `UPDATE \`${TABLE_FIELDS}\` SET \`${SITUACAO_COLUMN}\` = ? WHERE items_id = ?`,
        [SITUACAO_EM_VISTORIA, vistoriaId]
      );
    }
  }

  void auditInsert({
    ator: { id: adminId, nome: adminNome, role: "admin" },
    acao: body.acao === "aprovar" ? "override-aprovado" : "override-reprovado",
    alvo: { tipo: "vistoria", id: String(row.vistoria_id), label: row.equipamento },
    descricao: body.acao === "aprovar"
      ? `Início fora do raio APROVADO para ${row.tecnico_nome} — ${row.equipamento}`
      : `Início fora do raio REPROVADO para ${row.tecnico_nome} — ${row.equipamento}. Motivo: ${body.motivo}`,
  });

  return NextResponse.json({ ok: true, status: novoStatus });
}
