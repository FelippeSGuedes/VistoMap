"use client";

/**
 * usePushRegistration
 *
 * Registra token FCM do dispositivo quando rodando dentro do APK Capacitor.
 * No-op em browser.
 *
 * Fluxo:
 * 1. Pede permissao (Android 13+ exige POST_NOTIFICATIONS).
 * 2. Chama Push.register() — dispara evento "registration" com token FCM.
 * 3. POST do token pro backend (/api/push/register) associando ao usuario.
 * 4. Adiciona listeners pra notificacao recebida + action (deep link).
 *
 * Backend envia push via FCM HTTP API quando admin atribui vistoria etc.
 */

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { useVistoriasStore } from "@/store/vistorias";
import { API_BASE } from "@/services/api";

interface PushPlugin {
  requestPermissions: () => Promise<{ receive: "granted" | "denied" | "prompt" }>;
  register: () => Promise<void>;
  addListener: (
    event: string,
    cb: (data: unknown) => void
  ) => Promise<{ remove: () => Promise<void> }>;
}

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  Plugins?: { PushNotifications?: PushPlugin };
}

function getCapacitor(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

export function usePushRegistration() {
  const { session } = useAuthStore();

  useEffect(() => {
    if (!session?.token) return;

    const cap = getCapacitor();
    if (!cap?.isNativePlatform?.()) return;

    const Push = cap.Plugins?.PushNotifications;
    if (!Push) {
      console.warn("[usePushRegistration] Plugin PushNotifications nao disponivel.");
      return;
    }

    const removers: Array<() => Promise<void>> = [];

    (async () => {
      try {
        if (typeof Push.requestPermissions !== "function") {
          console.warn(
            "[usePushRegistration] Plugin sem requestPermissions — APK antigo?"
          );
          return;
        }
        let perm: { receive: string };
        try {
          perm = await Push.requestPermissions();
        } catch (e) {
          console.error("[usePushRegistration] requestPermissions falhou:", e);
          return;
        }
        if (perm.receive !== "granted") {
          console.warn("[usePushRegistration] Permissao negada.");
          return;
        }
        try {
          await Push.register();
        } catch (e) {
          console.error(
            "[usePushRegistration] register falhou (FCM/google-services nao config?):",
            e
          );
          return;
        }

        const r1 = await Push.addListener("registration", async (data) => {
          const token = (data as { value: string }).value;
          console.log("[usePushRegistration] FCM token:", token.slice(0, 30) + "...");
          try {
            await fetch(`${API_BASE}/push/register`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session!.token}`,
              },
              body: JSON.stringify({ token, platform: "android" }),
            });
          } catch (err) {
            console.error("[usePushRegistration] Falha registrar token:", err);
          }
        });
        removers.push(r1.remove);

        const r2 = await Push.addListener("registrationError", (data) => {
          console.error("[usePushRegistration] Erro FCM:", data);
        });
        removers.push(r2.remove);

        const r3 = await Push.addListener("pushNotificationReceived", (data) => {
          console.log("[usePushRegistration] Push recebido:", data);
          // Refetch imediato — admin atribuiu uma vistoria, traz pra lista agora
          // sem esperar o polling de 60s do TecnicoNotificationsMount.
          try {
            void useVistoriasStore.getState().fetchAll();
          } catch (err) {
            console.warn("[usePushRegistration] fetchAll falhou:", err);
          }
        });
        removers.push(r3.remove);

        const r4 = await Push.addListener(
          "pushNotificationActionPerformed",
          (data) => {
            const payload = (data as { notification: { data?: { url?: string } } })
              .notification.data;
            if (payload?.url) {
              window.location.href = payload.url;
            }
          }
        );
        removers.push(r4.remove);
      } catch (err) {
        console.error("[usePushRegistration] Setup falhou:", err);
      }
    })();

    return () => {
      removers.forEach((r) => r().catch(() => {}));
    };
  }, [session?.token]);
}
