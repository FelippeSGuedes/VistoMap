"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";

interface ProgressOverlayProps {
  open: boolean;
  progress?: number;
  title?: string;
  description?: string;
  done?: boolean;
}

export function ProgressOverlay({
  open,
  progress = 0,
  title = "Enviando",
  description,
  done,
}: ProgressOverlayProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-brand-deep/55 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-[min(360px,calc(100%-32px))] rounded-3xl bg-white p-6 shadow-elev"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                  done ? "bg-brand-emerald/15 text-brand-emerald" : "bg-brand-deep/8 text-brand-deep"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin" />
                )}
              </span>
              <div>
                <h3 className="text-base font-semibold text-ink">
                  {done ? "Vistoria finalizada" : title}
                </h3>
                {description && (
                  <p className="text-sm text-ink-muted">{description}</p>
                )}
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-brand-steel/60">
              <motion.div
                className="h-full bg-grad-emerald"
                initial={{ width: 0 }}
                animate={{ width: `${done ? 100 : Math.max(8, Math.min(progress, 100))}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {done ? "Tudo certo. Sincronização concluída." : "Não feche o app durante o envio."}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
