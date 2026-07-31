import { NextResponse } from "next/server";
import { getVistoria, updateVistoriaFields, type UpdateFieldsInput } from "@/lib/glpi/equipments";
import { resolveDropdowns } from "@/lib/glpi/dropdowns";
import { saveEquipmentFiles, type FilePayload } from "@/lib/glpi/uploads";
import { upsertAuxiliaryProject } from "@/lib/glpi/auxiliary";
import {
  AUX_STATUS_PENDENTE,
  SITUACAO_REVISITADO,
  SITUACAO_VISTORIADO,
  SITUACAO_COLUMN,
  STATUS_VISTORIA_EM_ANALISE,
  type DropdownKey,
} from "@/lib/glpi/constants";
import { query, execute } from "@/lib/db";
import { auditInsert } from "@/lib/glpi/audit";
import { sendPainelWebPush } from "@/lib/webpush";
import { getActorFromRequest } from "@/lib/auth-request";
import { logError } from "@/lib/observability";
import { fetchDevolucaoPendentePorVistoria, resolverDevolucao } from "@/lib/glpi/devolucoes";
import { DEVOLUCAO_DROPDOWN_FIELD } from "@/lib/glpi/devolucaoItens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatGlpiDateTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
  );
}

async function blobToBuffer(file: File): Promise<Buffer> {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
}

/** item de devolução → nome do arquivo salvo (mesma convenção do finalizar). */
const PHOTO_FILENAME: Record<string, string> = {
  imagem1: "imagem1.png",
  imagem2: "imagem2.png",
  imagem3: "imagem3.png",
  video360: "video360.mp4",
  imagem4: "imagem4.png",
  imagem5: "imagem5.png",
};

/** campo de devolução → coluna direta em UpdateFieldsInput (quando != nome do item). */
const DIRECT_FIELD_MAP: Record<string, keyof UpdateFieldsInput> = {
  pspostefield: "pspostefield",
  municipiofield: "municipiofield",
  endereofield: "endereofield",
  tipodematerial: "materialfield",
  alturadopostemfield: "alturadopostemfield",
  aterramentofield: "aterramentofield",
  danfield: "danfield",
  instalartpfield: "instalartpfield",
  rsrpifield: "rsrpifield",
  rsrpllfield: "rsrpllfield",
  observacao: "observaofield",
};

/** campo de devolução → DropdownKey (resolve texto → id via resolveDropdowns). */
const DROPDOWN_FIELD_MAP = DEVOLUCAO_DROPDOWN_FIELD as Record<string, DropdownKey>;

interface CorrigirPayload {
  campos?: Record<string, string>;
}

