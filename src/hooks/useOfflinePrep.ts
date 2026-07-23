"use client";

/**
 * useOfflinePrep — prepara o cache offline de postes próximos quando o
 * "Equipamento" da vistoria é "Repetidor" (indício de zona rural / pouca
 * cobertura, sinalizado pelos técnicos em campo). Compartilhado entre o
 * banner informativo da tela de execução (OfflinePrepBanner) e o cadeado
 * do botão "Selecionar rota" (GuidedArrival).
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
  equipamento?: string | null;
  lat: number;
  lng: number;
  municipio?: string;
}

export function useOfflinePrep({ equipamento, lat, lng, municipio }: UseOfflinePrepInput) {
  const [fase, setFase] = useState<OfflinePrepFase>("idle");
  const [progresso, setProgresso] = useState(0);
  const lastKeyRef = useRef<string | null>(null);

  const isRepetidor = (equipamento ?? "").trim().toLowerCase() === "repetidor";

  useEffect(() => {
    if (!isRepetidor || !lat || !lng) {
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
  }, [isRepetidor, lat, lng, municipio]);

  const bloqueado = isRepetidor && (fase === "checando" || fase === "baixando");

  return { fase, progresso, isRepetidor, bloqueado };
}
