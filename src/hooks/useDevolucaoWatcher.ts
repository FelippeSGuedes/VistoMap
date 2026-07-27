"use client";

/**
 * useDevolucaoWatcher — consulta se o técnico logado tem devolução
 * PENDENTE (vistoria devolvida pelo analista pra corrigir itens
 * específicos) e mantém o store atualizado.
 *
 * Abre o modal "Houve um problema" sozinho na primeira vez que detecta
 * cada devolução (id novo) — reabrir manualmente é feito pelo banner
 * persistente (ver DevolucaoBanner) enquanto ela seguir pendente.
 */

import { useEffect, useRef } from "react";
import { api } from "@/services/api";
import { useDevolucaoStore, type DevolucaoPendente, type DevolucaoVistoria } from "@/store/devolucao";

const POLL_MS = 30_000;

export function useDevolucaoWatcher(enabled: boolean) {
  const setDevolucao = useDevolucaoStore((s) => s.setDevolucao);
  const abrirModal = useDevolucaoStore((s) => s.abrirModal);
  const lastSeenId = useRef<number | null>(null);

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
        if (data.devolucao) {
          setDevolucao(data.devolucao, data.vistoria);
          if (lastSeenId.current !== data.devolucao.id) {
            lastSeenId.current = data.devolucao.id;
            abrirModal();
          }
        } else {
          setDevolucao(null, null);
          lastSeenId.current = null;
        }
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
  }, [enabled, setDevolucao, abrirModal]);
}
