"use client";

import { create } from "zustand";
import { api } from "@/services/api";

export interface ExpedienteAtual {
  id: number;
  users_id: number;
  inicio_at: string;
  fim_at: string | null;
  pausa_almoco_inicio: string | null;
  pausa_almoco_fim: string | null;
  consentimento_lgpd_at: string | null;
  emPausa: boolean;
  emAndamento: boolean;
}

interface ExpedienteState {
  expediente: ExpedienteAtual | null;
  lgpdAceito: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  iniciar: (aceitarLGPD?: boolean) => Promise<{ ok: boolean; precisaLGPD?: boolean; message?: string }>;
  finalizar: () => Promise<{ ok: boolean }>;
  togglePausa: () => Promise<{ ok: boolean; emPausa?: boolean }>;
}

export const useExpedienteStore = create<ExpedienteState>((set) => ({
  expediente: null,
  lgpdAceito: false,
  loading: false,
  refresh: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get<{
        expediente: ExpedienteAtual | null;
        lgpdAceito: boolean;
      }>("/expediente/atual");
      set({ expediente: data.expediente, lgpdAceito: data.lgpdAceito });
    } catch {
      /* sem sessao ou off */
    } finally {
      set({ loading: false });
    }
  },
  iniciar: async (aceitarLGPD) => {
    try {
      const ua =
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null;
      const { data } = await api.post<{ ok: true; expediente: ExpedienteAtual }>(
        "/expediente/iniciar",
        { aceitarLGPD, dispositivoInfo: ua }
      );
      set({ expediente: data.expediente, lgpdAceito: true });
      return { ok: true };
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { precisaAceiteLGPD?: boolean; message?: string } };
      };
      if (e.response?.status === 409 && e.response.data?.precisaAceiteLGPD) {
        return { ok: false, precisaLGPD: true };
      }
      return { ok: false, message: e.response?.data?.message ?? "Falha ao iniciar" };
    }
  },
  finalizar: async () => {
    try {
      await api.post("/expediente/finalizar");
      set({ expediente: null });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },
  togglePausa: async () => {
    try {
      const { data } = await api.post<{ ok: true; emPausa: boolean }>(
        "/expediente/pausa"
      );
      // refresh pra trazer timestamps atualizados
      const { data: cur } = await api.get<{
        expediente: ExpedienteAtual | null;
        lgpdAceito: boolean;
      }>("/expediente/atual");
      set({ expediente: cur.expediente });
      return { ok: true, emPausa: data.emPausa };
    } catch {
      return { ok: false };
    }
  },
}));
