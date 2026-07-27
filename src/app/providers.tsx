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
import { useOtaUpdate } from "@/hooks/useOtaUpdate";
import { useDevolucaoWatcher } from "@/hooks/useDevolucaoWatcher";
import { OfflineIndicator } from "@/components/feedback/OfflineIndicator";
import { OtaUpdateOverlay } from "@/components/feedback/OtaUpdateOverlay";
import { DevolucaoModal } from "@/components/vistorias/DevolucaoModal";
import { DevolucaoBanner } from "@/components/vistorias/DevolucaoBanner";

// BUG HISTÓRICO (2026-07-08): useOtaUpdate existia e estava correto, mas
// nunca era montado em lugar nenhum — o app JAMAIS checava OTA, daí "OTA não
// funciona" mesmo com o servidor publicando certo. Se algum dia parecer não
// estar rodando de novo, confirmar que este mount segue presente aqui.
function OtaUpdateMount() {
  useOtaUpdate();
  return null;
}

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

/** Ativo só pro técnico (fora do /painel) — mesma regra do TecnicoNotificationsMount. */
function DevolucaoMount() {
  const session = useAuthStore((s) => s.session);
  const pathname = usePathname();
  const isPainel = pathname?.startsWith("/painel") ?? false;
  const enabled = !!session && session.role === "tecnico" && !isPainel;
  useDevolucaoWatcher(enabled);
  if (!enabled) return null;
  return (
    <>
      <DevolucaoBanner />
      <DevolucaoModal />
    </>
  );
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
      <OtaUpdateMount />
      <LocationReporterMount />
      <PushRegistrationMount />
      <TecnicoNotificationsMount />
      <OfflineSyncMount />
      <DevolucaoMount />
      <OfflineIndicator />
      <OtaUpdateOverlay />
      {children}
    </>
  );
}
