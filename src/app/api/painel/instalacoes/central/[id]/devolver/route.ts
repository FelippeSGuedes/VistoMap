import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";
import { devolverInstalacao } from "@/lib/glpi/instalacoes";
import { criarInstalacaoDevolucao } from "@/lib/glpi/instalacaoDevolucoes";
import { auditInsert } from "@/lib/glpi/audit";
import { sendPushTo } from "@/lib/push";
import { INSTALACAO_INSTALADOR_COLUMN } from "@/lib/glpi/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DevolverBody {
  itensChecklist?: string[];
  fotos?: number[];
  motivo?: string;
}

/**
 * POST /api/painel/instalacoes/central/[id]/devolver (moderador+)
 *
 * Devolve o poste pro MESMO instalador corrigir só o que foi apontado
 * (itens do checklist e/ou fotos específicas) — states_id volta pra
 * EM_INSTALACAO (não desvincula). Grava em
 * glpi_plugin_vistomap_instalacao_devolucoes (histórico/auditoria — sem
 * dashboard próprio ainda) e notifica o instalador.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(request, "moderador");
  if (!auth.ok) return auth.response;
  const analistaNome = auth.claims.email ?? "Administrador";
  const analistaId = Number(auth.claims.sub) || 0;

  const itemsId = Number(params.id);
  if (!itemsId || !Number.isFinite(itemsId)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let body: DevolverBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const itensChecklist = Array.isArray(body.itensChecklist)
    ? body.itensChecklist.filter((i) => typeof i === "string" && i.trim())
    : [];
  const fotos = Array.isArray(body.fotos) ? body.fotos.filter((n) => Number.isInteger(n) && n >= 1 && n <= 7) : [];
  const motivo = (body.motivo ?? "").trim();

  if (itensChecklist.length === 0 && fotos.length === 0) {
    return NextResponse.json({ message: "Selecione ao menos um item do checklist ou uma foto" }, { status: 400 });
  }
  if (!motivo) {
    return NextResponse.json({ message: "Motivo obrigatório" }, { status: 400 });
  }

  try {
    const [row] = await query<{ equipamento: string; instalador_id: number | null; instalador_nome: string | null }>(
      `SELECT ne.name AS equipamento, f.${INSTALACAO_INSTALADOR_COLUMN} AS instalador_id, u.name AS instalador_nome
         FROM glpi_networkequipments ne
         JOIN glpi_plugin_fields_networkequipmentdispositivosderedes f ON f.items_id = ne.id
         LEFT JOIN glpi_users u ON u.id = f.${INSTALACAO_INSTALADOR_COLUMN}
        WHERE ne.id = ? AND ne.is_deleted = 0
        LIMIT 1`,
      [itemsId]
    );
    if (!row) return NextResponse.json({ message: "Equipamento não encontrado" }, { status: 404 });

    await devolverInstalacao(itemsId);

    const devolucaoId = await criarInstalacaoDevolucao({
      itemsId,
      equipamento: row.equipamento,
      instaladorId: row.instalador_id,
      instaladorNome: row.instalador_nome,
      analistaId,
      analistaNome,
      itensChecklist,
      fotos,
      motivo,
    });

    if (row.instalador_id) {
      void sendPushTo({
        usersIds: [row.instalador_id],
        title: "Instalação devolvida para correção",
        body: `${row.equipamento} precisa de correção — ${motivo}`,
        data: { url: "/app/instalacao", items_id: String(itemsId), tipo: "devolucao" },
      });
    }

    void auditInsert({
      ator: { id: analistaId, nome: analistaNome, role: auth.claims.role ?? "admin" },
      acao: "instalacao-devolvida",
      alvo: { tipo: "instalacao", id: String(itemsId), label: row.equipamento },
      descricao: `Devolvida para correção — ${itensChecklist.length} item(ns), ${fotos.length} foto(s): ${motivo}`,
    });

    return NextResponse.json({ ok: true, devolucaoId });
  } catch (err) {
    console.error("[api/painel/instalacoes/central/devolver] error", err);
    return NextResponse.json(
      { message: "Falha ao devolver a instalação", error: String(err) },
      { status: 500 }
    );
  }
}
