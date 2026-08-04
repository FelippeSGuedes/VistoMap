import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { execute } from "@/lib/db";
import {
  TABLE_FIELDS,
  TABLE_NE,
  STATE_AGUARDANDO_VISTORIA,
  STATE_LIBERADO_INSTALACAO,
} from "@/lib/glpi/constants";
import {
  decidirInstalacaoRejeicao,
  fetchInstalacaoRejeicaoPorId,
} from "@/lib/glpi/instalacaoRejeicoes";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DecidirBody {
  acao: "escalar" | "descartar";
}

/**
 * POST /api/painel/instalacoes/rejeitadas/[id]/decidir  (moderador+)
 *
 * `id` aqui é o id da REJEIÇÃO (glpi_plugin_vistomap_instalacao_rejeicoes),
 * não do NetworkEquipment — mesmo padrão de /notificacoes/recusas/[id]/responder.
 *
 * escalar: volta pro fluxo de vistoria (states_id = AGUARDANDO VISTORIA) —
 * precisa ser revistoriado e reaprovado antes de liberar pra instalação de
 * novo (o hook de auto-liberação cuida disso).
 * descartar: analista decidiu que a rejeição não procede — libera de volta
 * pra instalação (states_id = LIBERADO), qualquer instalador pode pegar.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(request, "moderador");
  if (!auth.ok) return auth.response;
  const adminNome = auth.claims.email ?? "Administrador";
  const adminId = Number(auth.claims.sub) || 0;

  const rejeicaoId = Number(params.id);
  if (!rejeicaoId || !Number.isFinite(rejeicaoId)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let body: DecidirBody;
  try {
    body = (await request.json()) as DecidirBody;
  } catch {
    return NextResponse.json({ message: "Payload inválido" }, { status: 400 });
  }
  if (!["escalar", "descartar"].includes(body.acao)) {
    return NextResponse.json({ message: "acao inválida" }, { status: 400 });
  }

  const rejeicao = await fetchInstalacaoRejeicaoPorId(rejeicaoId);
  if (!rejeicao) return NextResponse.json({ message: "Rejeição não encontrada" }, { status: 404 });
  if (rejeicao.status !== "PENDENTE") {
    return NextResponse.json({ message: "Essa rejeição já foi decidida" }, { status: 409 });
  }

  const novoStatus = body.acao === "escalar" ? "ESCALADO" : "DESCARTADO";
  await decidirInstalacaoRejeicao(rejeicaoId, novoStatus, { id: adminId, nome: adminNome });

  const novoStateId = body.acao === "escalar" ? STATE_AGUARDANDO_VISTORIA : STATE_LIBERADO_INSTALACAO;
  await execute(
    `UPDATE \`${TABLE_FIELDS}\` f
       INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id
        SET ne.states_id = ?
      WHERE f.items_id = ?`,
    [novoStateId, rejeicao.items_id]
  );

  void auditInsert({
    ator: { id: adminId, nome: adminNome, role: "admin" },
    acao: body.acao === "escalar" ? "instalacao-rejeicao-escalada" : "instalacao-rejeicao-descartada",
    alvo: { tipo: "instalacao", id: String(rejeicao.items_id), label: rejeicao.equipamento },
    descricao:
      body.acao === "escalar"
        ? `Rejeição de instalação escalada pra vistoria (correção). Motivo original: ${rejeicao.motivo}`
        : `Rejeição de instalação descartada — poste liberado de volta pra instalação.`,
  });

  return NextResponse.json({ ok: true, status: novoStatus });
}
