"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloudOff, RefreshCw, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { useNetworkStatus, notifyQueueChanged } from "@/hooks/useNetworkStatus";

/**
 * Barra fixa no topo. Some quando online sem nada pendente.
 *
 * Estados (prioridade):
 *   - falhou (quarentena) → VERMELHO "X não enviada(s)" + Tentar enviar + Descartar
 *   - offline → laranja "Sem internet · X pendentes"
 *   - online + pending > 0 → azul "Sincronizando X…"
 *   - online + 0 → invisível
 */
export function OfflineIndicator() {
  const { online, pendingSync, failedSync } = useNetworkStatus();
  const [retrying, setRetrying] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const visible = !online || pendingSync > 0 || failedSync > 0;

  // Carrega os erros reais das ops em quarentena para exibir ao técnico
  useEffect(() => {
    if (failedSync === 0) {
      setErrors([]);
      setExpanded(false);
      return;
    }
    (async () => {
      try {
        const { failedOps } = await import("@/lib/offlineQueue");
        const ops = await failedOps();
        const msgs = ops.map((o) => o.lastError ?? "erro desconhecido");
        setErrors([...new Set(msgs)]); // dedup erros iguais
      } catch { /* sem IDB */ }
    })();
  }, [failedSync]);

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

  const handleDiscard = async () => {
    setDiscarding(true);
    try {
      const { discardFailed } = await import("@/lib/offlineQueue");
      await discardFailed();
      notifyQueueChanged();
      setExpanded(false);
    } finally {
      setDiscarding(false);
    }
  };

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
          initial={{ y: -56, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -56, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-x-0 top-0 z-[60] text-white"
          style={{ background: bg, paddingTop: "max(0px, env(safe-area-inset-top))" }}
        >
          {/* Linha principal */}
          <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-[12px] font-semibold">
            {mode === "failed" ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {failedSync} vistoria{failedSync === 1 ? "" : "s"} não enviada
                  {failedSync === 1 ? "" : "s"}
                  {pendingSync > 0 ? ` · ${pendingSync} na fila` : ""}
                </button>
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retrying || discarding}
                  className="ml-1 flex items-center gap-1 rounded-full bg-white/20 px-2 py-[2px] text-[11px] font-bold disabled:opacity-60"
                >
                  <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
                  {retrying ? "Enviando…" : "Tentar enviar"}
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={retrying || discarding}
                  className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-[2px] text-[11px] font-bold disabled:opacity-60"
                >
                  <Trash2 className="h-3 w-3" />
                  {discarding ? "Descartando…" : "Descartar"}
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
          </div>

          {/* Detalhe do erro — toca no texto do banner pra expandir */}
          <AnimatePresence>
            {mode === "failed" && expanded && errors.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden border-t border-white/20 bg-black/20 px-4 py-2"
              >
                {errors.map((e, i) => (
                  <p key={i} className="truncate text-[11px] opacity-90">{e}</p>
                ))}
                <p className="mt-1 text-[10px] opacity-60">
                  Use &quot;Descartar&quot; se o erro persistir após reenvio.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
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
