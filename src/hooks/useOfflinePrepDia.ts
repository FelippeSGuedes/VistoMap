"use client";

/**
 * useOfflinePrepDia — pré-carrega o cache offline de TODOS os repetidores
 * atribuídos ao técnico HOJE, de uma vez, assim que a lista de vistorias
 * carrega (Dashboard) — antes dele sair pra rota.
 *
 * Complementa (não substitui) o useOfflinePrep por-vistoria já usado em
 * GuidedArrival: aquele cobre "só esse local, na hora que eu chegar"; este
 * cobre "a rota inteira, antes de sair" — pro caso relatado em campo
 * 2026-09-25: técnico chega no Ponto A sem internet, faz a vistoria, sai pro
 * Ponto B que TAMBÉM está sem internet — o gate por-vistoria não tem como
 * ajudar ali porque nunca teve rede nenhuma vez pra baixar nada. Rodando aqui,
 * no Dashboard (normalmente com wifi/sinal da base), os locais já ficam
 * quentes no IndexedDB antes do técnico perder sinal de vez.
 *
 * Best-effort e NUNCA trava em definitivo: se não tiver rede agora, os
 * locais que faltarem continuam cobertos pelo gate por-vistoria de sempre
 * (mesmo comportamento de hoje, não piora nada).
 *
 * Cache é por LOCAL (mesma chave de usePostesProximos/useOfflinePrep), não
 * por dia — uma vez baixado, uma área fica quente indefinidamente; dias
 * seguintes na mesma região não baixam de novo.
 */

import { useEffect, useRef, useState } from "react";
import { fetchPostesProximos } from "@/services/postes";
import { cacheGet, cachePut } from "@/lib/offlineDb";
import { buildCacheKey } from "@/hooks/usePostesProximos";
import type { PostesProximosResponse, Vistoria } from "@/types";

const RAIO_PADRAO = 500;
const LIMIT_PADRAO = 80;

export type OfflinePrepDiaFase = "idle" | "baixando" | "pronto" | "parcial";

export interface UseOfflinePrepDiaState {
  fase: OfflinePrepDiaFase;
  total: number;
  concluidos: number;
  falhas: number;
}

const INITIAL: UseOfflinePrepDiaState = { fase: "idle", total: 0, concluidos: 0, falhas: 0 };

function isRepetidor(v: Vistoria): boolean {
  return (v.fields?.equipamentofield ?? "").trim().toLowerCase() === "repetidor";
}

function temCoord(v: Vistoria): boolean {
  return (
    Number.isFinite(v.latitude) &&
    Number.isFinite(v.longitude) &&
    !(v.latitude === 0 && v.longitude === 0)
  );
}

export function useOfflinePrepDia(vistorias: Vistoria[]): UseOfflinePrepDiaState {
  const [state, setState] = useState<UseOfflinePrepDiaState>(INITIAL);
  // Locais já confirmados prontos nesta sessão — evita reconsultar o
  // IndexedDB a cada re-render/poll da lista de vistorias.
  const prontosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Ainda vou visitar: pendente (1ª vez) ou revisita pendente. Já
    // concluída (FINALIZADA/APROVADA) ou em fluxo à parte (DEVOLVIDA, que
    // manda direto pra /vistoria-corrigir) não precisa de poste nenhum.
    const alvos = vistorias.filter(
      (v) => (v.status === "PENDENTE" || v.status === "REPROVADA") && isRepetidor(v) && temCoord(v)
    );
    if (alvos.length === 0) {
      setState(INITIAL);
      return;
    }

    // Deduplica por local (grade de ~1,1km — mesma de usePostesProximos):
    // vários repetidores na mesma região baixam uma vez só.
    const locais = new Map<string, { lat: number; lng: number; municipio?: string }>();
    for (const v of alvos) {
      const key = buildCacheKey(v.latitude, v.longitude, RAIO_PADRAO);
      if (!locais.has(key)) locais.set(key, { lat: v.latitude, lng: v.longitude, municipio: v.cidade });
    }

    let cancelado = false;

    (async () => {
      let concluidos = 0;
      const faltando: Array<[string, { lat: number; lng: number; municipio?: string }]> = [];

      for (const [key, loc] of locais) {
        if (prontosRef.current.has(key)) {
          concluidos++;
          continue;
        }
        const jaTemCache = await cacheGet<PostesProximosResponse>(key);
        if (cancelado) return;
        if (jaTemCache) {
          prontosRef.current.add(key);
          concluidos++;
        } else {
          faltando.push([key, loc]);
        }
      }

      if (faltando.length === 0) {
        setState({ fase: "pronto", total: locais.size, concluidos, falhas: 0 });
        return;
      }

      setState({ fase: "baixando", total: locais.size, concluidos, falhas: 0 });

      let falhas = 0;
      for (const [key, loc] of faltando) {
        if (cancelado) return;
        try {
          const res = await fetchPostesProximos({
            lat: loc.lat,
            lng: loc.lng,
            raio: RAIO_PADRAO,
            limit: LIMIT_PADRAO,
            municipio: loc.municipio,
          });
          await cachePut(key, res);
          prontosRef.current.add(key);
          concluidos++;
        } catch {
          // Sem rede/erro — este local fica pro gate por-vistoria de sempre
          // resolver quando/se o técnico chegar com sinal. Não é fatal.
          falhas++;
        }
        if (!cancelado) setState({ fase: "baixando", total: locais.size, concluidos, falhas });
      }

      if (!cancelado) {
        setState({ fase: falhas > 0 ? "parcial" : "pronto", total: locais.size, concluidos, falhas });
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [vistorias]);

  return state;
}
