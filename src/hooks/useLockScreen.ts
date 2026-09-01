"use client";

import { useEffect } from "react";
import { useLockStore } from "@/store/lock";
import { shouldShowLockToday } from "@/services/lock";

/**
 * @param enabled - sessão autenticada. Ao ficar true, checa se já passou
 * pela trava hoje neste aparelho e ativa a LockScreenOverlay se não.
 */
export function useLockScreen(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (shouldShowLockToday()) {
      useLockStore.getState().lock();
    }
  }, [enabled]);
}
