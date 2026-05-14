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

export async function finalizarVistoria(
  payload: VistoriaPayload,
  captures: CaptureBundle = {}
): Promise<{ ok: true }> {
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

  return tryReal(
    api
      .post(`/vistorias/${payload.vistoria_id}/finalizar`, fd, {
        timeout: 180_000,
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then(() => ({ ok: true }) as const),
    { ok: true } as const
  );
}

export const vistoriasService = {
  fetchDashboardStats,
  fetchVistorias,
  fetchVistoria,
  iniciarVistoria,
  finalizarVistoria,
};
