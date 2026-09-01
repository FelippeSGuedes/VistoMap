"use client";

import { useEffect } from "react";
import { useLockStore } from "@/store/lock";
import { shouldShowLockToday } from "@/services/lock";

/**
 * @param enabled - sessão autenticada. Checa se já passou pela trava hoje
 * neste aparelho e ativa a LockScreenOverlay se não.
 *
 * Reavalia no mount/login E em todo retorno ao primeiro plano (visibilitychange
 * + focus, mesmo padrão do TecnicoNotificationsMount em providers.tsx) — não
 * só quando `enabled` liga. No Android, "fechar pelos apps recentes e abrir
 * de novo" costuma só suspender/retomar o WebView, sem recarregar a página;
 * `enabled` (sessão) permanece true o tempo todo, então um efeito que só
 * depende dele nunca dispara de novo — a trava nunca aparecia depois da
 * virada do dia enquanto o processo continuasse vivo.
 */
export function useLockScreen(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const checar = () => {
      if (shouldShowLockToday()) {
        useLockStore.getState().lock();
      }
    };

    checar();

    const aoVoltarPraFrente = () => {
      if (document.visibilityState === "visible") checar();
    };
    document.addEventListener("visibilitychange", aoVoltarPraFrente);
    window.addEventListener("focus", checar);

    return () => {
      document.removeEventListener("visibilitychange", aoVoltarPraFrente);
      window.removeEventListener("focus", checar);
    };
  }, [enabled]);
}
