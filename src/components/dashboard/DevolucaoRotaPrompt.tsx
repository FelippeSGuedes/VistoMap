"use client";

/**
 * DevolucaoRotaPrompt — cartão leve (não bloqueia) que aparece no
 * dashboard no dia que o técnico marcou pra resolver devoluções (ver
 * DevolucaoOnboardingFlow). Sugere ordenar a fila por proximidade
 * ("automático") ou deixar como está ("manual"); "Vou fazer mais tarde"
 * só esconde o cartão nesta sessão.
 */

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Navigation, Undo2, X } from "lucide-react";
import { useVistoriasStore } from "@/store/vistorias";

interface DevolucaoRotaPromptProps {
  quantidade: number;
  onDismiss: () => void;
}

export function DevolucaoRotaPrompt({ quantidade, onDismiss }: DevolucaoRotaPromptProps) {
  const router = useRouter();
  const setFilters = useVistoriasStore((s) => s.setFilters);

  if (quantidade <= 0) return null;

  const irPraFila = (automatico: boolean) => {
    if (automatico) setFilters({ ordenacao: "distancia" });
    router.push("/vistorias");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 0.7, 0.2, 1] }}
      className="relative overflow-hidden rounded-[22px] p-4"
      style={{
        backgroundColor: "#fff",
        boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.07), 0 0 0 1px rgba(6,59,59,0.04)",
      }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar"
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-ink-muted/60 hover:bg-brand-ice"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <Undo2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold tracking-[-0.1px]" style={{ color: "#063B3B" }}>
            Bom dia! Sua rota de hoje inclui devolu{quantidade === 1 ? "ção" : "ções"}.
          </p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "#A0ACBA" }}>
            {quantidade === 1
              ? "1 vistoria precisa ser refeita hoje."
              : `${quantidade} vistorias precisam ser refeitas hoje.`}
          </p>
        </div>
      </div>

      <div className="mt-3.5 space-y-2">
        <button
          type="button"
          onClick={() => irPraFila(true)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-emerald text-[13.5px] font-semibold text-white shadow-soft transition active:scale-[0.98]"
        >
          <Navigation className="h-4 w-4" />
          Traçar rota automaticamente
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => irPraFila(false)}
            className="h-11 rounded-2xl border border-brand-steel/70 bg-white text-[13px] font-semibold text-ink transition active:scale-[0.98]"
          >
            Montar manual
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="h-11 rounded-2xl text-[13px] font-medium text-ink-muted underline-offset-2 transition hover:underline"
          >
            Vou fazer mais tarde
          </button>
        </div>
      </div>
    </motion.div>
  );
}
