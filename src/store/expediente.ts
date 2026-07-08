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

export interface JanelaExpediente {
  dentro: boolean;
  motivo: "fds" | "antes" | "depois" | null;
  inicio: string;
  fim: string;
  fimDeSemana: boolean;
}

interface ExpedienteState {
  expediente: ExpedienteAtual | null;
  lgpdAceito: boolean;
  janela: JanelaExpediente | null;
  loading: boolean;
  /**
   * GET /expediente/atual — expediente automático: esta chamada já abre o
   * turno do dia se estiver dentro da janela e o LGPD tiver sido aceito.
   * Chamada no mount do app e a cada 60s (ver providers.tsx).
   */
  refresh: () => Promise<void>;
  /** Só usado para o aceite de consentimento LGPD (1x). */
  aceitarLGPD: () => Promise<{ ok: boolean; message?: string }>;
}

export const useExpedienteStore = create<ExpedienteState>((set) => ({
  expediente: null,
  lgpdAceito: false,
  janela: null,
  loading: false,
  refresh: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get<{
        expediente: ExpedienteAtual | null;
        lgpdAceito: boolean;
        janela: JanelaExpediente;
      }>("/expediente/atual");
      set({ expediente: data.expediente, lgpdAceito: data.lgpdAceito, janela: data.janela });
    } catch {
      /* sem sessao ou off */
    } finally {
      set({ loading: false });
    }
  },
  aceitarLGPD: async () => {
    try {
      const ua =
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null;
      const { data } = await api.post<{ ok: true; expediente: ExpedienteAtual }>(
        "/expediente/iniciar",
        { aceitarLGPD: true, dispositivoInfo: ua }
      );
      set({ expediente: data.expediente, lgpdAceito: true });
      return { ok: true };
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      return { ok: false, message: e.response?.data?.message ?? "Falha ao registrar aceite" };
    }
  },
}));
