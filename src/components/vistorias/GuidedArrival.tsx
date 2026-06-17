"use client";

/**
 * GuidedArrival — navegação guiada full-screen até o poste.
 *
 * Estados (puramente visuais, sobre a distância real que já calculamos):
 *  • AGUARDANDO  (> 50 m ou sem GPS): tela neutra "Aguardando deslocamento" +
 *    botão "Selecionar rota" (abre Waze/Maps e marca Em Deslocamento).
 *  • APROXIMANDO (≤ 50 m): tela AZUL com seta grande apontando pro poste +
 *    distância em destaque.
 *  • CHEGOU      (≤ 4 m): tela VERDE com "V" (check) → libera "Iniciar Vistoria".
 *
 * NÃO altera o cálculo de metros — só a camada de design/feedback.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Check, LocateFixed, Navigation, X } from "lucide-react";
import type { Vistoria } from "@/types";
import type { ApiError } from "@/services/api";
import { useExpedienteStore } from "@/store/expediente";
import { navegarVistoria, vistoriasService } from "@/services/vistorias";
import { NavigationOptionsSheet } from "./NavigationOptionsSheet";

const BLUE_M = 50; // entra no modo "aproximando" (azul + seta)
const GREEN_M = 4; // chegou (verde + check)

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

/** Bearing (graus a partir do Norte) de A para B. */
function bearingDeg(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI; // -180..180 (0 = Norte)
}

/** Bússola do aparelho (graus). null se indisponível. */
function useHeading(active: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const handler = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      if (typeof e.webkitCompassHeading === "number") {
        setHeading(e.webkitCompassHeading); // iOS já dá em graus do Norte
      } else if (e.absolute && typeof e.alpha === "number") {
        setHeading(360 - e.alpha); // Android absolute: alpha cresce anti-horário
      }
    };
    window.addEventListener("deviceorientationabsolute", handler as EventListener);
    window.addEventListener("deviceorientation", handler as EventListener);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler as EventListener);
      window.removeEventListener("deviceorientation", handler as EventListener);
    };
  }, [active]);
  return heading;
}

interface GuidedArrivalProps {
  vistoria: Vistoria | null;
  open: boolean;
  userPosition: { lat: number; lng: number } | null;
  onClose: () => void;
  onStart: (vistoria: Vistoria) => void;
}

