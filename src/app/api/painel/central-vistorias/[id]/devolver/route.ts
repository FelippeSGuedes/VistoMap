import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";
import { devolverVistoria } from "@/lib/glpi/painel";
import { criarDevolucao } from "@/lib/glpi/devolucoes";
import { devolucaoPrecisaDeslocamento } from "@/lib/glpi/devolucaoItens";
import { auditInsert } from "@/lib/glpi/audit";
import { sendPushTo } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DevolverBody {
  itens?: string[];
  motivos?: string[];
  motivoOutro?: string;
  /** Redireciona a devolução pra outro técnico — o original pode não ter como resolver. */
  novoTecnicoId?: number;
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
  const auth = await requirePainelRole(request, "moderador");
  if (!auth.ok) return auth.response;
  const adminNome = auth.claims.email ?? "Administrador";
  const adminId = Number(auth.claims.sub) || 0;

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
  const novoTecnicoId =
    typeof body.novoTecnicoId === "number" && body.novoTecnicoId > 0 ? body.novoTecnicoId : undefined;

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

  // Se veio um novo técnico, ele — não o original — é quem passa a ser o
  // responsável pela devolução (registro em devolucoes.tecnico_id, que é
  // o que o app do técnico consulta pra saber se HÁ algo pendente pra ele).
  let tecnicoFinalId = row.tecnico_id;
  let tecnicoFinalNome = row.tecnico_nome;
  if (novoTecnicoId) {
    const [novoTec] = await query<{ name: string }>("SELECT name FROM glpi_users WHERE id = ? LIMIT 1", [
      novoTecnicoId,
    ]);
    if (!novoTec) return NextResponse.json({ message: "Técnico inválido" }, { status: 400 });
    tecnicoFinalId = novoTecnicoId;
    tecnicoFinalNome = novoTec.name;
  }

  const precisaDeslocamento = devolucaoPrecisaDeslocamento(itens);

  await devolverVistoria(vistoriaId, novoTecnicoId);

  const devolucaoId = await criarDevolucao({
    vistoriaId,
    equipamento: row.equipamento,
    tecnicoId: tecnicoFinalId,
    tecnicoNome: tecnicoFinalNome,
    analistaId: adminId,
    analistaNome: adminNome,
    itens,
    motivos,
    motivoOutro,
    precisaDeslocamento,
  });

  if (tecnicoFinalId) {
    void sendPushTo({
      usersIds: [tecnicoFinalId],
      title: "Vistoria devolvida para correção",
      body: `${row.equipamento} precisa de correção — ${motivos[0]}${motivos.length > 1 ? ` +${motivos.length - 1}` : ""}`,
      data: { url: "/app/vistorias", vistoria_id: String(vistoriaId), tipo: "devolucao" },
    });
  }

  void auditInsert({
    ator: { id: adminId, nome: adminNome, role: "admin" },
    acao: "vistoria-devolvida",
    alvo: { tipo: "vistoria", id: String(vistoriaId), label: row.equipamento },
    descricao: `Devolvida para correção — ${itens.length} item(ns): ${motivos.join(", ")}${
      novoTecnicoId ? ` — redirecionada para ${tecnicoFinalNome ?? novoTecnicoId}` : ""
    }`,
  });

  return NextResponse.json({ ok: true, devolucaoId, precisaDeslocamento });
}
