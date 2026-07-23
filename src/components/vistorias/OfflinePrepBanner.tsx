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
import { useOfflinePrep } from "@/hooks/useOfflinePrep";

interface OfflinePrepBannerProps {
  equipamento?: string | null;
  lat: number;
  lng: number;
  municipio?: string;
}

export function OfflinePrepBanner({ equipamento, lat, lng, municipio }: OfflinePrepBannerProps) {
  const { fase, progresso } = useOfflinePrep({ equipamento, lat, lng, municipio });
  const [mostrar, setMostrar] = useState(false);
  const passouPorBaixando = useRef(false);

  useEffect(() => {
    if (fase === "baixando") {
      passouPorBaixando.current = true;
      setMostrar(true);
      return;
    }
    // Já estava em cache (nunca passou por "baixando") — não incomoda o técnico.
    if (!passouPorBaixando.current) return;
    if (fase === "pronto" || fase === "falhou") {
      setMostrar(true);
      const t = window.setTimeout(() => setMostrar(false), fase === "pronto" ? 2200 : 3000);
      return () => window.clearTimeout(t);
    }
  }, [fase]);

  return (
    <AnimatePresence>
      {mostrar && (
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
