"use client";

/**
 * NotificationPermissionCard — banner sutil que aparece no dashboard
 * quando a permissão de notificações ainda não foi concedida.
 *
 * Some assim que o user clica "Ativar" e concede (ou nega) — fica em silêncio.
 */

import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";

const DISMISS_KEY = "vistomap.notif.dismissed";

export function NotificationPermissionCard() {
  const { state, request, supported } = useNotificationPermission();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const visible = supported && state === "default" && !dismissed;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* noop */
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="relative flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,179,136,0.10) 0%, rgba(0,179,136,0.04) 100%)",
            border: "1px solid rgba(0,179,136,0.28)",
            boxShadow: "0 2px 10px rgba(0,179,136,0.10)",
          }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background:
                "linear-gradient(145deg, rgba(0,179,136,0.18), rgba(0,179,136,0.06))",
              color: "#00875F",
            }}
          >
            <Bell className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[12.5px] font-semibold tracking-tight"
              style={{ color: "#063B3B" }}
            >
              Ative as notificações
            </p>
            <p
              className="mt-0.5 text-[10.5px] leading-snug"
              style={{ color: "#566773" }}
            >
              Receba alertas quando o admin atribuir novas vistorias ou
              quando a sincronização concluir.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void request()}
            className="shrink-0 rounded-xl px-3 py-1.5 text-[11.5px] font-semibold text-white transition active:scale-[0.97]"
            style={{
              background: "linear-gradient(135deg, #00C99B 0%, #00875F 100%)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.18) inset, 0 3px 10px rgba(0,179,136,0.32)",
            }}
          >
            Ativar
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition hover:bg-black/5"
            style={{ color: "#7A8896" }}
            aria-label="Dispensar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
