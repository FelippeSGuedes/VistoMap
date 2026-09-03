"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/reportClientError";

/**
 * Captura promise rejeitada sem .catch() em lugar nenhum — o outro buraco
 * do loop de erro fechado (o outro é o error boundary em error.tsx, que só
 * pega erro de RENDER; isso aqui pega erro assíncrono solto). Falha de
 * rede/timeout de chamada à API já é reportada pelo interceptor do axios
 * (services/api.ts) — isso aqui é o resto (bug de lógica, promise
 * esquecida, etc).
 */
export function useErrorReporter(): void {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const mensagem = reason instanceof Error ? reason.message : String(reason);
      reportClientError(mensagem, "unhandled-rejection", {
        stack: reason instanceof Error ? reason.stack?.slice(0, 1000) : undefined,
      });
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
}
