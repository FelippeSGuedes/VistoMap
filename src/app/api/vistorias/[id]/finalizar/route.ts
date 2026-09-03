import { NextResponse } from "next/server";
import { getVistoria, updateVistoriaFields, marcarStatusGeralVistoriado } from "@/lib/glpi/equipments";
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
  SITUACAO_REVISITADO,
  SITUACAO_VISTORIADO,
  STATUS_VISTORIA_EM_ANALISE,
  type DropdownKey,
} from "@/lib/glpi/constants";
import { query } from "@/lib/db";
import { auditInsert } from "@/lib/glpi/audit";
import { sendPainelWebPush } from "@/lib/webpush";
import { getActorFromRequest } from "@/lib/auth-request";
import { logError } from "@/lib/observability";
import { rsrpValido, RSRP_MENSAGEM_ERRO } from "@/lib/rsrp";

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
  municipiofield?: string;
  alturadopostemfield?: string;
  materialfield?: string;
  endereofield?: string;
  aterramentofield?: string;
  instalartpfield?: string;
  danfield?: string;
  rsrpifield?: string;
  rsrpllfield?: string;
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

  // Sem gating de expediente aqui: finalizar apenas COMPLETA trabalho ja
  // autorizado no iniciar (que e gated). Gatear aqui quebraria o sync offline
  // quando a rede volta apos o expediente fechar (offline scope A).
  const actor = await getActorFromRequest(request).catch(() => null);
  if (!actor) {
    return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
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

    if (!rsrpValido(payload.rsrpifield) || !rsrpValido(payload.rsrpllfield)) {
      return NextResponse.json({ message: RSRP_MENSAGEM_ERRO }, { status: 400 });
    }

    // Espelha a validação do cliente (VistoriaExecucaoForm) — defesa em
    // profundidade, não confia só no formulário pra garantir preenchimento.
    const camposObrigatorios: Array<[string, string | undefined]> = [
      ["Aterramento", payload.aterramentofield],
      ["Altura do poste", payload.alturadopostemfield],
      ["Tipo de material", payload.materialfield],
      ["Resistência (daN)", payload.danfield],
      ["Instalação de TP", payload.instalartpfield],
      ["Endereço", payload.endereofield],
      ["Tipo (Claro)", payload.dropdowns?.tipoifield],
      ["RSRP (Claro)", payload.rsrpifield],
      ["Tipo (Vivo)", payload.dropdowns?.tipollfield],
      ["RSRP (Vivo)", payload.rsrpllfield],
      ["Observações", payload.observacoes],
    ];
    if (payload.instalartpfield === "1") {
      camposObrigatorios.push(["Tensão", payload.dropdowns?.tensovfield]);
    }
    const faltando = camposObrigatorios
      .filter(([, v]) => !v || !v.trim())
      .map(([label]) => label);
    if (faltando.length > 0) {
      return NextResponse.json(
        { message: `Preencha os campos obrigatórios: ${faltando.join(", ")}.` },
        { status: 400 }
      );
    }

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
      // Whitelist de extensão — nunca confia no nome de arquivo do cliente
      // sem checar contra os formatos reais que MediaRecorder/câmera nativa
      // produzem (webm/mp4 no gravador embutido; mov/3gp/m4v em fallback de
      // câmera nativa iOS/Android). Extensão fora da lista (ex.: .svg/.html
      // disfarçado de vídeo) cai no default "mp4" em vez de ser respeitada.
      const ALLOWED_VIDEO_EXT = new Set(["mp4", "webm", "mov", "3gp", "m4v"]);
      const rawExt = video.name.includes(".") ? video.name.split(".").pop() ?? "" : "";
      const ext = ALLOWED_VIDEO_EXT.has(rawExt.toLowerCase()) ? rawExt.toLowerCase() : "mp4";
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
    // Só reforça posse pra ator-técnico — token de painel (admin/moderador/
    // leitura) não passa por essa rota na prática, mas por segurança não
    // aplica a checagem a um papel que não seja o esperado aqui.
    if (actor.role === "tecnico" && String(actor.id) !== vistoria.tecnico.id) {
      return NextResponse.json({ message: "Você não tem acesso a esta vistoria" }, { status: 403 });
    }

    const dropdownIds = payload.dropdowns
      ? await resolveDropdowns(payload.dropdowns)
      : {};

    const datavistoria = formatGlpiDateTime(payload.finalizadaEm);

    // Detecta se já era revisita (is_repeat=1 na aux) p/ decidir situação.
    const [auxRow] = await query<{ is_repeat: number }>(
      `SELECT COALESCE(is_repeat,0) AS is_repeat
         FROM glpi_plugin_vistomap_projects
        WHERE items_id = ? AND itemtype = 'NetworkEquipment'
        LIMIT 1`,
      [id]
    );
    const eraRevisita = Number(auxRow?.is_repeat ?? 0) === 1;
    // Técnico terminou: Revisitado (6) se era revisita, Vistoriado (3) caso contrário.
    const situacaoFinal = eraRevisita ? SITUACAO_REVISITADO : SITUACAO_VISTORIADO;

    await updateVistoriaFields(id, {
      latitudefield: String(payload.latitude),
      longitudefield: String(payload.longitude),
      pspostefield: payload.pspostefield,
      municipiofield: payload.municipiofield,
      alturadopostemfield: payload.alturadopostemfield,
      materialfield: payload.materialfield,
      endereofield: payload.endereofield,
      observaofield: payload.observacoes,
      aterramentofield: payload.aterramentofield,
      instalartpfield: payload.instalartpfield,
      danfield: payload.danfield,
      rsrpifield: payload.rsrpifield,
      rsrpllfield: payload.rsrpllfield,
      motivofield: payload.motivofield,
      datadavistoriafield: datavistoria,
      dataenvioconcessionriafield: datavistoria,
      plugin_fields_statusvistoriafielddropdowns_id: STATUS_VISTORIA_EM_ANALISE,
      plugin_fields_pendnciafielddropdowns_id: PENDENCIA_CPFL,
      plugin_fields_situaodavistoriafielddropdowns_id: situacaoFinal,
      dropdowns: dropdownIds,
    });

    // Status geral nativo do poste (glpi_networkequipments.states_id) — só
    // avançava pra Instalação; nunca marcava Vistoriado ao técnico finalizar.
    await marcarStatusGeralVistoriado(id);

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

    // Audit timestamp "finalizada" — par com "vistoria-iniciada" pra calc tempo
    if (actor) {
      void auditInsert({
        ator: actor,
        acao: "vistoria-finalizada",
        alvo: { tipo: "vistoria", id: String(id), label: vistoria.equipamento ?? `NE-${id}` },
        descricao: `Vistoria finalizada em campo`,
      });
      void sendPainelWebPush({ acao: "vistoria-finalizada", equipamento: vistoria.equipamento ?? `NE-${id}`, tecnico: actor.nome, vistoriaId: id });
    }

    return NextResponse.json({
      ok: true,
      vistoria_id: id,
      finalizadaEm: datavistoria,
      saved: saved.map((s) => ({ filename: s.filename, size: s.size })),
    });
  } catch (error) {
    console.error("[api/vistorias/:id/finalizar] error", error);
    void logError("app", "vistorias/:id/finalizar", error, { id });
    return NextResponse.json(
      { message: "Falha ao finalizar vistoria", error: String(error) },
      { status: 500 }
    );
  }
}
