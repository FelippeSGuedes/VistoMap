"use client";

/**
 * useVistoriaWatcher — monitora o store de vistorias e dispara notificação
 * local quando o backend traz vistorias NOVAS (ids inéditos) para o técnico.
 *
 * Estratégia:
 *  - mantém um snapshot dos IDs vistos na sessão (Set)
 *  - na primeira carga: apenas marca, não notifica (evita ruído ao abrir app)
 *  - em cargas subsequentes: dispara `notify()` para cada novo ID
 *
 * Funciona com qualquer polling/refetch (vistoriasStore.fetchAll a cada N seg).
 */

import { useEffect, useRef } from "react";
import { useVistoriasStore } from "@/store/vistorias";
import { notify } from "@/utils/notify";

export function useVistoriaWatcher(enabled: boolean) {
  const items = useVistoriasStore((s) => s.items);
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (items.length === 0) return;

    // Primeira carga após login → indexa sem notificar.
    if (!initializedRef.current) {
      items.forEach((v) => seenRef.current.add(v.id));
      initializedRef.current = true;
      return;
    }

    // Detecta novos
    const novos = items.filter((v) => !seenRef.current.has(v.id));
    novos.forEach((v) => seenRef.current.add(v.id));

    if (novos.length === 0) return;

    // Prefix com basePath quando ativo (Next NÃO injeta em window.location).
    const PREFIX = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

    if (novos.length === 1) {
      const v = novos[0];
      notify({
        title: "Nova vistoria atribuída",
        body: `${v.equipamento} · ${v.cidade || "—"}`,
        tone: "info",
        tag: `vistoria-${v.id}`,
        onClick: () => {
          if (typeof window !== "undefined") {
            window.location.href = `${PREFIX}/vistoria?id=${v.id}`;
          }
        },
      });
    } else {
      notify({
        title: `${novos.length} novas vistorias atribuídas`,
        body: novos
          .slice(0, 3)
          .map((v) => v.equipamento)
          .join(", ") + (novos.length > 3 ? "…" : ""),
        tone: "info",
        tag: "vistorias-batch",
        onClick: () => {
          if (typeof window !== "undefined") {
            window.location.href = `${PREFIX}/vistorias`;
          }
        },
      });
    }
  }, [items, enabled]);
}
