import { NextResponse } from "next/server";
import { getVistoria, updateVistoriaFields } from "@/lib/glpi/equipments";
import { resolveDropdowns } from "@/lib/glpi/dropdowns";
import {
  buildEquipmentFilePath,
  saveEquipmentFiles,
  type FilePayload,
} from "@/lib/glpi/uploads";
import { upsertAuxiliaryProject } from "@/lib/glpi/auxiliary";
import {
  AUX_STATUS_PENDENTE,
  PENDENCIA_CPFL,
  STATUS_VISTORIA_EM_ANALISE,
  type DropdownKey,
} from "@/lib/glpi/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface FinalizarPayload {
  vistoria_id?: string;
  latitude: number;
  longitude: number;
  observacoes?: string;
  pspostefield?: string;
  alturadaantenafield?: string;
  endereofield?: string;
  aterramentofield?: string;
  intensidadedesinalfield?: string;
  velocidadefield?: string;
  motivofield?: string;
  dropdowns?: Partial<Record<DropdownKey, string>>;
  finalizadaEm?: string;
}

function formatGlpiDateTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}

async function blobToBuffer(file: File): Promise<Buffer> {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
}

const PHOTO_SLOTS = [
  { field: "imagem1", filename: "imagem1.png" },
  { field: "imagem2", filename: "imagem2.png" },
  { field: "imagem3", filename: "imagem3.png" },
  { field: "imagem4", filename: "imagem4.png" },
  { field: "imagem5", filename: "imagem5.png" },
] as const;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let payload: FinalizarPayload;
  const files: Array<FilePayload | null> = [];
  let videoFile: FilePayload | null = null;

  const t0 = Date.now();
  console.log(`[finalizar] id=${id} content-length=${request.headers.get("content-length")}`);

  try {
    const formData = await request.formData();
    const rawPayload = formData.get("payload");
    if (typeof rawPayload !== "string") {
      console.warn("[finalizar] payload ausente no FormData");
      return NextResponse.json({ message: "Payload ausente" }, { status: 400 });
    }
    payload = JSON.parse(rawPayload) as FinalizarPayload;

    for (const slot of PHOTO_SLOTS) {
      const entry = formData.get(slot.field);
      if (entry instanceof File && entry.size > 0) {
        const buf = await blobToBuffer(entry);
        console.log(`[finalizar] ${slot.field} → ${buf.byteLength} bytes`);
        files.push({ filename: slot.filename, data: buf });
      } else {
        console.log(`[finalizar] ${slot.field} → vazio`);
        files.push(null);
      }
    }

    const video = formData.get("video360");
    if (video instanceof File && video.size > 0) {
      const ext = video.name.includes(".") ? video.name.split(".").pop() : "mp4";
      const buf = await blobToBuffer(video);
      console.log(`[finalizar] video360 → ${buf.byteLength} bytes`);
      videoFile = { filename: `video360.${ext}`, data: buf };
    } else {
      console.log(`[finalizar] video360 → vazio`);
    }
    console.log(`[finalizar] FormData parsed in ${Date.now() - t0}ms`);
  } catch (err) {
    console.error("[finalizar] erro parsing FormData", err);
    return NextResponse.json(
      { message: "Payload inválido", error: String(err) },
      { status: 400 }
    );
  }

  try {
    const vistoria = await getVistoria(id);
    if (!vistoria) {
      return NextResponse.json({ message: "Vistoria não encontrada" }, { status: 404 });
    }

    const dropdownIds = payload.dropdowns
      ? await resolveDropdowns(payload.dropdowns)
      : {};

    const datavistoria = formatGlpiDateTime(payload.finalizadaEm);

    await updateVistoriaFields(id, {
      latitudefield: String(payload.latitude),
      longitudefield: String(payload.longitude),
      pspostefield: payload.pspostefield,
      alturadaantenafield: payload.alturadaantenafield,
      endereofield: payload.endereofield,
      observaofield: payload.observacoes,
      aterramentofield: payload.aterramentofield,
      intensidadedesinalfield: payload.intensidadedesinalfield,
      velocidadefield: payload.velocidadefield,
      motivofield: payload.motivofield,
      datadavistoriafield: datavistoria,
      plugin_fields_statusvistoriafielddropdowns_id: STATUS_VISTORIA_EM_ANALISE,
      plugin_fields_pendnciafielddropdowns_id: PENDENCIA_CPFL,
      dropdowns: dropdownIds,
    });

    const saved = await saveEquipmentFiles(vistoria.equipamento, [
      ...files,
      videoFile,
    ]);

    await upsertAuxiliaryProject({
      items_id: id,
      equipment_name: vistoria.equipamento,
      project_status: AUX_STATUS_PENDENTE,
      project_date: datavistoria,
      image1_path: buildEquipmentFilePath(vistoria.equipamento, "imagem1.png"),
      image2_path: buildEquipmentFilePath(vistoria.equipamento, "imagem2.png"),
      image3_path: buildEquipmentFilePath(vistoria.equipamento, "imagem3.png"),
    });

    return NextResponse.json({
      ok: true,
      vistoria_id: id,
      finalizadaEm: datavistoria,
      saved: saved.map((s) => ({ filename: s.filename, size: s.size })),
    });
  } catch (error) {
    console.error("[api/vistorias/:id/finalizar] error", error);
    return NextResponse.json(
      { message: "Falha ao finalizar vistoria", error: String(error) },
      { status: 500 }
    );
  }
}
