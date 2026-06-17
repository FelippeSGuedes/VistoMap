"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth";
import { resetRunning } from "@/lib/offlineQueue";
import { runDrain } from "@/lib/syncRunner";
import { notifyQueueChanged } from "./useNetworkStatus";

/**
 * Sync engine — drena a fila offline quando online.
 *
 * Triggers: evento 'online', intervalo 30s, mount inicial, e 'vm-queue-changed'
 * (disparado ao enfileirar → tenta enviar na hora se houver internet).
 *
 * A lógica de envio (com timeout por upload) vive em @/lib/syncRunner.
 */
export function useOfflineSync() {
  const { session } = useAuthStore();
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!session?.token) return;
    if (typeof window === "undefined") return;

    void resetRunning();

    const drain = async () => {
      const result = await runDrain();
      if (result && (result.ok > 0 || result.failed > 0)) {
        console.log("[useOfflineSync] drained", result);
        notifyQueueChanged();
      }
    };

    void drain();
    const onOnline = () => void drain();
    const onQueueChanged = () => void drain();
    window.addEventListener("online", onOnline);
    window.addEventListener("vm-queue-changed", onQueueChanged);
    tickRef.current = window.setInterval(drain, 30_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("vm-queue-changed", onQueueChanged);
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [session?.token]);
}
