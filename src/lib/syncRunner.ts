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

import { drainQueue, type QueuedOperation } from "@/lib/offlineQueue";
import { loadPhoto, deletePhoto } from "@/lib/photos";
import { API_BASE } from "@/services/api";

const UPLOAD_TIMEOUT_MS = 45_000;

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

async function executeFinalize(op: QueuedOperation): Promise<void> {
  const p = op.payload as unknown as FinalizePayloadOp;
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

  if (p.videoPath && p.videoFieldName) {
    const blob = await loadPhoto(p.videoPath);
    if (blob) {
      const filename = p.videoPath.split("/").pop() ?? "video.mp4";
      form.append(p.videoFieldName, new File([blob], filename, { type: blob.type }));
    }
  }

  const resp = await fetchWithTimeout(
    `${API_BASE}/vistorias/${p.vistoriaId}/finalizar`,
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

  for (const path of p.photoPaths) await deletePhoto(path).catch(() => {});
  if (p.videoPath) await deletePhoto(p.videoPath).catch(() => {});
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
