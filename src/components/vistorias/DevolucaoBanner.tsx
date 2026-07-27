"use client";

/**
 * DevolucaoBanner — barra fixa "1 devolução pendente" enquanto o técnico
 * dispensa o DevolucaoModal ("Depois") sem resolver. Mantém o lembrete
 * visível (persistente, mas não bloqueia) até ele corrigir ou reabrir
 * o modal daqui.
 */

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useDevolucaoStore } from "@/store/devolucao";

export function DevolucaoBanner() {
  const devolucao = useDevolucaoStore((s) => s.devolucao);
  const modalAberto = useDevolucaoStore((s) => s.modalAberto);
  const abrirModal = useDevolucaoStore((s) => s.abrirModal);

  const visivel = !!devolucao && !modalAberto;

  return (
    <AnimatePresence>
      {visivel && (
        <motion.button
          type="button"
          onClick={abrirModal}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="fixed left-1/2 top-[max(env(safe-area-inset-top),10px)] z-[130] flex -translate-x-1/2 items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-[12.5px] font-semibold text-white shadow-lg"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Vistoria devolvida — precisa corrigir
        </motion.button>
      )}
    </AnimatePresence>
  );
}
