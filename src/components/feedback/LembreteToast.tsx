"use client";

/**
 * LembreteToast — avisozinho que some sozinho, usado quando um push de
 * lembrete (ex.: devolução agendada pra hoje) chega com o app já aberto
 * em primeiro plano. Não bloqueia nada — só aparece, avisa, some.
 */

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useLembreteToastStore } from "@/store/lembreteToast";

const DURACAO_MS = 5000;

export function LembreteToast() {
  const mensagem = useLembreteToastStore((s) => s.mensagem);
  const limpar = useLembreteToastStore((s) => s.limpar);

  useEffect(() => {
    if (!mensagem) return;
    const t = window.setTimeout(limpar, DURACAO_MS);
    return () => window.clearTimeout(t);
  }, [mensagem, limpar]);

  return (
    <AnimatePresence>
      {mensagem && (
        <motion.button
          type="button"
          onClick={limpar}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="fixed left-1/2 top-[max(env(safe-area-inset-top),10px)] z-[130] flex -translate-x-1/2 items-center gap-2 rounded-full bg-brand-deep px-4 py-2 text-[12.5px] font-semibold text-white shadow-lg"
        >
          <Bell className="h-3.5 w-3.5" />
          {mensagem}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
