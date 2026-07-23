"use client";

/**
 * OfflinePrepBanner — aparece quando o "Equipamento" da vistoria é
 * "Repetidor" (sinal de zona rural / pouca cobertura, sugerido pelos
 * técnicos em campo). Baixa antecipadamente os postes próximos (mesmo
 * cache que MudarPosteFlow/usePostesProximos usa) enquanto ainda há sinal,
 * pra troca de poste funcionar offline mais tarde.
 *
 * Best-effort: nunca bloqueia a vistoria. Se já está em cache, não mostra
 * nada. Se falhar, avisa e some sozinho — o técnico segue normalmente.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudDownload, CheckCircle2, WifiOff } from "lucide-react";
import { fetchPostesProximos } from "@/services/postes";
import { cacheGet, cachePut } from "@/lib/offlineDb";
import { buildCacheKey } from "@/hooks/usePostesProximos";
import type { PostesProximosResponse } from "@/types";

const RAIO_PADRAO = 500;

interface OfflinePrepBannerProps {
  equipamento?: string | null;
  lat: number;
  lng: number;
  municipio?: string;
}

type Fase = "oculto" | "baixando" | "pronto" | "falhou";

export function OfflinePrepBanner({ equipamento, lat, lng, municipio }: OfflinePrepBannerProps) {
  const [fase, setFase] = useState<Fase>("oculto");
  const [progresso, setProgresso] = useState(0);
  const started = useRef(false);

  const isRepetidor = (equipamento ?? "").trim().toLowerCase() === "repetidor";

  useEffect(() => {
    if (!isRepetidor || started.current) return;
    if (!lat || !lng) return;
    started.current = true;

    (async () => {
      const key = buildCacheKey(lat, lng, RAIO_PADRAO);
      const jaTemCache = await cacheGet<PostesProximosResponse>(key);
      if (jaTemCache) return; // já preparado — não incomoda o técnico de novo

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
        await cachePut(key, res);
        window.clearInterval(tick);
        setProgresso(100);
        setFase("pronto");
        window.setTimeout(() => setFase("oculto"), 2200);
      } catch {
        window.clearInterval(tick);
        setFase("falhou");
        window.setTimeout(() => setFase("oculto"), 3000);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRepetidor, lat, lng, municipio]);

  return (
    <AnimatePresence>
      {fase !== "oculto" && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mx-4 mt-2 overflow-hidden rounded-2xl border px-4 py-3"
          style={{
            borderColor: fase === "falhou" ? "#FCD5CE" : "#B7EBD1",
            background: fase === "falhou" ? "#FFF4F1" : "#E9F9F1",
          }}
        >
          <div className="flex items-center gap-2.5">
            {fase === "baixando" && (
              <CloudDownload className="h-4 w-4 shrink-0 animate-pulse" style={{ color: "#00875F" }} />
            )}
            {fase === "pronto" && <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#00875F" }} />}
            {fase === "falhou" && <WifiOff className="h-4 w-4 shrink-0 text-red-500" />}
            <div className="min-w-0 flex-1">
              <p
                className="text-[12.5px] font-semibold"
                style={{ color: fase === "falhou" ? "#B23B22" : "#00875F" }}
              >
                {fase === "baixando" && "Região com sinal de rede baixo identificada"}
                {fase === "pronto" && "Modo offline pronto"}
                {fase === "falhou" && "Não foi possível preparar o modo offline agora"}
              </p>
              <p className="text-[11.5px] text-gray-500">
                {fase === "baixando" &&
                  "Baixando informações dos postes da região para habilitar troca de poste sem internet…"}
                {fase === "pronto" && "Troca de poste vai funcionar mesmo sem sinal nesta região."}
                {fase === "falhou" && "Vai continuar tentando quando a conexão melhorar."}
              </p>
            </div>
          </div>
          {fase === "baixando" && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "#00B388" }}
                animate={{ width: `${progresso}%` }}
                transition={{ duration: 0.25 }}
              />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
