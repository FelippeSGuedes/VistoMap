"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Permissão do navegador para Notification API (in-app local notifications).
 *
 * Não confunde com push: aqui é só o "permissão de mostrar notificação enquanto
 * a aba está aberta" — sem service worker push, sem FCM. Funciona pra todos os
 * browsers modernos (Chrome/Edge/Firefox/Safari 16+).
 */

export type NotificationPermissionState =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

export function useNotificationPermission() {
  const [state, setState] = useState<NotificationPermissionState>(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      return "unsupported";
    }
    return Notification.permission as NotificationPermissionState;
  });

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setState(Notification.permission as NotificationPermissionState);
  }, []);

  const request = useCallback(async (): Promise<NotificationPermissionState> => {
    if (typeof Notification === "undefined") return "unsupported";
    if (Notification.permission === "granted" || Notification.permission === "denied") {
      setState(Notification.permission as NotificationPermissionState);
      return Notification.permission as NotificationPermissionState;
    }
    const result = await Notification.requestPermission();
    setState(result as NotificationPermissionState);
    return result as NotificationPermissionState;
  }, []);

  return { state, request, supported: state !== "unsupported" };
}
