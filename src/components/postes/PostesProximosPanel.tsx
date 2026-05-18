"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  ChevronRight,
  Crosshair,
  Inbox,
  Radio,
  Ruler,
  X,
} from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/utils/cn";
import { formatDistanceKm } from "@/utils/format";
import type { Poste } from "@/types";

interface PostesProximosPanelProps {
  open: boolean;
  loading: boolean;
  origin: { lat: number; lng: number } | null;
  raio: number;
  items: Poste[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
}

/**
 * Bottom-sheet com a lista de postes próximos, sincronizada com o mapa.
 *  - Card clicado → onSelect(id) → mapa centraliza + destaca
 *  - Mapa clica num poste → seta selectedId aqui → scroll/highlight do card
 */
export function PostesProximosPanel({
  open,
  loading,
  origin,
  raio,
  items,
  selectedId,
  onSelect,
  onClose,
}: PostesProximosPanelProps) {
  // auto-scroll do card selecionado pra dentro do viewport
  useEffect(() => {
    if (!open || selectedId == null) return;
    const el = document.getElementById(`poste-card-${selectedId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId, open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[90] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="pointer-events-auto w-full max-w-xl rounded-t-3xl border-t border-brand-steel/60 bg-white shadow-sheet pb-[max(env(safe-area-inset-bottom),12px)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.35 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-12 rounded-full bg-brand-steel" />
            </div>

            <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-3">
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-emerald">
                  <Radio className="h-3 w-3" />
                  Postes próximos
                </span>
                <h3 className="mt-0.5 text-[17px] font-semibold tracking-tight text-ink">
                  {items.length}{" "}
                  <span className="text-ink-muted font-normal">
                    em {raio} m
                  </span>
                </h3>
                {origin && (
                  <p className="mt-0.5 text-xs text-ink-muted">
                    <Crosshair className="mr-1 inline h-3 w-3" />
                    {origin.lat.toFixed(5)}, {origin.lng.toFixed(5)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-steel/60 text-ink hover:bg-brand-steel"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="max-h-[46dvh] overflow-y-auto px-3 pb-4 pt-1">
              {loading ? (
                <SkeletonList />
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-amber/15 text-[#8a5a00]">
                    <Inbox className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-semibold text-ink">
                    Nenhum poste no raio
                  </p>
                  <p className="max-w-xs text-xs text-ink-muted">
                    Tente aumentar o raio ou aproxime-se de uma área cadastrada.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {items.map((p) => (
                    <li key={p.id}>
                      <PosteCard
                        poste={p}
                        active={selectedId === p.id}
                        onClick={() => onSelect(p.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PosteCard({
  poste,
  active,
  onClick,
}: {
  poste: Poste;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      id={`poste-card-${poste.id}`}
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left transition",
        active
          ? "border-brand-emerald ring-2 ring-brand-emerald/30 shadow-soft"
          : "border-brand-steel/70 hover:border-brand-emerald/50 hover:shadow-soft"
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
          active
            ? "bg-brand-amber text-brand-deep"
            : "bg-brand-emerald/15 text-brand-emerald"
        )}
      >
        <Radio className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold tracking-tight text-ink">
          PSPOSTE {poste.pspostefield}
        </p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-ink-muted">
          <Building2 className="h-3 w-3" />
          {poste.municipiofield}
          {poste.materialfield ? ` · ${poste.materialfield}` : ""}
          {poste.alturadaantenafield ? ` · ${poste.alturadaantenafield}m` : ""}
        </p>
      </div>
      {poste.distancia_m != null && (
        <span className="flex items-center gap-1 rounded-full bg-brand-deep/8 px-2 py-1 text-[11px] font-semibold text-brand-deep">
          <Ruler className="h-3 w-3" />
          {formatDistanceKm(poste.distancia_m / 1000)}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
    </button>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-brand-steel/70 bg-white p-3"
        >
          <span className="shimmer h-10 w-10 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <span className="shimmer block h-3 w-1/2 rounded" />
            <span className="shimmer block h-2.5 w-3/4 rounded" />
          </div>
          <span className="shimmer h-6 w-14 rounded-full" />
        </li>
      ))}
    </ul>
  );
}
