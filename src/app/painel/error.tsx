"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { reportClientError } from "@/lib/reportClientError";

/**
 * Error boundary do /painel — segmento mais específico que src/app/error.tsx,
 * então o Next usa este aqui (não o da raiz) pra qualquer rota /painel/**.
 * Reporta com source="painel" (o servidor decide isso pelo próprio
 * NEXT_PUBLIC_BASE_PATH do container, ver /api/errors).
 */
export default function PainelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[painel error boundary]", error);
    reportClientError(error.message || "Erro sem mensagem", "error-boundary", {
      digest: error.digest,
      stack: error.stack?.slice(0, 1000),
    });
  }, [error]);

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ color: "var(--vm-text)" }}
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: "rgba(239,68,68,0.10)" }}
      >
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <div>
        <h1 className="text-[16px] font-semibold" style={{ color: "var(--vm-text)" }}>
          Algo deu errado nesta tela
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--vm-muted-b)" }}>
          O erro já foi registrado (Status &gt; Logs de erro). Tente recarregar.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="mt-2 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#00C99B,#00875F)" }}
      >
        <RotateCw className="h-4 w-4" />
        Tentar de novo
      </button>
    </div>
  );
}
