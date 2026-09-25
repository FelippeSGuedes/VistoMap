"use client";

/**
 * useOfflinePrep — prepara o cache offline de postes próximos de UMA
 * vistoria, na chegada. Compartilhado entre o banner informativo da tela de
 * execução (OfflinePrepBanner) e o cadeado do botão "Selecionar rota"
 * (GuidedArrival).
 *
 * Vale pra qualquer vistoria (2026-09-25: generalizado, antes só rodava pra
 * "Repetidor") — o app trabalha offline como regra, não como exceção. Na
 * prática isso quase nunca baixa nada aqui: o useOfflinePrepDia (Dashboard)
 * já pré-aquece o cache de TODAS as vistorias pendentes do dia antes do
 * técnico sair; este hook só entra em ação de verdade quando aquele não deu
 * conta de algum local (sem sinal na hora, vistoria nova atribuída depois).
 *
 * Best-effort: nunca bloqueia a vistoria em definitivo — se o download
 * falhar, `bloqueado` volta a false e o técnico segue normalmente.
 */

import { useEffect, useRef, useState } from "react";
import { fetchPostesProximos } from "@/services/postes";
import { cacheGet, cachePut } from "@/lib/offlineDb";
import { buildCacheKey } from "@/hooks/usePostesProximos";
import type { PostesProximosResponse } from "@/types";

const RAIO_PADRAO = 500;

export type OfflinePrepFase = "idle" | "checando" | "baixando" | "pronto" | "falhou";

interface UseOfflinePrepInput {
  lat: number;
  lng: number;
  municipio?: string;
}

export function useOfflinePrep({ lat, lng, municipio }: UseOfflinePrepInput) {
  const [fase, setFase] = useState<OfflinePrepFase>("idle");
  const [progresso, setProgresso] = useState(0);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lat || !lng) {
      setFase("idle");
      return;
    }

    const key = buildCacheKey(lat, lng, RAIO_PADRAO);
    if (lastKeyRef.current === key) return; // já processado/em andamento pra esse local
    lastKeyRef.current = key;

    let cancelado = false;

    (async () => {
      setFase("checando");
      setProgresso(0);
      const jaTemCache = await cacheGet<PostesProximosResponse>(key);
      if (cancelado) return;
      if (jaTemCache) {
        setFase("pronto");
        return;
      }

      setFase("baixando");
      setProgresso(8);

      // Progresso "fake" suave enquanto a requisição real roda — não tem
      // como saber o progresso real de uma chamada HTTP única, isso é só
      // feedback visual pro técnico não achar que travou.
      const tick = window.setInterval(() => {
        setProgresso((p) => (p < 88 ? p + Math.random() * 14 : p));
      }, 220);

      try {
        const res = await fetchPostesProximos({
          lat,
          lng,
          raio: RAIO_PADRAO,
          limit: 80,
          municipio,
        });
        if (cancelado) {
          window.clearInterval(tick);
          return;
        }
        await cachePut(key, res);
        window.clearInterval(tick);
        setProgresso(100);
        setFase("pronto");
      } catch {
        window.clearInterval(tick);
        if (!cancelado) setFase("falhou");
      }
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, municipio]);

  const bloqueado = fase === "checando" || fase === "baixando";

  return { fase, progresso, bloqueado };
}
