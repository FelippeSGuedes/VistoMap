import { api } from "./api";
import type {
  CaptureBundle,
  DashboardStats,
  Vistoria,
  VistoriaPayload,
} from "@/types";
import { MOCK_STATS, MOCK_VISTORIAS } from "@/utils/mock";

const ALLOW_FALLBACK = process.env.NODE_ENV !== "production";

async function tryReal<T>(promise: Promise<T>, fb: T): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (!ALLOW_FALLBACK) throw err;
    console.warn("[vistoriasService] usando fallback mock:", err);
    return fb;
  }
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return MOCK_STATS;
}

export async function fetchVistorias(): Promise<Vistoria[]> {
  return tryReal(
    api.get<Vistoria[]>("/vistorias").then((r) => r.data),
    MOCK_VISTORIAS
  );
}

export async function fetchVistoria(id: string): Promise<Vistoria | undefined> {
  return tryReal(
    api.get<Vistoria>(`/vistorias/${id}`).then((r) => r.data),
    MOCK_VISTORIAS.find((v) => v.id === id)
  );
}

export async function iniciarVistoria(id: string): Promise<{ ok: true }> {
  return tryReal(
    api.post(`/vistorias/${id}/iniciar`).then(() => ({ ok: true }) as const),
    { ok: true } as const
  );
}

export async function navegarVistoria(id: string): Promise<void> {
  await api.patch(`/vistorias/${id}/situacao`, { situacao_id: 7 }).catch(() => {});
}

export async function finalizarVistoria(
  payload: VistoriaPayload,
  captures: CaptureBundle = {}
): Promise<{ ok: true; queued?: boolean }> {
  const fd = new FormData();
  fd.append("payload", JSON.stringify(payload));
  const slots: Array<{ key: keyof CaptureBundle; filename: string }> = [
    { key: "imagem1", filename: "imagem1.png" },
    { key: "imagem2", filename: "imagem2.png" },
    { key: "imagem3", filename: "imagem3.png" },
    { key: "imagem4", filename: "imagem4.png" },
    { key: "imagem5", filename: "imagem5.png" },
  ];
  for (const s of slots) {
    const blob = captures[s.key];
    if (blob) fd.append(s.key, blob, s.filename);
  }
  if (captures.video360) fd.append("video360", captures.video360, "video360.mp4");

  // Detecta offline ANTES de tentar — evita timeout em conexao instavel.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return await queueFinalizar(payload, captures, slots);
  }

  try {
    await api.post(`/vistorias/${payload.vistoria_id}/finalizar`, fd, {
      timeout: 180_000,
      headers: { "Content-Type": "multipart/form-data" },
    });
    return { ok: true } as const;
  } catch (err) {
    // Falha de rede em conexao flaky → cai pra queue ao inves de perder dados
    const e = err as { code?: string; message?: string };
    const isNetwork =
      e.code === "ERR_NETWORK" ||
      e.code === "ECONNABORTED" ||
      /network|timeout|offline/i.test(e.message ?? "");
    if (isNetwork) {
      return await queueFinalizar(payload, captures, slots);
    }
    throw err;
  }
}

/**
 * Salva fotos no Capacitor Filesystem + enfileira finalize-vistoria.
 * Chamado quando offline OU quando a chamada direta falha por rede.
 */
async function queueFinalizar(
  payload: VistoriaPayload,
  captures: CaptureBundle,
  slots: Array<{ key: keyof CaptureBundle; filename: string }>
): Promise<{ ok: true; queued: true }> {
  // Lazy import pra evitar bundle pesado em paths que nao caem aqui
  const { savePhoto } = await import("@/lib/photos");
  const { enqueue } = await import("@/lib/offlineQueue");
  const { getAuthToken } = await import("./api");
  const { notifyQueueChanged } = await import("@/hooks/useNetworkStatus");

  const vistoriaId = payload.vistoria_id;
  const photoPaths: string[] = [];
  const photoFieldNames: string[] = [];
  for (const s of slots) {
    const blob = captures[s.key];
    if (blob) {
      const saved = await savePhoto(blob, vistoriaId);
      photoPaths.push(saved.path);
      photoFieldNames.push(s.key);
    }
  }
  let videoPath: string | undefined;
  let videoFieldName: string | undefined;
  if (captures.video360) {
    const saved = await savePhoto(captures.video360, vistoriaId);
    videoPath = saved.path;
    videoFieldName = "video360";
  }

  const token = getAuthToken() ?? "";
  await enqueue({
    type: "finalize-vistoria",
    vistoriaId,
    payload: {
      vistoriaId,
      payloadJson: JSON.stringify(payload),
      photoPaths,
      photoFieldNames,
      videoPath,
      videoFieldName,
      token,
    } as Record<string, unknown>,
  });
  notifyQueueChanged();
  return { ok: true, queued: true } as const;
}

export const vistoriasService = {
  fetchDashboardStats,
  fetchVistorias,
  fetchVistoria,
  iniciarVistoria,
  finalizarVistoria,
};
