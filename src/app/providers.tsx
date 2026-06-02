"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useExpedienteStore } from "@/store/expediente";
import { useVistoriasStore } from "@/store/vistorias";
import { useLocationReporter } from "@/hooks/useLocationReporter";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { useVistoriaWatcher } from "@/hooks/useVistoriaWatcher";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { OfflineIndicator } from "@/components/feedback/OfflineIndicator";

function LocationReporterMount() {
  useLocationReporter();
  return null;
}

function PushRegistrationMount() {
  usePushRegistration();
  return null;
}

function OfflineSyncMount() {
  useOfflineSync();
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
  const session = useAuthStore((s) => s.session);
  const refreshExpediente = useExpedienteStore((s) => s.refresh);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Mantem useExpedienteStore atualizado em qualquer pagina do app.
  // Refresh imediato no login + polling de 30s pra captar mudancas de estado
  // que nao vieram de acao local (fim automatico, finalizacao remota, etc).
  useEffect(() => {
    if (!session?.token) return;
    void refreshExpediente();
    const id = window.setInterval(refreshExpediente, 30_000);
    return () => window.clearInterval(id);
  }, [refreshExpediente, session?.token]);

  return (
    <>
      <LocationReporterMount />
      <PushRegistrationMount />
      <TecnicoNotificationsMount />
      <OfflineSyncMount />
      <OfflineIndicator />
      {children}
    </>
  );
}
