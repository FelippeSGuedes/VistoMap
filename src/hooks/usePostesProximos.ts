"use client";

import { useCallback, useState } from "react";
import { fetchPostesProximos } from "@/services/postes";
import type { Poste } from "@/types";

export interface UsePostesProximosState {
  items: Poste[];
  loading: boolean;
  error: string | null;
  origin: { lat: number; lng: number } | null;
  raio: number;
  fetched: boolean;
}

const INITIAL: UsePostesProximosState = {
  items: [],
  loading: false,
  error: null,
  origin: null,
  raio: 500,
  fetched: false,
};

/**
 * Hook leve para `/postes/proximos`. Mantém estado local — sem store global
 * porque só /vistorias e /vistorias/[id] consomem esse fluxo.
 */
export function usePostesProximos() {
  const [state, setState] = useState<UsePostesProximosState>(INITIAL);

  const fetch = useCallback(
    async (params: {
      lat: number;
      lng: number;
      raio?: number;
      limit?: number;
      municipio?: string;
    }) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetchPostesProximos(params);
        setState({
          items: res.items,
          loading: false,
          error: null,
          origin: res.origem,
          raio: res.raio_m,
          fetched: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao buscar postes";
        setState((s) => ({ ...s, loading: false, error: msg }));
      }
    },
    []
  );

  const reset = useCallback(() => setState(INITIAL), []);

  return { ...state, fetch, reset };
}
