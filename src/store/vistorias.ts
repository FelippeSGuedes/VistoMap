"use client";

import { create } from "zustand";
import type { FilterState, Vistoria } from "@/types";
import { vistoriasService } from "@/services/vistorias";

const DEFAULT_FILTERS: FilterState = {
  query: "",
  status: [],
  prioridade: [],
  distanciaMaxKm: 100,
  ordenacao: "distancia",
  categorias: [],
};

interface VistoriasStore {
  items: Vistoria[];
  loading: boolean;
  error: string | null;
  filters: FilterState;
  selectedId: string | null;
  fetchAll: () => Promise<void>;
  setSelected: (id: string | null) => void;
  setFilters: (patch: Partial<FilterState>) => void;
  resetFilters: () => void;
}

export const useVistoriasStore = create<VistoriasStore>((set) => ({
  items: [],
  loading: false,
  error: null,
  filters: DEFAULT_FILTERS,
  selectedId: null,
  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const items = await vistoriasService.fetchVistorias();
      set({ items, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Erro ao carregar",
      });
    }
  },
  setSelected: (selectedId) => set({ selectedId }),
  setFilters: (patch) =>
    set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}));
