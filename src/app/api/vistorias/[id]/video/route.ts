import { NextResponse } from "next/server";
import { getVistoria } from "@/lib/glpi/equipments";
import { saveEquipmentFiles } from "@/lib/glpi/uploads";
import { getActorFromRequest } from "@/lib/auth-request";
import { logError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function blobToBuffer(file: File): Promise<Buffer> {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
}

// Mesma whitelist do finalizar/route.ts — nunca confia no nome de arquivo
// do cliente sem checar contra os formatos reais que MediaRecorder/câmera
// nativa produzem.
const ALLOWED_VIDEO_EXT = new Set(["mp4", "webm", "mov", "3gp", "m4v"]);

/**
 * POST /api/vistorias/[id]/video (técnico)
 *
 * Achado 2026-09-22 (Marco, JUN-G-R-001): o vídeo 360 é de longe a parte
 * mais pesada do finalizar e a mais sujeita a travar em sinal fraco de
 * campo. finalizar() já tolera vídeo ausente (não é campo obrigatório) —
 * essa rota completa depois, em background, sem reenviar payload nenhum
 * (nem os dados do formulário, nem as fotos) e sem bloquear a vistoria:
 * ela já foi salva, situação/status/PDF já avançaram sem depender disso —
 * o vídeo nem entra no PDF (file_manager.py exclui video360 do template).
 * Cliente: ver executeUploadVideoFollowup em syncRunner.ts.
 */
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

  try {
    const vistoria = await getVistoria(id);
    if (!vistoria) {
      return NextResponse.json({ message: "Vistoria não encontrada" }, { status: 404 });
    }
    if (actor.role === "tecnico" && String(actor.id) !== vistoria.tecnico.id) {
      return NextResponse.json({ message: "Você não tem acesso a esta vistoria" }, { status: 403 });
    }

    const formData = await request.formData();
    const video = formData.get("video360");
    if (!(video instanceof File) || video.size === 0) {
      return NextResponse.json({ message: "Vídeo ausente" }, { status: 400 });
    }

    const rawExt = video.name.includes(".") ? video.name.split(".").pop() ?? "" : "";
    const ext = ALLOWED_VIDEO_EXT.has(rawExt.toLowerCase()) ? rawExt.toLowerCase() : "mp4";
    const buf = await blobToBuffer(video);

    console.log(`[vistorias/video] id=${id} video360 → ${buf.byteLength} bytes`);
    await saveEquipmentFiles(vistoria.equipamento, [
      { filename: `video360.${ext}`, data: buf },
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[vistorias/video] erro", error);
    void logError("app", "vistorias/:id/video", error, { id });
    return NextResponse.json({ message: "Erro ao salvar vídeo" }, { status: 500 });
  }
}
