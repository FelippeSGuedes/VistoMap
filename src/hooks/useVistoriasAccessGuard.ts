"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useExpedienteStore, type ExpedienteAtual, type JanelaExpediente } from "@/store/expediente";

/**
 * Mensagem de bloqueio quando não há expediente aberto. Como o expediente é
 * automático (abre sozinho dentro da janela + LGPD aceito), "sem expediente"
 * só acontece por um motivo concreto — refletir ele na mensagem em vez de
 * um genérico "inicie o expediente" (não existe mais botão pra isso).
 */
export function getVistoriasAccessBlockReason(
  expediente: ExpedienteAtual | null | undefined,
  janela?: JanelaExpediente | null,
  lgpdAceito?: boolean
): string | null {
  if (expediente?.emAndamento) return null;

  if (lgpdAceito === false) {
    return "Aceite o termo de consentimento (LGPD) na tela inicial para liberar o rastreio e as vistorias.";
  }
  if (janela?.motivo === "fds") {
    return "Sem expediente aos fins de semana. As vistorias voltam a ficar disponíveis no próximo dia útil.";
  }
  if (janela) {
    return `Fora do horário de expediente. Rastreio ativo das ${janela.inicio} às ${janela.fim}, dias úteis.`;
  }
  return "Fora do horário de expediente.";
}

export function useVistoriasAccessGuard() {
  const router = useRouter();
  const sessionToken = useAuthStore((s) => s.session?.token);
  const expediente = useExpedienteStore((s) => s.expediente);
  const janela = useExpedienteStore((s) => s.janela);
  const lgpdAceito = useExpedienteStore((s) => s.lgpdAceito);
  const refreshExpediente = useExpedienteStore((s) => s.refresh);

  return useCallback(
    async (href = "/vistorias") => {
      let current = expediente;
      let currentJanela = janela;
      let currentLgpd = lgpdAceito;

      if (sessionToken) {
        try {
          await refreshExpediente();
        } catch {
          // Mantém o último estado conhecido do store.
        }
        const state = useExpedienteStore.getState();
        current = state.expediente;
        currentJanela = state.janela;
        currentLgpd = state.lgpdAceito;
      }

      const reason = getVistoriasAccessBlockReason(current, currentJanela, currentLgpd);
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
    [expediente, janela, lgpdAceito, refreshExpediente, router, sessionToken]
  );
}