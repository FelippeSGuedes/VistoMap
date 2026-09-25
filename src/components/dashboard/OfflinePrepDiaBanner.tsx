"use client";

/**
 * OfflinePrepDiaBanner — mostra o progresso do useOfflinePrepDia no
 * Dashboard: baixa de uma vez só os postes de TODAS as vistorias do técnico
 * hoje, antes dele sair pra rota (pedido de campo 2026-09-25 — ver
 * useOfflinePrepDia pro racional completo).
 *
 * Best-effort: nunca trava o resto do app. Se já estava tudo em cache
 * (dia comum, nada novo pra baixar), não aparece nada.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudDownload, CheckCircle2, AlertTriangle } from "lucide-react";
import { useOfflinePrepDia, type UseOfflinePrepDiaState } from "@/hooks/useOfflinePrepDia";
import type { Vistoria } from "@/types";

export function OfflinePrepDiaBanner({ vistorias }: { vistorias: Vistoria[] }) {
  const state = useOfflinePrepDia(vistorias);
  const [mostrar, setMostrar] = useState(false);
  const passouPorBaixando = useRef(false);

  useEffect(() => {
    if (state.fase === "baixando") {
      passouPorBaixando.current = true;
      setMostrar(true);
      return;
    }
    // Já estava tudo em cache (nunca passou por "baixando") — não incomoda.
    if (!passouPorBaixando.current) return;
    if (state.fase === "pronto") {
      setMostrar(true);
      const t = window.setTimeout(() => setMostrar(false), 2500);
      return () => window.clearTimeout(t);
    }
    if (state.fase === "parcial") {
      setMostrar(true);
      const t = window.setTimeout(() => setMostrar(false), 4500);
      return () => window.clearTimeout(t);
    }
  }, [state.fase]);

  const cor = corDe(state);

  return (
    <AnimatePresence>
      {mostrar && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          className="overflow-hidden rounded-2xl border px-4 py-3"
          style={{ borderColor: cor.border, background: cor.bg }}
        >
          <div className="flex items-center gap-2.5">
            {state.fase === "baixando" && (
              <CloudDownload className="h-4 w-4 shrink-0 animate-pulse" style={{ color: cor.fg }} />
            )}
            {state.fase === "pronto" && <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: cor.fg }} />}
            {state.fase === "parcial" && <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: cor.fg }} />}
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold" style={{ color: cor.fg }}>
                {state.fase === "baixando" && "Preparando vistorias de hoje para funcionar sem internet"}
                {state.fase === "pronto" && "Modo offline pronto"}
                {state.fase === "parcial" && "Modo offline parcialmente pronto"}
              </p>
              <p className="text-[11.5px] text-gray-500">
                {state.fase === "baixando" &&
                  `Baixando os locais de hoje antes de você sair (${state.concluidos} de ${state.total})…`}
                {state.fase === "pronto" &&
                  `As vistorias de hoje (${state.total} local${state.total !== 1 ? "is" : ""}) já funcionam sem sinal.`}
                {state.fase === "parcial" &&
                  `${state.concluidos} de ${state.total} prontos. Os demais baixam automaticamente ao chegar no local, se houver sinal.`}
              </p>
            </div>
          </div>
          {state.fase === "baixando" && state.total > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
              <motion.div
                className="h-full rounded-full"
                style={{ background: cor.fg }}
                animate={{ width: `${(state.concluidos / state.total) * 100}%` }}
                transition={{ duration: 0.25 }}
              />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function corDe(state: UseOfflinePrepDiaState) {
  if (state.fase === "parcial") return { border: "#FDE7C8", bg: "#FFFBF0", fg: "#B45309" };
  return { border: "#B7EBD1", bg: "#E9F9F1", fg: "#00875F" };
}
