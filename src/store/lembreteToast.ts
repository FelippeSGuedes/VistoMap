"use client";

import { create } from "zustand";

/**
 * Toast global, leve e auto-fechável — usado pelo lembrete de devolução
 * (push recebido com o app já aberto, ver usePushRegistration.ts) pra
 * não depender só da notificação do sistema. Sem fila: uma mensagem nova
 * substitui a anterior.
 */
interface LembreteToastState {
  mensagem: string | null;
  mostrar: (mensagem: string) => void;
  limpar: () => void;
}

export const useLembreteToastStore = create<LembreteToastState>((set) => ({
  mensagem: null,
  mostrar: (mensagem) => set({ mensagem }),
  limpar: () => set({ mensagem: null }),
}));
