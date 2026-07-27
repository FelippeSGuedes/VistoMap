import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { query } from "@/lib/db";
import { devolverVistoria } from "@/lib/glpi/painel";
import { criarDevolucao } from "@/lib/glpi/devolucoes";
import { devolucaoPrecisaDeslocamento } from "@/lib/glpi/devolucaoItens";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DevolverBody {
  itens?: string[];
  motivos?: string[];
  motivoOutro?: string;
}

/**
 * POST /api/painel/central-vistorias/[id]/devolver  (admin)
 *
 * Devolve a vistoria pro técnico corrigir só os itens apontados (fotos
 * e/ou campos do formulário) — diferente de reprovar (revisita completa)
 * ou cancelar (some da fila). Situação vira "Devolvida para Correção" (8),
 * datas de envio são limpas, e um registro fica em
 * glpi_plugin_vistomap_devolucoes pro dashboard de Devoluções e pra Fase 2
 * (notificação + tela de correção no app técnico) usar.
 */
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

  let body: DevolverBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const itens = Array.isArray(body.itens) ? body.itens.filter((i) => typeof i === "string" && i.trim()) : [];
  const motivos = Array.isArray(body.motivos) ? body.motivos.filter((m) => typeof m === "string" && m.trim()) : [];
  const motivoOutro = (body.motivoOutro ?? "").trim() || null;

  if (itens.length === 0) {
    return NextResponse.json({ message: "Selecione ao menos um item errado" }, { status: 400 });
  }
  if (motivos.length === 0) {
    return NextResponse.json({ message: "Selecione ao menos um motivo" }, { status: 400 });
  }
  if (motivos.includes("Outro") && !motivoOutro) {
    return NextResponse.json({ message: "Descreva o motivo em \"Outro\"" }, { status: 400 });
  }

  const [row] = await query<{ equipamento: string; tecnico_id: number | null; tecnico_nome: string | null }>(
    `SELECT ne.name AS equipamento, f.users_id_vistoriadorafield AS tecnico_id, u.name AS tecnico_nome
       FROM glpi_networkequipments ne
       JOIN glpi_plugin_fields_networkequipmentdispositivosderedes f ON f.items_id = ne.id
       LEFT JOIN glpi_users u ON u.id = f.users_id_vistoriadorafield
      WHERE ne.id = ? AND ne.is_deleted = 0
      LIMIT 1`,
    [vistoriaId]
  );
  if (!row) return NextResponse.json({ message: "Equipamento não encontrado" }, { status: 404 });

  const precisaDeslocamento = devolucaoPrecisaDeslocamento(itens);

  await devolverVistoria(vistoriaId);

  const devolucaoId = await criarDevolucao({
    vistoriaId,
    equipamento: row.equipamento,
    tecnicoId: row.tecnico_id,
    tecnicoNome: row.tecnico_nome,
    analistaId: adminId,
    analistaNome: adminNome,
    itens,
    motivos,
    motivoOutro,
    precisaDeslocamento,
  });

  // Fase 2: disparar notificação push pro técnico aqui.

  void auditInsert({
    ator: { id: adminId, nome: adminNome, role: "admin" },
    acao: "vistoria-devolvida",
    alvo: { tipo: "vistoria", id: String(vistoriaId), label: row.equipamento },
    descricao: `Devolvida para correção — ${itens.length} item(ns): ${motivos.join(", ")}`,
  });

  return NextResponse.json({ ok: true, devolucaoId, precisaDeslocamento });
}
