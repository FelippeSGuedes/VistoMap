"use client";

import { useCallback, useState } from "react";
import { fetchPostesProximos } from "@/services/postes";
import { cachePut, cacheGet } from "@/lib/offlineDb";
import type { Poste, PostesProximosResponse } from "@/types";

export interface UsePostesProximosState {
  items: Poste[];
  loading: boolean;
  error: string | null;
  origin: { lat: number; lng: number } | null;
  raio: number;
  fetched: boolean;
  /** true quando os postes vieram do cache offline (sem rede) */
  fromCache: boolean;
}

const INITIAL: UsePostesProximosState = {
  items: [],
  loading: false,
  error: null,
  origin: null,
  raio: 500,
  fetched: false,
  fromCache: false,
};

/**
 * Grade de ~1,1 km: garante que posições próximas (dentro do raio de busca)
 * caiam na mesma chave de cache e reaproveitem o resultado.
 * Exportada pra quem quiser "esquentar" o cache antecipadamente (ver
 * useOfflinePosteCache) sem duplicar o formato da chave.
 */
export function buildCacheKey(lat: number, lng: number, raio: number): string {
  return `postes:${lat.toFixed(2)}:${lng.toFixed(2)}:${raio}`;
}

/**
 * Hook leve para `/postes/proximos`. Mantém estado local — sem store global
 * porque só /vistorias e /vistorias/[id] consomem esse fluxo.
 *
 * Offline-first: ao buscar com sucesso salva no IndexedDB (STORE_CACHE).
 * Se a rede falhar, tenta ler o cache da localização mais próxima.
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
      const raio = params.raio ?? 500;
      const key = buildCacheKey(params.lat, params.lng, raio);

      try {
        const res = await fetchPostesProximos(params);
        // Persiste para uso offline — silencioso em qualquer falha
        cachePut<PostesProximosResponse>(key, res).catch(() => {});
        setState({
          items: res.items,
          loading: false,
          error: null,
          origin: res.origem,
          raio: res.raio_m,
          fetched: true,
          fromCache: false,
        });
      } catch (err) {
        // Sem rede → tenta cache
        const cached = await cacheGet<PostesProximosResponse>(key);
        if (cached) {
          setState({
            items: cached.items,
            loading: false,
            error: null,
            origin: cached.origem,
            raio: cached.raio_m,
            fetched: true,
            fromCache: true,
          });
          return;
        }
        const msg =
          err instanceof Error ? err.message : "Erro ao buscar postes";
        setState((s) => ({ ...s, loading: false, error: msg, fetched: true }));
      }
    },
    []
  );

  const reset = useCallback(() => setState(INITIAL), []);

  return { ...state, fetch, reset };
}
