"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { Check, Clock3, RefreshCcw, X } from "lucide-react";
import type { SyncSnapshot } from "@/types";

interface SyncFilterSheetProps {
  open: boolean;
  snapshots: SyncSnapshot[];
  selectedId: string;
  onSelect: (snapshot: SyncSnapshot) => void;
  onClose: () => void;
}

function fmtData(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  const hh = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Hoje · ${hh}`;
  if (isYesterday) return `Ontem · ${hh}`;
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${dia} · ${hh}`;
}

export function SyncFilterSheet({
  open,
  snapshots,
  selectedId,
  onSelect,
  onClose,
}: SyncFilterSheetProps) {
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[140] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-brand-deep/40 backdrop-blur-[3px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) onClose();
            }}
            className="relative z-10 w-full max-w-xl rounded-t-3xl bg-white pb-[max(env(safe-area-inset-bottom),16px)] shadow-sheet"
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-12 rounded-full bg-brand-steel" />
            </div>
            <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-3">
              <div className="flex items-start gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-emerald/15 text-brand-emerald">
                  <Clock3 className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-[16px] font-semibold tracking-tight text-ink">
                    Sincronizações
                  </h3>
                  <p className="text-[11px] text-ink-muted">
                    Veja dados de sincronizações anteriores
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-steel/60 text-ink hover:bg-brand-steel"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="max-h-[60dvh] overflow-y-auto px-5 py-2">
              {snapshots.map((s, idx) => {
                const selected = s.id === selectedId;
                const isLatest = idx === 0;
                return (
                  <motion.button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onSelect(s);
                      onClose();
                    }}
                    whileTap={{ scale: 0.99 }}
                    className="group mb-1.5 flex w-full items-center gap-3 rounded-2xl border border-brand-steel/60 bg-white px-3 py-2.5 text-left transition hover:border-brand-emerald/40 hover:shadow-soft"
                    style={
                      selected
                        ? {
                            borderColor: "rgba(0,179,136,0.45)",
                            background:
                              "linear-gradient(135deg, rgba(0,179,136,0.06), rgba(0,179,136,0.02))",
                          }
                        : undefined
                    }
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: selected
                          ? "linear-gradient(135deg, #00B388, #00875F)"
                          : "rgba(6,59,59,0.06)",
                        color: selected ? "#fff" : "#7A8896",
                      }}
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[14px] font-semibold tracking-tight text-ink">
                          {fmtData(s.timestamp)}
                        </p>
                        {isLatest && (
                          <span className="rounded-full bg-brand-emerald/15 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.1em] text-brand-emerald">
                            Mais recente
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-muted">
                        {s.stats.total} ordens · {s.stats.pendentes} pend. · {s.stats.concluidas} concl.
                      </p>
                    </div>
                    {selected && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-emerald text-white">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
