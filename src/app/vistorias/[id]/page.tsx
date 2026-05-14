"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ImageOff } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingShell } from "@/components/feedback/LoadingShell";
import { VistoriaExecucaoForm } from "@/components/vistorias/VistoriaExecucaoForm";
import { vistoriasService } from "@/services/vistorias";
import type { Vistoria } from "@/types";

export default function VistoriaExecucaoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [vistoria, setVistoria] = useState<Vistoria | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
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
          actionLabel="Voltar ao mapa"
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
