"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth";
import { resetRunning, retryFailed } from "@/lib/offlineQueue";
import { runDrain } from "@/lib/syncRunner";
import { notifyQueueChanged } from "./useNetworkStatus";

/**
 * Sync engine — drena a fila offline.
 *
 * IMPORTANTE (anti-crash-loop): NÃO drena na abertura do app. Se um upload
 * estourava memória/ANR e a gente drenava no boot, o app entrava em loop de
 * crash ("abre e fecha"). Agora:
 *  • no boot só roda o disjuntor (resetRunning → quarentena de ops travadas);
 *  • drena só em transição 'online', no intervalo (30s, app já aberto) e quando
 *    algo é enfileirado ('vm-queue-changed').
 *  • ao voltar a internet, dá uma última chance pras ops em quarentena.
 */
export function useOfflineSync() {
  const { session } = useAuthStore();
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!session?.token) return;
    if (typeof window === "undefined") return;

    // Boot: só quarentena de ops interrompidas. SEM drain imediato.
    void resetRunning();

    const drain = async () => {
      const result = await runDrain();
      if (result && (result.ok > 0 || result.failed > 0)) {
        notifyQueueChanged();
      }
    };

    const onOnline = async () => {
      await retryFailed().catch(() => 0); // rede voltou → mais uma chance
      await drain();
    };
    const onQueueChanged = () => void drain();

    window.addEventListener("online", onOnline);
    window.addEventListener("vm-queue-changed", onQueueChanged);
    // Primeiro tick só depois de 30s — dá tempo do app abrir/estabilizar.
    tickRef.current = window.setInterval(drain, 30_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("vm-queue-changed", onQueueChanged);
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [session?.token]);
}
