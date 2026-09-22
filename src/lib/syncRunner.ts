"use client";

/**
 * Runner de sincronização da fila offline (compartilhado).
 *
 * Executores de cada operação + `runDrain()` chamável de qualquer lugar
 * (hook de sync E o service de finalizar, pra disparar envio imediato).
 *
 * TODO upload tem TIMEOUT (AbortController): rede oscilando NÃO trava mais —
 * aborta e tenta de novo no próximo ciclo, em vez de "enviar por horas".
 */

import { drainQueue, enqueue, type QueuedOperation } from "@/lib/offlineQueue";
import { loadPhoto, deletePhoto } from "@/lib/photos";
import { API_BASE } from "@/services/api";
import { useLembreteToastStore } from "@/store/lembreteToast";

// Mesmo critério de "erro de rede" do drainQueue (offlineQueue.ts) — usado
// aqui pra decidir se vale tentar o fallback sem vídeo (só faz sentido
// quando o problema foi a rede/timeout; um erro de validação ou auth vai
// falhar igual sem o vídeo, então nem tenta).
const REDE_RX = /network|fetch|offline|timeout|abort|conn/i;

// Achado 2026-09-22 (Marco/JUN-G-R-001): poste tipo Repetidor, exatamente o
// tipo de local que existe por ter sinal ruim na região (ver tipoEquipamento
// em painel.ts) — 45s não bastava pra concluir o upload do finalizar (fotos
// + vídeo 360, ~2-6MB) na janela de sinal fraco que o técnico encontrava ao
// se afastar do local. Resultado: "vistoria-iniciada" chegava (payload
// pequeno, cabe em qualquer brecha de sinal) mas "vistoria-finalizada" nunca
// — o técnico via "sincronizando" sem fim até estourar tentativas. 120s dá
// bem mais margem pra sinal ruim/instável sem trocar o mecanismo em si (o
// AbortController + retry da fila continuam os mesmos).
const UPLOAD_TIMEOUT_MS = 120_000;

// Mesma resolucao de base do services/postes.ts — backend Fastify separado
// (nao e' o /app/api do Next), so' replicada aqui pq o sync roda em
// background, fora do axios instance daquele service.
const POSTES_API_BASE =
  process.env.NEXT_PUBLIC_POSTES_URL || process.env.NEXT_PUBLIC_API_URL || "";

async function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  ms: number
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (err) {
    // Normaliza abort → mensagem com "timeout" pra drainQueue tratar como rede
    // (para o drain, reagenda; não marca como falha definitiva).
    if ((err as Error)?.name === "AbortError") {
      throw new Error("timeout: upload abortado por lentidão da rede");
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

interface FinalizePayloadOp {
  vistoriaId: string | number;
  payloadJson: string;
  photoPaths: string[];
  photoFieldNames: string[];
  videoPath?: string;
  videoFieldName?: string;
  token: string;
}

async function postFinalize(
  p: FinalizePayloadOp,
  timeoutMs: number,
  incluirVideo: boolean
): Promise<void> {
  const form = new FormData();
  form.append("payload", p.payloadJson);

  for (let i = 0; i < p.photoPaths.length; i++) {
    const path = p.photoPaths[i];
    const field = p.photoFieldNames[i];
    const blob = await loadPhoto(path);
    if (!blob) throw new Error(`Foto local ausente: ${path}`);
    const filename = path.split("/").pop() ?? "foto.jpg";
    form.append(field, new File([blob], filename, { type: blob.type }));
  }

  if (incluirVideo && p.videoPath && p.videoFieldName) {
    const blob = await loadPhoto(p.videoPath);
    if (blob) {
      const filename = p.videoPath.split("/").pop() ?? "video.mp4";
      form.append(p.videoFieldName, new File([blob], filename, { type: blob.type }));
    }
  }

  const resp = await fetchWithTimeout(
    `${API_BASE}/vistorias/${p.vistoriaId}/finalizar`,
    { method: "POST", headers: { Authorization: `Bearer ${p.token}` }, body: form },
    timeoutMs
  );

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`auth: ${resp.status} ${txt}`);
    }
    throw new Error(`http ${resp.status}: ${txt.slice(0, 120)}`);
  }
}

