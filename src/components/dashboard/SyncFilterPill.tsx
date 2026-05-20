"use client";

import { motion } from "framer-motion";
import { Clock3, ChevronDown } from "lucide-react";

interface SyncFilterPillProps {
  /** Texto principal do filtro ativo (ex: "Última" ou "Ontem 18:22"). */
  label: string;
  /** Subtexto opcional — total de ordens, etc. */
  sub?: string;
  /** Indica se é o snapshot mais recente (estiliza diferente). */
  latest?: boolean;
  onEdit: () => void;
}

export function SyncFilterPill({
  label,
  sub,
  latest = true,
  onEdit,
}: SyncFilterPillProps) {
  return (
    <div
      className="flex items-stretch overflow-hidden rounded-full"
      style={{
        background: "rgba(255,255,255,0.7)",
        border: "1px solid rgba(6,59,59,0.08)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 2px 6px rgba(6,59,59,0.04)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {/* Lado esquerdo: snapshot ativo */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full"
          style={{
            background: latest
              ? "linear-gradient(135deg, #00B388, #00875F)"
              : "rgba(6,59,59,0.08)",
            color: latest ? "#fff" : "#7A8896",
          }}
        >
          <Clock3 className="h-[11px] w-[11px]" strokeWidth={2.4} />
        </span>
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted leading-none">
            {latest ? "Última sync" : "Sync"}
          </span>
          <span className="text-[12px] font-semibold tracking-tight text-ink leading-tight">
            {label}
          </span>
        </div>
      </div>

      {/* Divider */}
      <span aria-hidden className="my-1.5 w-px shrink-0" style={{ background: "rgba(6,59,59,0.08)" }} />

      {/* Botão Editar */}
      <motion.button
        type="button"
        onClick={onEdit}
        whileTap={{ scale: 0.96 }}
        className="flex items-center gap-1 px-3 text-[12px] font-semibold tracking-tight text-brand-emerald"
        style={{ background: "transparent" }}
      >
        Editar
        <ChevronDown className="h-3 w-3" strokeWidth={2.6} />
        {sub && <span className="sr-only">{sub}</span>}
      </motion.button>
    </div>
  );
}
