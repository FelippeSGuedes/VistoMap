import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { getVistoria } from "@/lib/glpi/equipments";
import { execute } from "@/lib/db";
import { TABLE_FIELDS } from "@/lib/glpi/constants";
import { criarRecusa, fetchRecusaPendentePorVistoria } from "@/lib/glpi/recusas";
import { saveEquipmentFiles } from "@/lib/glpi/uploads";
import { auditInsert } from "@/lib/glpi/audit";
import { logError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface RecusarPayload {
  motivo?: string;
  respostas?: Record<string, string>;
  justificativa?: string;
}

const FOTO_FILENAME = "recusa_evidencia.jpg";

async function blobToBuffer(file: File): Promise<Buffer> {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * POST /api/vistorias/[id]/recusar  (técnico)
 *
 * Sinaliza que a vistoria é impossível de fazer (propriedade privada,
 * risco, poste removido, sem alternativa nas redondezas, etc.) e pede
 * aprovação do analista. Enquanto PENDENTE, o técnico é desvinculado
 * (users_id_vistoriadorafield = 0 — convenção GLPI, a coluna é NOT NULL)
 * — some da fila dele até o analista decidir. Aprovada, some de
 * circulação de vez; reprovada, a rota de
 * responder (painel) reatribui de volta pro mesmo técnico.
 *
 * multipart/form-data: `payload` (JSON) + `foto` opcional. A foto vai pra
 * MESMA pasta do equipamento (nome fixo, sobrescreve se houver outra) —
 * já aparece de graça em /api/painel/vistoria/[id]/files.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (id == null) return NextResponse.json({ message: "ID inválido" }, { status: 400 });

  const actor = await getActorFromRequest(request);
  if (!actor) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  const formData = await request.formData();
  const rawPayload = formData.get("payload");
  let payload: RecusarPayload = {};
  if (typeof rawPayload === "string") {
    try {
      payload = JSON.parse(rawPayload) as RecusarPayload;
    } catch {
      return NextResponse.json({ message: "Payload inválido" }, { status: 400 });
    }
  }

  const motivo = (payload.motivo ?? "").trim();
  const justificativa = (payload.justificativa ?? "").trim();
  const respostas = payload.respostas ?? {};
  if (!motivo) return NextResponse.json({ message: "Motivo obrigatório" }, { status: 400 });
  if (!justificativa) return NextResponse.json({ message: "Justificativa obrigatória" }, { status: 400 });

  const fotoFile = formData.get("foto");

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

    let fotoPath: string | null = null;
    if (fotoFile instanceof File && fotoFile.size > 0) {
      await saveEquipmentFiles(vistoria.equipamento, [
        { filename: FOTO_FILENAME, data: await blobToBuffer(fotoFile) },
      ]);
      fotoPath = FOTO_FILENAME;
    }

    const recusaId = await criarRecusa({
      vistoriaId: id,
      equipamento: vistoria.equipamento,
      tecnicoId: actor.id,
      tecnicoNome: actor.nome,
      motivo,
      respostas,
      justificativa,
      fotoPath,
    });

    // Some da fila do técnico até o analista decidir — mesma lógica de
    // "desvincula pra não travar o técnico olhando pra ela". A coluna é
    // NOT NULL DEFAULT 0 (convenção GLPI pra FK "sem valor") — 0, nunca NULL.
    await execute(
      `UPDATE \`${TABLE_FIELDS}\` SET users_id_vistoriadorafield = 0 WHERE items_id = ?`,
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