/**
 * POST /api/vistorias/[id]/corrigir-devolucao  (técnico)
 *
 * Reenvia SÓ os itens que a devolução apontou como errados — fotos/vídeo
 * (multipart, mesmos nomes de campo do finalizar) e/ou campos do
 * formulário (JSON em `payload`). Tudo que não foi apontado permanece
 * exatamente como enviado antes (updateVistoriaFields/saveEquipmentFiles
 * só tocam no que é passado).
 *
 * Ao concluir: situação volta pra Vistoriado/Revisitado (conforme era
 * antes da devolução), datas de envio são renovadas, PDF é marcado pra
 * regerar, e a devolução vira RESOLVIDA.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) return NextResponse.json({ message: "ID inválido" }, { status: 400 });

  const actor = await getActorFromRequest(request).catch(() => null);
  if (!actor) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  try {
    const vistoria = await getVistoria(id);
    if (!vistoria) return NextResponse.json({ message: "Vistoria não encontrada" }, { status: 404 });

    const devolucao = await fetchDevolucaoPendentePorVistoria(id);
    if (!devolucao) {
      return NextResponse.json(
        { message: "Não há devolução pendente para essa vistoria" },
        { status: 409 }
      );
    }

    const formData = await request.formData();
    const rawPayload = formData.get("payload");
    let campos: Record<string, string> = {};
    if (typeof rawPayload === "string") {
      try {
        campos = (JSON.parse(rawPayload) as CorrigirPayload).campos ?? {};
      } catch {
        return NextResponse.json({ message: "Payload inválido" }, { status: 400 });
      }
    }

    // Só processa os campos que a devolução realmente apontou.
    const camposApontados = new Set(devolucao.itens);

    const updateInput: UpdateFieldsInput = {};
    const dropdownsInput: Partial<Record<DropdownKey, string | null>> = {};
    for (const item of camposApontados) {
      if (!(item in campos)) continue;
      const valor = campos[item];
      if (DIRECT_FIELD_MAP[item]) {
        (updateInput as Record<string, unknown>)[DIRECT_FIELD_MAP[item]] = valor;
      } else if (DROPDOWN_FIELD_MAP[item]) {
        dropdownsInput[DROPDOWN_FIELD_MAP[item]] = valor;
      }
    }

    // Detecta se era revisita (pra voltar pro estado certo) e limpa a
    // situação de devolução → Vistoriado/Revisitado.
    const [auxRow] = await query<{ is_repeat: number }>(
      `SELECT COALESCE(is_repeat,0) AS is_repeat
         FROM glpi_plugin_vistomap_projects
        WHERE items_id = ? AND itemtype = 'NetworkEquipment'
        LIMIT 1`,
      [id]
    );
    const eraRevisita = Number(auxRow?.is_repeat ?? 0) === 1;
    const situacaoFinal = eraRevisita ? SITUACAO_REVISITADO : SITUACAO_VISTORIADO;
    const agora = formatGlpiDateTime();

    const dropdownIds =
      Object.keys(dropdownsInput).length > 0 ? await resolveDropdowns(dropdownsInput) : {};

    if (Object.keys(updateInput).length > 0 || Object.keys(dropdownIds).length > 0) {
      await updateVistoriaFields(id, { ...updateInput, dropdowns: dropdownIds });
    }
    // Situação + status + datas sempre voltam, mesmo se a devolução era só
    // de fotos (nenhum campo de formulário no updateInput acima). O status
    // (plugin_fields_statusvistoriafielddropdowns_id) também precisa voltar
    // pra "Em análise" aqui — devolverVistoria() deixa ele em Pendente(1)
    // pra vistoria sair do bloqueio de fila do técnico, e sem resetar de
    // volta aqui a vistoria corrigida ficava mostrando "Pendente" pro
    // analista mesmo já reenviada, igual uma vistoria nunca feita.
    await execute(
      `UPDATE glpi_plugin_fields_networkequipmentdispositivosderedes
          SET \`${SITUACAO_COLUMN}\` = ?,
              plugin_fields_statusvistoriafielddropdowns_id = ?,
              datadavistoriafield = ?,
              dataenvioconcessionriafield = ?
        WHERE items_id = ?`,
      [situacaoFinal, STATUS_VISTORIA_EM_ANALISE, agora, agora, id]
    );

    // Fotos/vídeo apontados — só salva o que veio no FormData.
    const files: Array<FilePayload | null> = [];
    for (const [item, filename] of Object.entries(PHOTO_FILENAME)) {
      if (!camposApontados.has(item)) continue;
      const entry = formData.get(item);
      if (entry instanceof File && entry.size > 0) {
        const buf = await blobToBuffer(entry);
        files.push({ filename, data: buf });
      }
    }
    if (files.length > 0) {
      await saveEquipmentFiles(vistoria.equipamento, files);
    }

    // Marca pra regerar o PDF com os dados corrigidos.
    await upsertAuxiliaryProject({
      items_id: id,
      equipment_name: vistoria.equipamento,
      project_status: AUX_STATUS_PENDENTE,
    });

    await resolverDevolucao(devolucao.id);

    void auditInsert({
      ator: actor,
      acao: "devolucao-resolvida",
      alvo: { tipo: "vistoria", id: String(id), label: vistoria.equipamento },
      descricao: `Devolução corrigida e reenviada — ${devolucao.itens.length} item(ns).`,
    });
    void sendPainelWebPush({ acao: "devolucao-resolvida", equipamento: vistoria.equipamento, tecnico: actor.nome, vistoriaId: id });

    return NextResponse.json({ ok: true, vistoria_id: id, situacao: situacaoFinal });
  } catch (error) {
    console.error("[api/vistorias/:id/corrigir-devolucao] error", error);
    void logError("app", "vistorias/:id/corrigir-devolucao", error, { id });
    return NextResponse.json(
      { message: "Falha ao corrigir devolução", error: String(error) },
      { status: 500 }
    );
  }
}
