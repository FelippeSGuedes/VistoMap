"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloudOff, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useNetworkStatus, notifyQueueChanged } from "@/hooks/useNetworkStatus";

/**
 * Barra fixa no topo. Some quando online sem nada pendente.
 *
 * Estados (prioridade):
 *   - falhou (quarentena) → VERMELHO "X não enviada(s)" + botão Tentar enviar
 *   - offline → laranja "Sem internet · X pendentes"
 *   - online + pending > 0 → azul "Sincronizando X…"
 *   - online + 0 → invisível
 */
export function OfflineIndicator() {
  const { online, pendingSync, failedSync } = useNetworkStatus();
  const [retrying, setRetrying] = useState(false);

  const visible = !online || pendingSync > 0 || failedSync > 0;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const { retryFailed } = await import("@/lib/offlineQueue");
      const { runDrain } = await import("@/lib/syncRunner");
      await retryFailed();
      notifyQueueChanged();
      await runDrain();
      notifyQueueChanged();
    } finally {
      setRetrying(false);
    }
  };

  // Cor/conteúdo por estado
  const mode: "failed" | "offline" | "syncing" = failedSync > 0
    ? "failed"
    : !online
    ? "offline"
    : "syncing";

  const bg =
    mode === "failed"
      ? "linear-gradient(90deg,#DC2626,#B91C1C)"
      : mode === "offline"
      ? "linear-gradient(90deg,#F59E0B,#D97706)"
      : "linear-gradient(90deg,#3B82F6,#2563EB)";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 px-4 py-1.5 text-[12px] font-semibold text-white"
          style={{ background: bg, paddingTop: "max(6px, env(safe-area-inset-top))" }}
        >
          {mode === "failed" ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                {failedSync} vistoria{failedSync === 1 ? "" : "s"} não enviada
                {failedSync === 1 ? "" : "s"}
                {pendingSync > 0 ? ` · ${pendingSync} na fila` : ""}
              </span>
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="ml-1 flex items-center gap-1 rounded-full bg-white/20 px-2 py-[2px] text-[11px] font-bold disabled:opacity-60"
              >
                <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
                {retrying ? "Enviando…" : "Tentar enviar"}
              </button>
            </>
          ) : mode === "offline" ? (
            <>
              <CloudOff className="h-3.5 w-3.5" />
              Sem internet
              {pendingSync > 0 && ` · ${pendingSync} pendente${pendingSync === 1 ? "" : "s"} de envio`}
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Sincronizando {pendingSync} {pendingSync === 1 ? "item" : "itens"}…
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function OfflineDoneToast() {
  return (
    <span className="hidden">
      <CheckCircle2 />
    </span>
  );
}
