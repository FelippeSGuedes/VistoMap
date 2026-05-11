import { api } from "./api";
import type { DashboardStats, Vistoria, VistoriaPayload } from "@/types";
import { MOCK_STATS, MOCK_VISTORIAS } from "@/utils/mock";

const FALLBACK_DELAY = 350;

function withFallback<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch(
    () =>
      new Promise<T>((resolve) => {
        setTimeout(() => resolve(fallback), FALLBACK_DELAY);
      })
  );
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return withFallback(
    api.get<DashboardStats>("/dashboard/stats").then((r) => r.data),
    MOCK_STATS
  );
}

export async function fetchVistorias(): Promise<Vistoria[]> {
  return withFallback(
    api.get<Vistoria[]>("/vistorias").then((r) => r.data),
    MOCK_VISTORIAS
  );
}

export async function fetchVistoria(id: string): Promise<Vistoria | undefined> {
  return withFallback(
    api.get<Vistoria>(`/vistorias/${id}`).then((r) => r.data),
    MOCK_VISTORIAS.find((v) => v.id === id)
  );
}

export async function finalizarVistoria(payload: VistoriaPayload): Promise<{ ok: true }> {
  return withFallback(
    api.post(`/vistorias/${payload.vistoria_id}/finalizar`, payload).then(() => ({ ok: true }) as const),
    { ok: true } as const
  );
}

export const vistoriasService = {
  fetchDashboardStats,
  fetchVistorias,
  fetchVistoria,
  finalizarVistoria,
};