export function GuidedArrival({
  vistoria,
  open,
  userPosition,
  onClose,
  onStart,
}: GuidedArrivalProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const expediente = useExpedienteStore((s) => s.expediente);

  const hasCoord = useMemo(() => {
    if (!vistoria) return false;
    const { latitude: la, longitude: lo } = vistoria;
    return Number.isFinite(la) && Number.isFinite(lo) && !(la === 0 && lo === 0);
  }, [vistoria]);

  // Vistoria já finalizada → não mostra fluxo de iniciar, só estado "concluída".
  const concluida = useMemo(
    () =>
      vistoria
        ? ["FINALIZADA", "APROVADA", "REPROVADA"].includes(vistoria.status)
        : false,
    [vistoria]
  );

  const distancia = useMemo(() => {
    if (!vistoria || !userPosition || !hasCoord) return null;
    return distanciaMetros(userPosition, {
      lat: vistoria.latitude,
      lng: vistoria.longitude,
    });
  }, [vistoria, userPosition, hasCoord]);

  const fase: "aguardando" | "azul" | "verde" =
    distancia == null || distancia > BLUE_M
      ? "aguardando"
      : distancia > GREEN_M
      ? "azul"
      : "verde";

  const heading = useHeading(open && fase === "azul");
  const bearing = useMemo(() => {
    if (!vistoria || !userPosition || !hasCoord) return 0;
    return bearingDeg(userPosition, {
      lat: vistoria.latitude,
      lng: vistoria.longitude,
    });
  }, [vistoria, userPosition, hasCoord]);
  // Seta aponta pro poste no mundo real quando há bússola; senão, relativa ao Norte.
  const arrowRotation = heading != null ? bearing - heading : bearing;

  useEffect(() => {
    if (!open) {
      setStarting(false);
      setError(null);
      setOverrideOpen(false);
      setJustificativa("");
      setNavOpen(false);
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

  const expedienteBloqueio = !expediente?.emAndamento
    ? "Inicie o expediente antes de começar a vistoria."
    : expediente.emPausa
    ? "Você está em pausa. Retorne do almoço para iniciar."
    : null;

  const iniciar = async (override?: { justificativa: string }) => {
    if (!vistoria) return;
    if (expedienteBloqueio) {
      setError(expedienteBloqueio);
      return;
    }
    setStarting(true);
    setError(null);
    try {
      await vistoriasService.iniciarVistoria(vistoria.id, {
        latitude: userPosition?.lat ?? null,
        longitude: userPosition?.lng ?? null,
        forcar: !!override,
        justificativa: override?.justificativa ?? "",
      });
      onStart(vistoria);
    } catch (err) {
      const apiErr = err as ApiError;
      const data = apiErr.response?.data as
        | { message?: string; foraDoRaio?: boolean; semGps?: boolean }
        | undefined;
      setError(data?.message ?? "Erro ao iniciar vistoria");
      if (data?.foraDoRaio || data?.semGps) setOverrideOpen(true);
    } finally {
      setStarting(false);
    }
  };

  const handleRota = () => {
    if (!vistoria) return;
    void navegarVistoria(vistoria.id); // marca Em Deslocamento (situação 7)
    setNavOpen(true);
  };

  const bg =
    concluida || fase === "verde"
      ? "linear-gradient(160deg,#059669 0%,#047857 60%,#065F46 100%)"
      : fase === "azul"
      ? "linear-gradient(160deg,#2563EB 0%,#1D4ED8 60%,#1E3A8A 100%)"
      : "linear-gradient(160deg,#0B1220 0%,#0F1B2D 60%,#0A0F1A 100%)";

  const statusLabel: Record<string, string> = {
    FINALIZADA: "Finalizada",
    APROVADA: "Aprovada",
    REPROVADA: "Reprovada",
  };

  return (
    <AnimatePresence>
      {open && vistoria && (
        <motion.div
          className="fixed inset-0 z-[120] flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, background: bg }}
          exit={{ opacity: 0 }}
          transition={{ background: { duration: 0.6 }, opacity: { duration: 0.2 } }}
          style={{ background: bg, color: "#fff" }}
        >
          {/* topo: header + fechar */}
          <div className="flex items-start justify-between px-5 pt-[max(env(safe-area-inset-top),18px)]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                {vistoria.cidade || "—"}
                {vistoria.estado ? ` · ${vistoria.estado}` : ""}
              </p>
              <h2 className="truncate text-[20px] font-bold tracking-tight">
                {vistoria.equipamento}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* centro: muda por fase */}
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            {concluida ? (
              <>
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 180, damping: 14 }}
                  className="flex h-40 w-40 items-center justify-center rounded-full bg-white/15"
                  style={{ boxShadow: "0 0 0 14px rgba(255,255,255,0.08)" }}
                >
                  <Check className="h-24 w-24" strokeWidth={3} />
                </motion.div>
                <p className="mt-8 text-[24px] font-bold">Vistoria concluída</p>
                <p className="mt-1 text-[14px] text-white/80">
                  Status: {statusLabel[vistoria.status] ?? vistoria.status}
                </p>
              </>
            ) : !hasCoord ? (
              <p className="text-[15px] font-medium text-white/85">
                Equipamento sem coordenada cadastrada. Solicite o cadastro ao
                administrador.
              </p>
            ) : fase === "aguardando" ? (
              <>
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10"
                >
                  <LocateFixed className="h-9 w-9 text-white/80" />
                </motion.div>
                <p className="mt-5 text-[13px] font-semibold uppercase tracking-[0.2em] text-white/55">
                  Aguardando deslocamento
                </p>
                <p className="mt-2 max-w-[280px] text-[14px] text-white/70">
                  {distancia == null
                    ? "Obtendo sua localização…"
                    : `Você está a ${distancia} m do poste. Selecione a rota para começar o trajeto.`}
                </p>
              </>
            ) : fase === "azul" ? (
              <>
                {/* seta apontando pro poste */}
                <motion.div
                  animate={{ rotate: arrowRotation }}
                  transition={{ type: "spring", stiffness: 90, damping: 16 }}
                  className="flex h-44 w-44 items-center justify-center rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    boxShadow: "0 0 0 12px rgba(255,255,255,0.06)",
                  }}
                >
                  <Navigation className="h-24 w-24" fill="#fff" strokeWidth={1.2} />
                </motion.div>
                <div className="mt-8 text-[64px] font-bold leading-none tabular-nums">
                  {distancia}
                  <span className="ml-1 text-[22px] font-semibold text-white/70">m</span>
                </div>
                <p className="mt-2 text-[14px] text-white/75">
                  {heading != null
                    ? "Siga a seta até o poste"
                    : "Siga em direção ao poste"}
                </p>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 180, damping: 14 }}
                  className="flex h-44 w-44 items-center justify-center rounded-full bg-white/15"
                  style={{ boxShadow: "0 0 0 14px rgba(255,255,255,0.08)" }}
                >
                  <Check className="h-28 w-28" strokeWidth={3} />
                </motion.div>
                <p className="mt-8 text-[24px] font-bold">Você chegou!</p>
                <p className="mt-1 text-[14px] text-white/80">
                  A {distancia} m — vistoria liberada.
                </p>
              </>
            )}
          </div>

          {/* rodapé: ação por fase */}
          <div className="px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
            {error && (
              <p className="mb-3 text-center text-[13px] font-medium text-amber-200">
                {error}
              </p>
            )}

            {!concluida && hasCoord && fase === "verde" && (
              <button
                type="button"
                onClick={() => iniciar()}
                disabled={starting}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[16px] font-bold text-emerald-700 shadow-lg disabled:opacity-70"
              >
                {starting ? "Iniciando…" : "Iniciar Vistoria"}
              </button>
            )}

            {!concluida && hasCoord && fase !== "verde" && !overrideOpen && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleRota}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white/15 text-[16px] font-bold text-white backdrop-blur"
                >
                  <Navigation className="h-5 w-5" />
                  Selecionar rota
                </button>
                <button
                  type="button"
                  onClick={() => setOverrideOpen(true)}
                  className="w-full py-2 text-center text-[12px] font-medium text-white/60 underline-offset-2 hover:underline"
                >
                  Iniciar mesmo assim
                </button>
              </div>
            )}

            {/* override (GPS ruim / não chega no verde) */}
            {!concluida && hasCoord && overrideOpen && fase !== "verde" && (
              <div className="rounded-2xl bg-black/25 p-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">
                  Iniciar fora do local — justifique
                </p>
                <textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  rows={2}
                  placeholder="Ex.: GPS sem sinal no local…"
                  className="w-full resize-none rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-[14px] text-white outline-none placeholder:text-white/40"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOverrideOpen(false)}
                    className="h-11 flex-1 rounded-xl bg-white/10 text-[14px] font-semibold text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={justificativa.trim().length < 4 || starting}
                    onClick={() => iniciar({ justificativa: justificativa.trim() })}
                    className="h-11 flex-1 rounded-xl bg-white text-[14px] font-bold text-blue-700 disabled:opacity-50"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            )}
          </div>

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
