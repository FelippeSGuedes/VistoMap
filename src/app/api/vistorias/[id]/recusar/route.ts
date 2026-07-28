import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { getVistoria } from "@/lib/glpi/equipments";
import { execute } from "@/lib/db";
import { TABLE_FIELDS } from "@/lib/glpi/constants";
import { criarRecusa, fetchRecusaPendentePorVistoria } from "@/lib/glpi/recusas";
import { auditInsert } from "@/lib/glpi/audit";
import { logError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface RecusarBody {
  motivo?: string;
  respostas?: Record<string, string>;
  justificativa?: string;
}

/**
 * POST /api/vistorias/[id]/recusar  (técnico)
 *
 * Sinaliza que a vistoria é impossível de fazer (propriedade privada,
 * risco, poste removido, sem alternativa nas redondezas, etc.) e pede
 * aprovação do analista. Enquanto PENDENTE, o técnico é desvinculado
 * (users_id_vistoriadorafield = NULL) — some da fila dele até o analista
 * decidir. Aprovada, some de circulação de vez; reprovada, a rota de
 * responder (painel) reatribui de volta pro mesmo técnico.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (id == null) return NextResponse.json({ message: "ID inválido" }, { status: 400 });

  const actor = await getActorFromRequest(request);
  if (!actor) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  let body: RecusarBody;
  try {
    body = (await request.json()) as RecusarBody;
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const motivo = (body.motivo ?? "").trim();
  const justificativa = (body.justificativa ?? "").trim();
  const respostas = body.respostas ?? {};
  if (!motivo) return NextResponse.json({ message: "Motivo obrigatório" }, { status: 400 });
  if (!justificativa) return NextResponse.json({ message: "Justificativa obrigatória" }, { status: 400 });

  try {
    const vistoria = await getVistoria(id);
    if (!vistoria) return NextResponse.json({ message: "Vistoria não encontrada" }, { status: 404 });

    const existente = await fetchRecusaPendentePorVistoria(id);
    if (existente) {
      return NextResponse.json(
        { message: "Já existe uma recusa pendente pra essa vistoria", recusaId: existente.id },
        { status: 409 }
      );
    }

    const recusaId = await criarRecusa({
      vistoriaId: id,
      equipamento: vistoria.equipamento,
      tecnicoId: actor.id,
      tecnicoNome: actor.nome,
      motivo,
      respostas,
      justificativa,
    });

    // Some da fila do técnico até o analista decidir — mesma lógica de
    // "desvincula pra não travar o técnico olhando pra ela".
    await execute(
      `UPDATE \`${TABLE_FIELDS}\` SET users_id_vistoriadorafield = NULL WHERE items_id = ?`,
      [id]
    );

    void auditInsert({
      ator: { id: actor.id, nome: actor.nome, role: "tecnico" },
      acao: "recusa-solicitada",
      alvo: { tipo: "vistoria", id: String(id), label: vistoria.equipamento },
      descricao: justificativa,
    });

    return NextResponse.json({ ok: true, recusaId });
  } catch (error) {
    console.error("[api/vistorias/:id/recusar] error", error);
    void logError("app", "vistorias/:id/recusar", error, { id });
    return NextResponse.json({ message: "Falha ao registrar recusa", error: String(error) }, { status: 500 });
  }
}
