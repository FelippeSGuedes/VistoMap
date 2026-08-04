"use client";

import { create } from "zustand";
import type { Instalacao } from "@/types";
import { instalacoesService } from "@/services/instalacoes";

interface InstalacoesStore {
  items: Instalacao[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  fetchAll: () => Promise<void>;
  setSelected: (id: string | null) => void;
  /** Atualiza um item em memória sem recarregar tudo (ex.: depois de assumir). */
  patchItem: (id: string, patch: Partial<Instalacao>) => void;
  /** Remove um item da lista (ex.: depois de finalizar/rejeitar — saiu de circulação). */
  removeItem: (id: string) => void;
}

export const useInstalacoesStore = create<InstalacoesStore>((set) => ({
  items: [],
  loading: false,
  error: null,
  selectedId: null,
  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const items = await instalacoesService.fetchInstalacoes();
      set({ items, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Erro ao carregar",
      });
    }
  },
  setSelected: (selectedId) => set({ selectedId }),
  patchItem: (id, patch) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),
  removeItem: (id) =>
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
}));
