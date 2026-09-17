"use client";

/**
 * useDevolucaoWatcher — consulta se o técnico logado tem devolução
 * PENDENTE (vistoria devolvida pelo analista pra corrigir itens
 * específicos) e mantém o store atualizado.
 *
 * Não abre mais UI sozinho (o balão/modal antigos foram aposentados —
 * ver DevolucaoOnboardingFlow/DevolucaoRotaPrompt no dashboard). Continua
 * rodando só porque /vistoria-corrigir lê `devolucao`/`vistoria` do store
 * como cache antes do próprio fetch.
 */

import { useEffect } from "react";
import { api } from "@/services/api";
import { useDevolucaoStore, type DevolucaoPendente, type DevolucaoVistoria } from "@/store/devolucao";

const POLL_MS = 30_000;

export function useDevolucaoWatcher(enabled: boolean) {
  const setDevolucao = useDevolucaoStore((s) => s.setDevolucao);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const check = async () => {
      try {
        const { data } = await api.get<{
          devolucao: DevolucaoPendente | null;
          vistoria: DevolucaoVistoria | null;
        }>("/vistorias/devolucao-pendente");
        if (cancelled) return;
        setDevolucao(data.devolucao, data.vistoria);
      } catch {
        /* rede ruim — tenta de novo no próximo ciclo */
      }
    };

    check();
    const id = window.setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, setDevolucao]);
}
