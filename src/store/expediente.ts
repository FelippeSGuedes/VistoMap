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
      // Endpoint dedicado — só registra o consentimento, sem tentar abrir
      // turno (que é bloqueado fora da janela de horário). Aceitar o termo
      // precisa funcionar a qualquer hora.
      await api.post("/expediente/lgpd", { dispositivoInfo: ua });
      set({ lgpdAceito: true });
      // Se já estiver dentro da janela agora, isso já abre o turno na hora;
      // fora da janela, fica só o consentimento registrado (correto).
      const { data } = await api.get<{
        expediente: ExpedienteAtual | null;
        lgpdAceito: boolean;
        janela: JanelaExpediente;
      }>("/expediente/atual");
      set({ expediente: data.expediente, janela: data.janela });
      return { ok: true };
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      return { ok: false, message: e.response?.data?.message ?? "Falha ao registrar aceite" };
    }
  },
}));
