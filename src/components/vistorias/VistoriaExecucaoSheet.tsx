"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowLeft, Wrench } from "lucide-react";
import { vistoriasService } from "@/services/vistorias";
import { VistoriaExecucaoForm } from "./VistoriaExecucaoForm";
import { LoadingShell } from "@/components/feedback/LoadingShell";
import { EmptyState } from "@/components/feedback/EmptyState";
import type { Vistoria } from "@/types";

interface VistoriaExecucaoSheetProps {
  open: boolean;
  vistoriaId: string | null;
  onClose: () => void;
}

export function VistoriaExecucaoSheet({
  open,
  vistoriaId,
  onClose,
}: VistoriaExecucaoSheetProps) {
  const [vistoria, setVistoria] = useState<Vistoria | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !vistoriaId) {
      setVistoria(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    vistoriasService
      .fetchVistoria(vistoriaId)
      .then((v) => {
        if (!v) setError("Vistoria não encontrada.");
        else setVistoria(v);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Falha ao carregar vistoria.")
      )
      .finally(() => setLoading(false));
  }, [open, vistoriaId]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-stretch justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-brand-deep/40 backdrop-blur-sm md:bg-brand-deep/55"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340 }}
            className="relative z-10 flex h-[100dvh] w-full flex-col bg-brand-ice md:my-6 md:h-[calc(100dvh-48px)] md:max-w-2xl md:rounded-3xl md:shadow-elev"
          >
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-brand-steel/60 bg-white/90 px-4 py-3 backdrop-blur-xl pt-[max(env(safe-area-inset-top),12px)] md:rounded-t-3xl">
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-ink shadow-soft transition hover:bg-brand-ice"
                aria-label="Fechar"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                  Execução da vistoria
                </p>
                <h2 className="truncate text-[16px] font-semibold tracking-tight text-ink">
                  {vistoria?.equipamento ?? "Carregando…"}
                </h2>
              </div>
              <span className="hidden h-10 w-10 items-center justify-center rounded-2xl bg-brand-emerald/15 text-brand-emerald sm:flex">
                <Wrench className="h-5 w-5" />
              </span>
            </header>

            <div className="relative flex-1 overflow-y-auto overscroll-contain">
              {loading && !vistoria ? (
                <div className="flex h-full min-h-[60dvh] items-center justify-center">
                  <LoadingShell label="Carregando vistoria" />
                </div>
              ) : error ? (
                <EmptyState
                  icon={Wrench}
                  tone="danger"
                  title="Não foi possível abrir"
                  description={error}
                  actionLabel="Fechar"
                  onAction={onClose}
                />
              ) : vistoria ? (
                <VistoriaExecucaoForm
                  vistoria={vistoria}
                  onDone={onClose}
                  embedded
                />
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
