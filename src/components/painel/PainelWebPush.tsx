"use client";

/**
 * Registra o service worker e inscreve o navegador do analista no web push —
 * mas só se o ADMIN habilitou este usuário (flag notificar). O usuário não
 * escolhe; ele só concede a permissão do navegador uma vez.
 *
 * Fluxo: /push/status diz se está habilitado → registra SW → garante
 * permissão (pede no 1º clique se ainda "default") → PushManager.subscribe
 * com a chave VAPID → POST /push/subscribe.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function PainelWebPush() {
  const { session } = useAuthStore();
  const doneRef = useRef(false);

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const inscrever = useCallback(async () => {
    if (doneRef.current || !session?.token) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

    const authHeader = { Authorization: `Bearer ${session.token}` };

    // 1. Este usuário deve receber?
    let status: { enabled: boolean; configured: boolean };
    try {
      const r = await fetch(`${base}/api/painel/push/status`, { headers: authHeader, cache: "no-store" });
      if (!r.ok) return;
      status = await r.json();
    } catch {
      return;
    }
    if (!status.enabled || !status.configured) return;
    if (Notification.permission === "denied") return;

    // 2. Permissão do navegador (default → pede; precisa de gesto em alguns browsers).
    if (Notification.permission === "default") {
      let perm: NotificationPermission;
      try {
        perm = await Notification.requestPermission();
      } catch {
        return;
      }
      if (perm !== "granted") return;
    }

    // 3. Registra o SW (escopo /painel/ via header Service-Worker-Allowed).
    let reg: ServiceWorkerRegistration;
    try {
      reg = await navigator.serviceWorker.register(`${base}/api/painel/push-sw`, { scope: `${base}/` });
      await navigator.serviceWorker.ready;
    } catch {
      return;
    }

    // 4. Já inscrito? senão pega a chave VAPID e inscreve.
    try {
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const vr = await fetch(`${base}/api/painel/push/vapid`, { headers: authHeader, cache: "no-store" });
        if (!vr.ok) return;
        const { publicKey } = (await vr.json()) as { publicKey: string };
        if (!publicKey) return;
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }

      // 5. Manda a inscrição pro servidor (idempotente por endpoint).
      const json = sub.toJSON();
      await fetch(`${base}/api/painel/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      doneRef.current = true;
    } catch {
      /* falha de inscrição — ignora, tenta de novo no próximo load */
    }
  }, [session?.token, base]);

  useEffect(() => {
    if (!session?.token) return;
    // tenta na carga; se a permissão ainda for "default", tenta de novo no 1º clique
    void inscrever();
    const onClick = () => void inscrever();
    window.addEventListener("pointerdown", onClick);
    return () => window.removeEventListener("pointerdown", onClick);
  }, [inscrever, session?.token]);

  return null;
}
