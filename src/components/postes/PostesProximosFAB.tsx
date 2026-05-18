"use client";

import { motion } from "framer-motion";
import { Loader2, Radio, X } from "lucide-react";
import { cn } from "@/utils/cn";

interface PostesProximosFABProps {
  active?: boolean;
  loading?: boolean;
  count?: number;
  onClick: () => void;
  className?: string;
}

/**
 * Botão flutuante "Postes Próximos" — visualização operacional.
 * Posicionado abaixo do filtro principal do mapa (passa className pra ajustar).
 */
export function PostesProximosFAB({
  active,
  loading,
  count,
  onClick,
  className,
}: PostesProximosFABProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full pl-3 pr-4 text-[13px] font-semibold shadow-elev backdrop-blur transition",
        active
          ? "bg-grad-emerald text-white shadow-glow"
          : "bg-white/95 text-brand-deep hover:bg-white",
        className
      )}
      aria-label="Mostrar postes próximos"
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full",
          active ? "bg-white/15 text-white" : "bg-brand-emerald/15 text-brand-emerald"
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : active ? (
          <X className="h-3.5 w-3.5" />
        ) : (
          <Radio className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="whitespace-nowrap">
        {active ? "Ocultar postes" : "Postes próximos"}
        {active && typeof count === "number" && count > 0 && (
          <span className="ml-1 opacity-80">({count})</span>
        )}
      </span>
    </motion.button>
  );
}
