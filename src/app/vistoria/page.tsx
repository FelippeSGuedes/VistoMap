"use client";

/**
 * Detalhe/execução de vistoria — rota por QUERY PARAM (`/vistoria?id=<id>`).
 *
 * Substitui a rota dinâmica `/vistorias/[id]` para permitir export estático
 * no build mobile (Capacitor): export não aceita segmento dinâmico sem lista
 * de params. Funciona igual no web e no app empacotado.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ImageOff } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingShell } from "@/components/feedback/LoadingShell";
import { VistoriaExecucaoForm } from "@/components/vistorias/VistoriaExecucaoForm";
import { vistoriasService } from "@/services/vistorias";
import type { Vistoria } from "@/types";

function VistoriaExecucaoInner() {
  const router = useRouter();
  const search = useSearchParams();
  const id = search.get("id") ?? undefined;

  const [vistoria, setVistoria] = useState<Vistoria | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    vistoriasService
      .fetchVistoria(id)
      .then((v) => setVistoria(v ?? null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingShell label="Carregando vistoria" />;

  if (!vistoria) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-brand-ice">
        <AppHeader backHref="/vistorias" title="Vistoria" />
        <EmptyState
          icon={ImageOff}
          tone="danger"
          title="Vistoria não encontrada"
          description="A ordem solicitada pode ter sido removida ou ainda não foi sincronizada."
          actionLabel="Voltar"
          onAction={() => router.push("/vistorias")}
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-brand-ice">
      <AppHeader
        backHref="/vistorias"
        title={vistoria.equipamento}
        subtitle={`${vistoria.cidade}${vistoria.estado ? " · " + vistoria.estado : ""}`}
      />
      <VistoriaExecucaoForm
        vistoria={vistoria}
        onDone={() => router.push("/vistorias")}
      />
    </div>
  );
}

export default function VistoriaExecucaoPage() {
  return (
    <Suspense fallback={<LoadingShell label="Carregando vistoria" />}>
      <VistoriaExecucaoInner />
    </Suspense>
  );
}
