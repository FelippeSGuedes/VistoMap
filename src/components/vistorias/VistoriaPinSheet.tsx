"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  LocateFixed,
  MapPin,
  Navigation,
  Play,
  User,
} from "lucide-react";
import type { Vistoria } from "@/types";
import type { ApiError } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { useExpedienteStore } from "@/store/expediente";
import { VistoriaHeaderHero } from "./VistoriaHeaderHero";
import { NavigationOptionsSheet } from "./NavigationOptionsSheet";
import { navegarVistoria, vistoriasService } from "@/services/vistorias";

const RAIO_M = 100;

function distanciaMetros(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

interface VistoriaPinSheetProps {
  vistoria: Vistoria | null;
  open: boolean;
  onClose: () => void;
  onStart: (vistoria: Vistoria) => void;
}

export function VistoriaPinSheet({
  vistoria,
  open,
  onClose,
  onStart,
}: VistoriaPinSheetProps) {
  const [starting, setStarting] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const expediente = useExpedienteStore((s) => s.expediente);

  const hasCoord = useMemo(() => {
    if (!vistoria) return false;
    const { latitude: la, longitude: lo } = vistoria;
    return (
      Number.isFinite(la) &&
      Number.isFinite(lo) &&
      !(la === 0 && lo === 0)
    );
  }, [vistoria]);

  useEffect(() => {
    if (!open) {
      setStarting(false);
      setOverrideOpen(false);
      setJustificativa("");
      setStartError(null);
      setPos(null);
      setGeoError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // GPS ao vivo: detecta a chegada ao local automaticamente.
  useEffect(() => {
    if (!open || !hasCoord) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Geolocalização indisponível neste dispositivo.");
      return;
    }
    const wid = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
        setGeoError(null);
      },
      (e) => setGeoError(e.message || "Não foi possível obter sua localização."),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 }
    );
    return () => navigator.geolocation.clearWatch(wid);
  }, [open, hasCoord]);

  const distancia = useMemo(() => {
    if (!vistoria || !pos || !hasCoord) return null;
    return distanciaMetros(pos, { lat: vistoria.latitude, lng: vistoria.longitude });
  }, [vistoria, pos, hasCoord]);

  const perto = distancia != null && distancia <= RAIO_M;

  const expedienteBloqueio = !expediente?.emAndamento
    ? "Inicie o expediente antes de começar a vistoria."
    : expediente.emPausa
    ? "Você está em pausa para almoço. Retorne do almoço para iniciar."
    : null;

  const handleStart = async (override?: { justificativa: string }) => {
    if (!vistoria) return;
    if (expedienteBloqueio) {
      setStartError(expedienteBloqueio);
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      await vistoriasService.iniciarVistoria(vistoria.id, {
        latitude: pos?.lat ?? null,
        longitude: pos?.lng ?? null,
        forcar: !!override,
        justificativa: override?.justificativa ?? "",
      });
      onStart(vistoria);
    } catch (err) {
      const apiErr = err as ApiError;
      const data = apiErr.response?.data as
        | {
            message?: string;
            foraDoRaio?: boolean;
            semGps?: boolean;
            semCoordenada?: boolean;
          }
        | undefined;
      const msg =
        data?.message ??
        (err instanceof Error ? err.message : "Erro ao iniciar vistoria");
      setStartError(msg);
      // Fora do raio / sem GPS → oferece override com justificativa.
      if (data?.foraDoRaio || data?.semGps) setOverrideOpen(true);
    } finally {
      setStarting(false);
    }
  };

  const handleSelecionarRota = () => {
    if (!vistoria) return;
    // Fixa situação "Em Deslocamento" e abre o seletor de rota.
    void navegarVistoria(vistoria.id);
    setNavOpen(true);
  };

  return (
    <AnimatePresence>
      {open && vistoria && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-brand-deep/35 backdrop-blur-[2px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 w-full max-w-xl rounded-t-3xl bg-white pb-[max(env(safe-area-inset-bottom),16px)] shadow-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-12 rounded-full bg-brand-steel" />
            </div>

            <div className="mt-3">
              <VistoriaHeaderHero vistoria={vistoria} onClose={onClose} />
            </div>

            <section className="space-y-2 px-5 py-4">
              <Row icon={<Building2 className="h-4 w-4" />} label="Município">
                {vistoria.cidade || "—"}
                {vistoria.estado ? ` · ${vistoria.estado}` : ""}
              </Row>
              {vistoria.endereco && (
                <Row icon={<MapPin className="h-4 w-4" />} label="Endereço">
                  {vistoria.endereco}
                </Row>
              )}
              <Row icon={<User className="h-4 w-4" />} label="Técnico">
                {vistoria.tecnico?.nome || "—"}
              </Row>
            </section>

            {/* ── ÁREA DE AÇÃO — proximidade ─────────────────────────── */}
            <div className="px-5 pb-4 pt-1">
              {!hasCoord ? (
                <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3.5 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">Equipamento sem coordenada</p>
                    <p className="text-xs">
                      Não é possível validar sua presença. Solicite o cadastro da
                      coordenada ao administrador.
                    </p>
                  </div>
                </div>
              ) : !pos ? (
                <div className="flex items-center justify-center gap-2.5 rounded-2xl bg-brand-ice/70 px-4 py-4 text-ink-muted">
                  <LocateFixed className="h-4 w-4 animate-pulse" />
                  <span className="text-sm font-medium">
                    {geoError ? geoError : "Verificando sua localização…"}
                  </span>
                </div>
              ) : perto ? (
                <>
                  <div className="mb-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-brand-emerald">
                    <LocateFixed className="h-3.5 w-3.5" />
                    Você está no local ({distancia} m)
                  </div>
                  <Button
                    size="lg"
                    loading={starting}
                    disabled={!!expedienteBloqueio}
                    leftIcon={<Play className="h-5 w-5" />}
                    onClick={() => handleStart()}
                    className="w-full !py-4 !text-base"
                  >
                    Iniciar Vistoria
                  </Button>
                </>
              ) : (
                <>
                  <div className="mb-2.5 flex items-start gap-3 rounded-2xl bg-brand-ice/70 px-4 py-3">
                    <Navigation className="mt-0.5 h-5 w-5 shrink-0 text-brand-deep" />
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        Você não está próximo do equipamento
                      </p>
                      <p className="text-xs text-ink-muted">
                        A {distancia} m de distância. Selecione a rota — ao chegar,
                        o botão de iniciar aparece automaticamente.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="lg"
                    leftIcon={<Navigation className="h-4 w-4" />}
                    onClick={handleSelecionarRota}
                    className="w-full"
                  >
                    Selecionar rota
                  </Button>
                  {!overrideOpen && (
                    <button
                      type="button"
                      onClick={() => setOverrideOpen(true)}
                      className="mt-2 w-full text-center text-[12px] font-medium text-ink-muted underline-offset-2 hover:underline"
                    >
                      Iniciar mesmo assim
                    </button>
                  )}
                </>
              )}

              {/* Override com justificativa (fora do raio / sem GPS) */}
              {overrideOpen && hasCoord && !perto && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Iniciar fora do local — justifique
                  </p>
                  <textarea
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                    rows={2}
                    placeholder="Ex.: GPS sem sinal no local, acesso por outro ponto…"
                    className="w-full resize-none rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-amber-400"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOverrideOpen(false)}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      loading={starting}
                      disabled={justificativa.trim().length < 4 || !!expedienteBloqueio}
                      onClick={() => handleStart({ justificativa: justificativa.trim() })}
                      className="flex-1"
                    >
                      Confirmar início
                    </Button>
                  </div>
                </div>
              )}

              {startError && (
                <p className="mt-2 text-center text-xs text-red-500">{startError}</p>
              )}
            </div>
          </motion.div>

          <NavigationOptionsSheet
            open={navOpen}
            onClose={() => setNavOpen(false)}
            lat={vistoria.latitude}
            lng={vistoria.longitude}
            label={vistoria.equipamento}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-brand-ice/70 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-brand-deep shadow-soft">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-ink">{children}</p>
      </div>
    </div>
  );
}
