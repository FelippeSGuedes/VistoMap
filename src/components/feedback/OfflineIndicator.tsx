"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

/**
 * Barra fixa no topo. Some quando online sem pendencias.
 *
 * Estados:
 *   - offline → laranja "Sem internet · X pendentes"
 *   - online + pending > 0 → azul "Sincronizando X..."
 *   - online + 0 pending → invisivel
 */
export function OfflineIndicator() {
  const { online, pendingSync } = useNetworkStatus();
  const visible = !online || pendingSync > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 px-4 py-1.5 text-[12px] font-semibold text-white"
          style={{
            background: online
              ? "linear-gradient(90deg,#3B82F6,#2563EB)"
              : "linear-gradient(90deg,#F59E0B,#D97706)",
            paddingTop: "max(6px, env(safe-area-inset-top))",
          }}
        >
          {online ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Sincronizando {pendingSync} {pendingSync === 1 ? "item" : "itens"}…
            </>
          ) : (
            <>
              <CloudOff className="h-3.5 w-3.5" />
              Sem internet
              {pendingSync > 0 && ` · ${pendingSync} pendente${pendingSync === 1 ? "" : "s"} de envio`}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function OfflineDoneToast() {
  // placeholder pra um toast "Tudo sincronizado!" quando queue zera. TODO.
  return (
    <span className="hidden">
      <CheckCircle2 />
    </span>
  );
}
