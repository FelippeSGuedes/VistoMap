"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  Crosshair,
  ImageOff,
  Locate,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { StatusBadge } from "@/components/vistorias/StatusBadge";
import { PriorityBadge } from "@/components/vistorias/PriorityBadge";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ProgressOverlay } from "@/components/feedback/ProgressOverlay";
import { LoadingShell } from "@/components/feedback/LoadingShell";
import { vistoriasService } from "@/services/vistorias";
import { openNavigation } from "@/services/maps";
import { useGeolocation } from "@/hooks/useGeolocation";
import { compressImage } from "@/utils/image";
import { formatLatLng } from "@/utils/format";
import type { Vistoria } from "@/types";

interface PhotoEntry {
  id: string;
  dataUrl: string;
  size: number;
}

export default function VistoriaExecucaoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [vistoria, setVistoria] = useState<Vistoria | null>(null);
  const [loading, setLoading] = useState(true);
  const [observ, setObserv] = useState("");
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);

  const geo = useGeolocation(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    vistoriasService
      .fetchVistoria(id)
      .then((v) => {
        setVistoria(v ?? null);
        if (v) setCoords({ lat: v.latitude, lng: v.longitude });
      })
      .finally(() => setLoading(false));
  }, [id]);

  const totalSizeMb = useMemo(
    () => (photos.reduce((acc, p) => acc + p.size, 0) / (1024 * 1024)).toFixed(1),
    [photos]
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const queue = Array.from(files);
    for (const file of queue) {
      try {
        const compressed = await compressImage(file);
        setPhotos((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            dataUrl: compressed.dataUrl,
            size: compressed.size,
          },
        ]);
      } catch {
        /* ignore one failure */
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const refreshCoords = async () => {
    const next = await geo.refresh();
    if (next) setCoords({ lat: next.lat, lng: next.lng, accuracy: next.accuracy });
  };

  const onFinalize = async () => {
    if (!vistoria || !coords) return;
    setSubmitting(true);
    setDone(false);
    let pct = 8;
    setProgress(pct);
    const tick = window.setInterval(() => {
      pct = Math.min(92, pct + Math.random() * 12 + 4);
      setProgress(pct);
    }, 280);
    try {
      await vistoriasService.finalizarVistoria({
        vistoria_id: vistoria.id,
        latitude: coords.lat,
        longitude: coords.lng,
        observacoes: observ,
        fotos: photos.map((p) => p.dataUrl),
        finalizadaEm: new Date().toISOString(),
      });
      window.clearInterval(tick);
      setProgress(100);
      setDone(true);
      setTimeout(() => router.push("/vistorias"), 1100);
    } catch {
      window.clearInterval(tick);
      setSubmitting(false);
    }
  };

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

  const canSubmit = photos.length > 0 && coords != null && !submitting;

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-brand-ice pb-32">
      <AppHeader
        backHref="/vistorias"
        title={vistoria.equipamento}
        subtitle={`${vistoria.cidade}${vistoria.estado ? " · " + vistoria.estado : ""}`}
      />

      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden p-0">
            <div className="relative h-32 overflow-hidden bg-grad-deep p-5 text-white">
              <div
                aria-hidden
                className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-emerald/30 blur-3xl"
              />
              <div className="relative flex items-start justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/70">
                    GLPI · {vistoria.glpiId}
                  </span>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    {vistoria.equipamento}
                  </h2>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12">
                  <Wrench className="h-5 w-5" />
                </span>
              </div>
              <div className="relative mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={vistoria.status} />
                <PriorityBadge priority={vistoria.prioridade} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-brand-steel/70 text-sm">
              <ReadField label="Cidade" value={vistoria.cidade} />
              <ReadField label="Estado" value={vistoria.estado ?? "—"} />
              <ReadField label="Endereço" value={vistoria.endereco ?? "—"} colSpan />
              <ReadField label="Técnico" value={vistoria.tecnico.nome} />
              <ReadField label="Categoria" value={vistoria.categoria ?? "—"} />
            </div>
          </Card>
        </motion.div>

        <Card className="space-y-3">
          <header className="flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                Geolocalização
              </h3>
              <p className="text-xs text-ink-muted">
                Coordenadas bloqueadas — capturadas via GPS do dispositivo.
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-emerald/15 text-brand-emerald">
              <MapPin className="h-5 w-5" />
            </span>
          </header>

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Latitude"
              readOnly
              value={coords?.lat?.toFixed(6) ?? ""}
              leftIcon={<Crosshair className="h-4 w-4" />}
            />
            <Input
              label="Longitude"
              readOnly
              value={coords?.lng?.toFixed(6) ?? ""}
              leftIcon={<Crosshair className="h-4 w-4" />}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
            <span>
              {coords?.accuracy
                ? `Precisão ±${Math.round(coords.accuracy)} m`
                : `Coord. base: ${formatLatLng(vistoria.latitude, vistoria.longitude)}`}
            </span>
            {geo.error && <span className="text-red-500">{geo.error}</span>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              fullWidth
              size="lg"
              loading={geo.loading}
              leftIcon={<Locate className="h-4 w-4" />}
              onClick={refreshCoords}
            >
              Atualizar Coordenadas
            </Button>
            <Button
              variant="outline"
              size="lg"
              leftIcon={<Navigation className="h-4 w-4" />}
              onClick={() =>
                openNavigation(
                  coords?.lat ?? vistoria.latitude,
                  coords?.lng ?? vistoria.longitude
                )
              }
            >
              Rota
            </Button>
          </div>
        </Card>

        <Card className="space-y-3">
          <header className="flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                Evidências fotográficas
              </h3>
              <p className="text-xs text-ink-muted">
                {photos.length} foto{photos.length === 1 ? "" : "s"} · {totalSizeMb} MB
                comprimidos
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-amber/20 text-[#8a5a00]">
              <Camera className="h-5 w-5" />
            </span>
          </header>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />

          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-brand-steel bg-brand-ice text-xs font-semibold text-ink-muted transition hover:border-brand-emerald hover:text-brand-emerald"
            >
              <Plus className="h-5 w-5" />
              Adicionar
            </button>
            <AnimatePresence initial={false}>
              {photos.map((p) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="relative aspect-square overflow-hidden rounded-2xl border border-brand-steel/60 bg-brand-deep/8"
                >
                  <img
                    src={p.dataUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
                    aria-label="Remover foto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Card>

        <Card>
          <Textarea
            label="Observações técnicas"
            placeholder="Descreva o cenário, peças trocadas, recomendações…"
            maxLength={1200}
            value={observ}
            onChange={(e) => setObserv(e.target.value)}
            hint="Aceita texto livre. Será enviado junto às fotos e GPS."
          />
        </Card>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-steel/60 bg-white/85 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-xl items-center gap-3">
          <div className="hidden flex-col text-xs text-ink-muted sm:flex">
            <span className="font-semibold text-ink">Pronto para enviar</span>
            <span>{photos.length} fotos · {observ.length} caracteres</span>
          </div>
          <Button
            fullWidth
            size="xl"
            loading={submitting}
            disabled={!canSubmit}
            leftIcon={done ? <CheckCircle2 className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin opacity-0" />}
            onClick={onFinalize}
          >
            {done ? "Finalizada" : submitting ? "Enviando…" : "Finalizar Vistoria"}
          </Button>
        </div>
      </div>

      <ProgressOverlay
        open={submitting}
        progress={progress}
        title="Enviando vistoria"
        description={
          done
            ? "Sincronizando com o GLPI"
            : `${photos.length} fotos · GPS · observações`
        }
        done={done}
      />
    </div>
  );
}

function ReadField({
  label,
  value,
  colSpan,
}: {
  label: string;
  value: string;
  colSpan?: boolean;
}) {
  return (
    <div className={`bg-white p-4 ${colSpan ? "col-span-2" : ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </p>
      <p className="mt-1 truncate text-[14px] font-medium text-ink">{value}</p>
    </div>
  );
}
