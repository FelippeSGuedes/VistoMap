"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { Camera, X } from "lucide-react";
import { GuidedCaptureFlow } from "./GuidedCaptureFlow";
import type { CaptureBundle } from "@/types";

interface CaptureCameraModalProps {
  open: boolean;
  bundle: CaptureBundle;
  onChange: (bundle: CaptureBundle) => void;
  onClose: () => void;
  equipmentName?: string;
}

export function CaptureCameraModal({
  open,
  bundle,
  onChange,
  onClose,
  equipmentName,
}: CaptureCameraModalProps) {
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
          className="fixed inset-0 z-[300] flex items-stretch justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Camera-immersive dark backdrop */}
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-[#05101A]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          {/* Faint viewfinder corners */}
          <div className="pointer-events-none absolute inset-0">
            <Corner className="left-3 top-3" />
            <Corner className="right-3 top-3 rotate-90" />
            <Corner className="bottom-3 left-3 -rotate-90" />
            <Corner className="bottom-3 right-3 rotate-180" />
          </div>

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="relative z-10 flex h-[100dvh] w-full flex-col text-white md:my-6 md:h-[calc(100dvh-48px)] md:max-w-2xl md:rounded-3xl md:shadow-elev"
          >
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/8 bg-[#05101A]/80 px-4 py-3 backdrop-blur-xl pt-[max(env(safe-area-inset-top),12px)] md:rounded-t-3xl">
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white transition hover:bg-white/15"
                aria-label="Fechar câmera"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-emerald">
                  Câmera guiada
                </p>
                <h2 className="truncate text-[15px] font-semibold tracking-tight text-white">
                  {equipmentName ?? "Captura de evidências"}
                </h2>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-emerald/15 text-brand-emerald">
                <Camera className="h-5 w-5" />
              </span>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-contain bg-[#0A1A24]">
              <div className="mx-auto w-full max-w-xl px-4 py-4 pb-8">
                <div className="rounded-3xl bg-white p-4 shadow-elev">
                  <GuidedCaptureFlow bundle={bundle} onChange={onChange} />
                </div>
              </div>
            </div>

            <footer className="sticky bottom-0 z-20 border-t border-white/8 bg-[#05101A]/85 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl">
              <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3">
                <span className="text-xs text-white/70">
                  Concluir as 6 etapas para retornar ao formulário.
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-brand-deep shadow-soft transition hover:bg-brand-ice"
                >
                  Voltar ao formulário
                </button>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Corner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`absolute flex h-6 w-6 ${className}`}
      style={{
        borderTop: "2px solid #06D6A0",
        borderLeft: "2px solid #06D6A0",
        borderTopLeftRadius: 6,
        opacity: 0.45,
      }}
    />
  );
}
