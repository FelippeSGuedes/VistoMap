import { NextResponse } from "next/server";
import { getVistoria } from "@/lib/glpi/equipments";
import { getActorFromRequest } from "@/lib/auth-request";
import { ensureOverrideTable } from "@/lib/ensureOverrideTable";
import { execute } from "@/lib/db";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * POST /api/vistorias/[id]/nao-posso-deslocar  (técnico)
 *
 * Escape hatch da correção de devolução quando o item apontado exige
 * deslocamento (foto/vídeo) mas o técnico não consegue ir agora. Mesmo
 * mecanismo de aprovação do "iniciar fora do raio" (override_requests) —
 * só ADIA a cobrança (não bloqueia mais nem manda notificação insistente
 * enquanto pendente), a devolução continua aberta esperando a correção.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) return NextResponse.json({ message: "ID inválido" }, { status: 400 });

  const actor = await getActorFromRequest(request).catch(() => null);
  if (!actor) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  let body: { justificativa?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* corpo vazio é aceitável */
  }
  const justificativa = (body.justificativa ?? "").trim();
  if (!justificativa) {
    return NextResponse.json({ message: "Explique o motivo" }, { status: 400 });
  }

  const vistoria = await getVistoria(id);
  if (!vistoria) return NextResponse.json({ message: "Vistoria não encontrada" }, { status: 404 });

  await ensureOverrideTable();
  const { insertId } = await execute(
    `INSERT INTO \`glpi_plugin_vistomap_override_requests\`
       (vistoria_id, users_id, equipamento, tecnico_nome, justificativa, status, exception_label)
     VALUES (?, ?, ?, ?, ?, 'PENDENTE', 'DEVOLUCAO_NAO_POSSO_DESLOCAR')`,
    [id, actor.id, vistoria.equipamento, actor.nome, justificativa]
  );

  void auditInsert({
    ator: actor,
    acao: "override-solicitado",
    alvo: { tipo: "vistoria", id: String(id), label: vistoria.equipamento },
    descricao: `Não pode se deslocar agora pra corrigir devolução — justificativa: ${justificativa}`,
  });

  return NextResponse.json({ pending: true, requestId: insertId }, { status: 202 });
}
