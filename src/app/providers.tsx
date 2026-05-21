"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useVistoriasStore } from "@/store/vistorias";
import { useLocationReporter } from "@/hooks/useLocationReporter";
import { useVistoriaWatcher } from "@/hooks/useVistoriaWatcher";

function LocationReporterMount() {
  useLocationReporter();
  return null;
}

/**
 * Mount global do app do técnico:
 *  - Polling de vistorias atribuídas a cada 60s (sincronização leve).
 *  - Detecta novas atribuições → notification local + som + vibração.
 *  - Inativo em /painel (admin não recebe push de "vistoria atribuída").
 */
function TecnicoNotificationsMount() {
  const session = useAuthStore((s) => s.session);
  const fetchAll = useVistoriasStore((s) => s.fetchAll);
  const pathname = usePathname();
  const isPainel = pathname?.startsWith("/painel") ?? false;
  const enabled = !!session && session.role === "tecnico" && !isPainel;

  useVistoriaWatcher(enabled);

  useEffect(() => {
    if (!enabled) return;
    // Refetch silencioso a cada 60s — backend já filtra por user.
    const id = window.setInterval(() => {
      void fetchAll();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [enabled, fetchAll]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <>
      <LocationReporterMount />
      <TecnicoNotificationsMount />
      {children}
    </>
  );
}
