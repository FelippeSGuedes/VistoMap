"use client";

import { create } from "zustand";

export interface DevolucaoPendente {
  id: number;
  vistoriaId: number;
  itens: string[];
  motivos: string[];
  motivoOutro: string | null;
  precisaDeslocamento: boolean;
  criadoEm: string;
}

export interface DevolucaoVistoria {
  id: string;
  equipamento: string;
  latitude: number | null;
  longitude: number | null;
  cidade: string;
}

interface DevolucaoState {
  devolucao: DevolucaoPendente | null;
  vistoria: DevolucaoVistoria | null;
  modalAberto: boolean;
  setDevolucao: (d: DevolucaoPendente | null, v: DevolucaoVistoria | null) => void;
  abrirModal: () => void;
  fecharModal: () => void;
}

export const useDevolucaoStore = create<DevolucaoState>((set) => ({
  devolucao: null,
  vistoria: null,
  modalAberto: false,
  setDevolucao: (devolucao, vistoria) => set({ devolucao, vistoria }),
  abrirModal: () => set({ modalAberto: true }),
  fecharModal: () => set({ modalAberto: false }),
}));

/** true se a devolução foi criada num dia de calendário ANTERIOR a hoje (bloqueio). */
export function devolucaoEhDeOutroDia(criadoEm: string): boolean {
  const d = new Date(criadoEm.includes("T") ? criadoEm : criadoEm.replace(" ", "T") + "Z");
  const hoje = new Date();
  return (
    d.getFullYear() !== hoje.getFullYear() ||
    d.getMonth() !== hoje.getMonth() ||
    d.getDate() !== hoje.getDate()
  );
}
