"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useExpedienteStore } from "@/store/expediente";
import { useVistoriasStore } from "@/store/vistorias";
import { useLocationReporter } from "@/hooks/useLocationReporter";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { useOtaUpdate } from "@/hooks/useOtaUpdate";
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

function OtaUpdateMount() {
  useOtaUpdate();
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
    // Refetch silencioso a cada 20s — backend já filtra por user. (Era 60s; com
    // 20s a vistoria recém-atribuída aparece sozinha, sem fechar/reabrir o app.)
    const id = window.setInterval(() => {
      void fetchAll();
    }, 20_000);

    // Sincroniza NA HORA quando o app volta ao foco / fica visível (ex.: o
    // técnico abriu a notificação push). Cobre o caso "abri de novo e não
    // sincronizou": agora puxa imediatamente.
    const syncNow = () => {
      if (document.visibilityState === "visible") void fetchAll();
    };
    document.addEventListener("visibilitychange", syncNow);
    window.addEventListener("focus", syncNow);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", syncNow);
      window.removeEventListener("focus", syncNow);
    };
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
      <OtaUpdateMount />
      <TecnicoNotificationsMount />
      <OfflineSyncMount />
      <OfflineIndicator />
      {children}
    </>
  );
}
