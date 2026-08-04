import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { getInstalacao } from "@/lib/glpi/instalacoes";
import { execute } from "@/lib/db";
import {
  TABLE_FIELDS,
  TABLE_NE,
  STATE_INSTALACAO_REJEITADA,
  INSTALACAO_INSTALADOR_COLUMN,
} from "@/lib/glpi/constants";
import {
  criarInstalacaoRejeicao,
  fetchInstalacaoRejeicaoPendentePorItem,
} from "@/lib/glpi/instalacaoRejeicoes";
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

interface RejeitarPayload {
  motivo?: string;
  justificativa?: string;
}

async function blobToBuffer(file: File): Promise<Buffer> {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
}

const FOTO_SLOTS = ["foto1", "foto2", "foto3"] as const;
const FOTO_FILENAMES = [
  "instalacao_rejeicao_foto1.jpg",
  "instalacao_rejeicao_foto2.jpg",
  "instalacao_rejeicao_foto3.jpg",
] as const;

/**
 * POST /api/instalacoes/[id]/rejeitar  (instalador)
 *
 * Motivo + justificativa + até 3 fotos (1 obrigatória), igual ao padrão de
 * recusa da vistoria — mas grava numa tabela PRÓPRIA
 * (glpi_plugin_vistomap_instalacao_rejeicoes), não na de recusas de
 * vistoria: aquela alimenta a fila de aprovação em /painel/notificacoes,
 * misturar ia contaminar essa fila com motivos que não são de vistoria.
 *
 * Ao rejeitar, o poste sai da mão do instalador e fica em states_id =
 * INSTALAÇÃO REJEITADA — aparece na aba "Instalações › Rejeitadas" do
 * painel, onde o analista decide se escala pra vistoria (volta pro fluxo
 * de correção) ou descarta a rejeição (libera de novo pra instalação).
 * NÃO volta automaticamente pra vistoria.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (id == null) return NextResponse.json({ message: "ID inválido" }, { status: 400 });

  const actor = await getActorFromRequest(request);
  if (!actor) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  const formData = await request.formData();
  const rawPayload = formData.get("payload");
  let payload: RejeitarPayload = {};
  if (typeof rawPayload === "string") {
    try {
      payload = JSON.parse(rawPayload) as RejeitarPayload;
    } catch {
      return NextResponse.json({ message: "Payload inválido" }, { status: 400 });
    }
  }

  const motivo = (payload.motivo ?? "").trim();
  const justificativa = (payload.justificativa ?? "").trim();
  if (!motivo) return NextResponse.json({ message: "Motivo obrigatório" }, { status: 400 });
  if (!justificativa) return NextResponse.json({ message: "Justificativa obrigatória" }, { status: 400 });

  const primeiraFoto = formData.get(FOTO_SLOTS[0]);
  if (!(primeiraFoto instanceof File) || primeiraFoto.size === 0) {
    return NextResponse.json({ message: "A 1ª foto é obrigatória" }, { status: 400 });
  }

  try {
    const instalacao = await getInstalacao(id);
    if (!instalacao) return NextResponse.json({ message: "Instalação não encontrada" }, { status: 404 });

    const existente = await fetchInstalacaoRejeicaoPendentePorItem(id);
    if (existente) {
      return NextResponse.json(
        { message: "Já existe uma rejeição pendente pra essa instalação", rejeicaoId: existente.id },
        { status: 409 }
      );
    }

    const fotoPaths: Array<string | null> = [null, null, null];
    for (let i = 0; i < FOTO_SLOTS.length; i++) {
      const file = formData.get(FOTO_SLOTS[i]);
      if (file instanceof File && file.size > 0) {
        await saveEquipmentFiles(instalacao.equipamento, [
          { filename: FOTO_FILENAMES[i], data: await blobToBuffer(file) },
        ]);
        fotoPaths[i] = FOTO_FILENAMES[i];
      }
    }

    const rejeicaoId = await criarInstalacaoRejeicao({
      itemsId: id,
      equipamento: instalacao.equipamento,
      instaladorId: actor.id,
      instaladorNome: actor.nome,
      motivo,
      justificativa,
      foto1Path: fotoPaths[0],
      foto2Path: fotoPaths[1],
      foto3Path: fotoPaths[2],
    });

    // Solta o poste da mão do instalador. Fica em "Instalação Rejeitada"
    // até o analista decidir — NÃO mexe no fluxo de vistoria sozinho.
    await execute(
      `UPDATE \`${TABLE_FIELDS}\` f
         INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id
          SET f.${INSTALACAO_INSTALADOR_COLUMN} = 0,
              ne.states_id = ?
        WHERE f.items_id = ?`,
      [STATE_INSTALACAO_REJEITADA, id]
    );

    void auditInsert({
      ator: { id: actor.id, nome: actor.nome, role: "instalador" },
      acao: "instalacao-rejeitada",
      alvo: { tipo: "instalacao", id: String(id), label: instalacao.equipamento },
      descricao: justificativa,
    });

    return NextResponse.json({ ok: true, rejeicaoId });
  } catch (error) {
    console.error("[api/instalacoes/:id/rejeitar] error", error);
    void logError("app", "instalacoes/:id/rejeitar", error, { id });
    return NextResponse.json({ message: "Falha ao registrar rejeição", error: String(error) }, { status: 500 });
  }
}
