import { NextResponse } from "next/server";
import { finalizarInstalacao, getInstalacao } from "@/lib/glpi/instalacoes";
import {
  buildEquipmentFilePath,
  saveEquipmentFiles,
  type FilePayload,
} from "@/lib/glpi/uploads";
import { upsertInstalacaoQueue } from "@/lib/glpi/instalacaoQueue";
import { getActorFromRequest } from "@/lib/auth-request";
import { auditInsert } from "@/lib/glpi/audit";
import { logError } from "@/lib/observability";
import type { InstalacaoChecklistKey } from "@/lib/glpi/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface FinalizarInstalacaoPayload {
  checklist: Partial<Record<InstalacaoChecklistKey, boolean>>;
  tensaoIdentificadaId: number;
}

async function blobToBuffer(file: File): Promise<Buffer> {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
}

// As 7 fotos fixas do Relatório Técnico Fotográfico de instalação. Nomes
// diferentes das fotos de vistoria (imagem1-5.png) — mesma pasta do
// equipamento, sem colisão nenhuma.
const PHOTO_SLOTS = [
  { field: "foto1", filename: "instalacao_foto1.png" }, // Chegada e inspeção
  { field: "foto2", filename: "instalacao_foto2.png" }, // Preparação do material
  { field: "foto3", filename: "instalacao_foto3.png" }, // Fixação da cinta
  { field: "foto4", filename: "instalacao_foto4.png" }, // Fixação do Access Point
  { field: "foto5", filename: "instalacao_foto5.png" }, // Teste de tensão
  { field: "foto6", filename: "instalacao_foto6.png" }, // Vista frontal
  { field: "foto7", filename: "instalacao_foto7.png" }, // Vista geral final
] as const;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  const actor = await getActorFromRequest(request).catch(() => null);
  if (!actor) {
    return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  }

  let payload: FinalizarInstalacaoPayload;
  const files: Array<FilePayload | null> = [];

  try {
    const formData = await request.formData();
    const rawPayload = formData.get("payload");
    if (typeof rawPayload !== "string") {
      return NextResponse.json({ message: "Payload ausente" }, { status: 400 });
    }
    payload = JSON.parse(rawPayload) as FinalizarInstalacaoPayload;

    for (const slot of PHOTO_SLOTS) {
      const entry = formData.get(slot.field);
      if (entry instanceof File && entry.size > 0) {
        files.push({ filename: slot.filename, data: await blobToBuffer(entry) });
      } else {
        files.push(null);
      }
    }
  } catch (err) {
    console.error("[instalacoes/finalizar] erro parsing FormData", err);
    return NextResponse.json(
      { message: "Payload inválido", error: String(err) },
      { status: 400 }
    );
  }

  if (!payload.tensaoIdentificadaId) {
    return NextResponse.json(
      { message: "Informe a tensão identificada (127V ou 220V)" },
      { status: 400 }
    );
  }
  if (files.every((f) => f == null)) {
    return NextResponse.json(
      { message: "Envie ao menos uma foto do registro fotográfico" },
      { status: 400 }
    );
  }

  try {
    const instalacao = await getInstalacao(id);
    if (!instalacao) {
      return NextResponse.json({ message: "Instalação não encontrada" }, { status: 404 });
    }

    const afetados = await finalizarInstalacao(id, {
      checklist: payload.checklist,
      tensaoIdentificadaId: payload.tensaoIdentificadaId,
    });
    if (afetados === 0) {
      return NextResponse.json(
        { message: "Essa instalação não está mais Em Instalação — não foi finalizada." },
        { status: 409 }
      );
    }

    const saved = await saveEquipmentFiles(instalacao.equipamento, files);

    const imagePaths = PHOTO_SLOTS.map((slot) =>
      buildEquipmentFilePath(instalacao.equipamento, slot.filename)
    );
    await upsertInstalacaoQueue({
      items_id: id,
      equipment_name: instalacao.equipamento,
      project_status: "PENDENTE",
      project_date: new Date().toISOString().slice(0, 19).replace("T", " "),
      imagePaths,
    });

    void auditInsert({
      ator: actor,
      acao: "instalacao-finalizada",
      alvo: { tipo: "instalacao", id: String(id), label: instalacao.equipamento },
      descricao: "Instalação finalizada em campo",
    });

    return NextResponse.json({
      ok: true,
      instalacao_id: id,
      saved: saved.map((s) => ({ filename: s.filename, size: s.size })),
    });
  } catch (error) {
    console.error("[api/instalacoes/:id/finalizar] error", error);
    void logError("app", "instalacoes/:id/finalizar", error, { id });
    return NextResponse.json(
      { message: "Falha ao finalizar instalação", error: String(error) },
      { status: 500 }
    );
  }
}
