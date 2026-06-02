"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useExpedienteStore, type ExpedienteAtual } from "@/store/expediente";

export function getVistoriasAccessBlockReason(
  expediente: ExpedienteAtual | null | undefined
): string | null {
  if (!expediente?.emAndamento) {
    return "Inicie o expediente antes de abrir o mapa e acessar as vistorias do dia.";
  }

  if (expediente.emPausa) {
    return "Você está em pausa para almoço. Retorne do almoço para acessar o mapa e continuar as vistorias.";
  }

  return null;
}

export function useVistoriasAccessGuard() {
  const router = useRouter();
  const sessionToken = useAuthStore((s) => s.session?.token);
  const expediente = useExpedienteStore((s) => s.expediente);
  const refreshExpediente = useExpedienteStore((s) => s.refresh);

  return useCallback(
    async (href = "/vistorias") => {
      let current = expediente;

      if (sessionToken) {
        try {
          await refreshExpediente();
        } catch {
          // Mantém o último estado conhecido do store.
        }
        current = useExpedienteStore.getState().expediente;
      }

      const reason = getVistoriasAccessBlockReason(current);
      if (reason) {
        if (typeof window !== "undefined") {
          window.alert(reason);
        }
        router.push("/dashboard");
        return false;
      }

      router.push(href);
      return true;
    },
    [expediente, refreshExpediente, router, sessionToken]
  );
}