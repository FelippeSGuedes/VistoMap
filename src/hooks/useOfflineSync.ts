"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth";
import { drainQueue, resetRunning, type QueuedOperation } from "@/lib/offlineQueue";
import { loadPhoto, deletePhoto } from "@/lib/photos";
import { notifyQueueChanged } from "./useNetworkStatus";

/**
 * Sync engine — drena a fila offline quando online.
 *
 * Triggers:
 *  - window 'online' event
 *  - interval de 30s (cobre redes flaky onde 'online' event nao firou)
 *  - mount inicial
 *
 * Executor por tipo de operacao:
 *  - finalize-vistoria: monta FormData com payload + fotos do Filesystem,
 *    POST /api/vistorias/<id>/finalizar. On success, deleta fotos locais.
 */

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
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const form = new FormData();
  form.append("payload", p.payloadJson);

  for (let i = 0; i < p.photoPaths.length; i++) {
    const path = p.photoPaths[i];
    const field = p.photoFieldNames[i];
    const blob = await loadPhoto(path);
    if (!blob) {
      throw new Error(`Foto local ausente: ${path}`);
    }
    const filename = path.split("/").pop() ?? "foto.jpg";
    form.append(field, new File([blob], filename, { type: blob.type }));
  }

  if (p.videoPath && p.videoFieldName) {
    const blob = await loadPhoto(p.videoPath);
    if (blob) {
      const filename = p.videoPath.split("/").pop() ?? "video.mp4";
      form.append(
        p.videoFieldName,
        new File([blob], filename, { type: blob.type })
      );
    }
  }

  const resp = await fetch(`${base}/api/vistorias/${p.vistoriaId}/finalizar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.token}` },
    body: form,
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    // 401/403 sao especiais: token expirou. Falha definitiva ate reauth.
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`auth: ${resp.status} ${txt}`);
    }
    throw new Error(`http ${resp.status}: ${txt.slice(0, 120)}`);
  }

  // Cleanup fotos locais apos sucesso
  for (const path of p.photoPaths) {
    await deletePhoto(path).catch(() => {});
  }
  if (p.videoPath) {
    await deletePhoto(p.videoPath).catch(() => {});
  }
}

async function executor(op: QueuedOperation): Promise<void> {
  switch (op.type) {
    case "finalize-vistoria":
      return executeFinalize(op);
    case "upload-photo":
      // No escopo A as fotos vao junto com finalize, este tipo sobra pra futuro
      throw new Error("upload-photo nao implementado no escopo A");
    default:
      throw new Error(`tipo desconhecido: ${(op as { type: string }).type}`);
  }
}

export function useOfflineSync() {
  const { session } = useAuthStore();
  const tickRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!session?.token) return;
    if (typeof window === "undefined") return;

    // Reseta ops marcadas 'running' (e.g. app crashou no meio)
    void resetRunning();

    const drain = async () => {
      if (runningRef.current) return;
      if (!navigator.onLine) return;
      runningRef.current = true;
      try {
        const result = await drainQueue(executor);
        if (result.ok > 0 || result.failed > 0) {
          console.log("[useOfflineSync] drained", result);
          notifyQueueChanged();
        }
      } finally {
        runningRef.current = false;
      }
    };

    void drain();
    const onOnline = () => void drain();
    window.addEventListener("online", onOnline);
    tickRef.current = window.setInterval(drain, 30_000);

    return () => {
      window.removeEventListener("online", onOnline);
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [session?.token]);
}
