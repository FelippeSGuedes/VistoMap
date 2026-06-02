"use client";

import { useEffect, useState } from "react";
import { pendingCount } from "@/lib/offlineQueue";

export interface NetworkState {
  online: boolean;
  pendingSync: number;
}

/**
 * Hook unico pra status online + count de operacoes na queue offline.
 * Re-renderiza quando `online` muda OU quando emitimos 'vm-queue-changed'.
 */
export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>({
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    pendingSync: 0,
  });

  useEffect(() => {
    const refreshCount = async () => {
      try {
        const n = await pendingCount();
        setState((s) => ({ ...s, pendingSync: n }));
      } catch {
        /* SSR ou sem IDB */
      }
    };
    void refreshCount();

    const onOnline = () => setState((s) => ({ ...s, online: true }));
    const onOffline = () => setState((s) => ({ ...s, online: false }));
    const onQueueChanged = () => void refreshCount();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("vm-queue-changed", onQueueChanged);

    // Re-check count a cada 15s (pra pegar mudancas de outras tabs)
    const id = window.setInterval(refreshCount, 15_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("vm-queue-changed", onQueueChanged);
      window.clearInterval(id);
    };
  }, []);

  return state;
}

/** Dispara evento pra atualizar todos os useNetworkStatus em tela. */
export function notifyQueueChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("vm-queue-changed"));
}
