"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { reportClientError } from "@/lib/reportClientError";

/**
 * Error boundary raiz do app técnico (App Router). Antes disso não existia
 * NENHUM error boundary no projeto — uma exceção de render quebrava a tela
 * inteira em branco, sem log nenhum. Reporta pra /api/errors (→ logError,
 * já aparece em /painel/status) além do console.error de sempre.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error boundary]", error);
    reportClientError(error.message || "Erro sem mensagem", "error-boundary", {
      digest: error.digest,
      stack: error.stack?.slice(0, 1000),
    });
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-brand-ice px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <div>
        <h1 className="text-[16px] font-semibold text-ink">Algo deu errado</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          O erro já foi registrado. Tente novamente — se continuar, avise a equipe.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand-emerald px-5 py-2.5 text-[13px] font-semibold text-white shadow-soft active:scale-95"
      >
        <RotateCw className="h-4 w-4" />
        Tentar de novo
      </button>
    </div>
  );
}