// Achado 2026-09-22 (Marco/JUN-G-R-001): o vídeo é de longe a parte mais
// pesada do finalizar e a mais sujeita a travar em sinal fraco — mesmo com
// timeout maior e foto bem mais leve (ver commits do mesmo dia), um vídeo
// que caiu no fallback "câmera do sistema" (sem corte/compressão) ainda
// pode estourar. Em vez de deixar a VISTORIA INTEIRA presa esperando só o
// vídeo, se a tentativa completa falhar por rede/timeout, tenta de novo
// SEM o vídeo (payload pequeno, deve passar mesmo em sinal ruim) — o
// formulário e as fotos não podem ficar reféns do vídeo. Vídeo dropado
// vira uma operação separada de menor prioridade (upload-video-followup),
// tentada sozinha nos próximos ciclos, sem bloquear mais nada.
async function executeFinalize(op: QueuedOperation): Promise<void> {
  const p = op.payload as unknown as FinalizePayloadOp;
  const temVideo = Boolean(p.videoPath && p.videoFieldName);
  let videoEnviadoAgora = temVideo;

  try {
    await postFinalize(p, UPLOAD_TIMEOUT_MS, true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!temVideo || !REDE_RX.test(msg)) throw err;

    // Payload completo não passou por rede/timeout — tenta só o essencial
    // (formulário + fotos, sem vídeo). Erro daqui sobe normal: a fila
    // continua tentando o pacote completo no próximo ciclo.
    await postFinalize(p, 45_000, false);
    videoEnviadoAgora = false;

    await enqueue({
      type: "upload-video-followup",
      vistoriaId: p.vistoriaId,
      payload: {
        vistoriaId: p.vistoriaId,
        videoPath: p.videoPath,
        videoFieldName: p.videoFieldName,
        token: p.token,
      } as Record<string, unknown>,
    });
    useLembreteToastStore
      .getState()
      .mostrar("Vistoria enviada sem vídeo — o vídeo será enviado quando o sinal melhorar.");
  }

  for (const path of p.photoPaths) await deletePhoto(path).catch(() => {});
  // Vídeo só é apagado localmente quando ele de fato subiu agora — se caiu
  // no fallback acima, upload-video-followup é quem apaga depois de enviar.
  if (p.videoPath && videoEnviadoAgora) {
    await deletePhoto(p.videoPath).catch(() => {});
  }
}

interface UploadVideoFollowupPayloadOp {
  vistoriaId: string | number;
  videoPath: string;
  videoFieldName: string;
  token: string;
}

async function executeUploadVideoFollowup(op: QueuedOperation): Promise<void> {
  const p = op.payload as unknown as UploadVideoFollowupPayloadOp;
  const blob = await loadPhoto(p.videoPath);
  if (!blob) throw new Error(`Vídeo local ausente: ${p.videoPath}`);

  const form = new FormData();
  const filename = p.videoPath.split("/").pop() ?? "video.mp4";
  form.append(p.videoFieldName, new File([blob], filename, { type: blob.type }));

  const resp = await fetchWithTimeout(
    `${API_BASE}/vistorias/${p.vistoriaId}/video`,
    { method: "POST", headers: { Authorization: `Bearer ${p.token}` }, body: form },
    UPLOAD_TIMEOUT_MS
  );

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`auth: ${resp.status} ${txt}`);
    }
    throw new Error(`http ${resp.status}: ${txt.slice(0, 120)}`);
  }

  await deletePhoto(p.videoPath).catch(() => {});
}

interface IniciarPayloadOp {
  vistoriaId: string | number;
  latitude: number | null;
  longitude: number | null;
  forcar: boolean;
  justificativa: string;
  token: string;
}

async function executeIniciar(op: QueuedOperation): Promise<void> {
  const p = op.payload as unknown as IniciarPayloadOp;
  const resp = await fetchWithTimeout(
    `${API_BASE}/vistorias/${p.vistoriaId}/iniciar`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.token}` },
      body: JSON.stringify({
        latitude: p.latitude,
        longitude: p.longitude,
        forcar: p.forcar,
        justificativa: p.justificativa,
        offline: true,
      }),
    },
    20_000
  );
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`auth: ${resp.status} ${txt}`);
    }
    throw new Error(`http ${resp.status}: ${txt.slice(0, 120)}`);
  }
}

interface MudarPostePayloadOp {
  vistoria_id: string;
  lat_antiga: number;
  lng_antiga: number;
  psposte_antigo: string | null;
  municipio_antigo: string | null;
  poste_id_antigo: number | null;
  poste_id_novo: number;
  motivo: string;
  observacao: string | null;
  token: string;
}

async function executeMudarPoste(op: QueuedOperation): Promise<void> {
  const p = op.payload as unknown as MudarPostePayloadOp;
  const { token, ...body } = p;
  const resp = await fetchWithTimeout(
    `${POSTES_API_BASE}/postes/mudancas`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    },
    20_000
  );
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`auth: ${resp.status} ${txt}`);
    }
    throw new Error(`http ${resp.status}: ${txt.slice(0, 120)}`);
  }
}

async function executor(op: QueuedOperation): Promise<void> {
  switch (op.type) {
    case "finalize-vistoria":
      return executeFinalize(op);
    case "iniciar-vistoria":
      return executeIniciar(op);
    case "mudar-poste":
      return executeMudarPoste(op);
    case "upload-video-followup":
      return executeUploadVideoFollowup(op);
    case "upload-photo":
      throw new Error("upload-photo nao implementado no escopo A");
    default:
      throw new Error(`tipo desconhecido: ${(op as { type: string }).type}`);
  }
}

let running = false;

/** Drena a fila uma vez (no-op se offline ou já rodando). */
export async function runDrain(): Promise<{ ok: number; failed: number; remaining: number } | null> {
  if (running) return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  running = true;
  try {
    return await drainQueue(executor);
  } finally {
    running = false;
  }
}
