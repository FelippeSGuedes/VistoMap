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
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Check, Clock, LocateFixed, Lock, Navigation, Wrench, X, XCircle } from "lucide-react";
import type { Vistoria } from "@/types";
import type { ApiError } from "@/services/api";
import { api } from "@/services/api";
import { useExpedienteStore } from "@/store/expediente";
import { navegarVistoria, vistoriasService } from "@/services/vistorias";
import { useOfflinePrep } from "@/hooks/useOfflinePrep";
import { usePostesProximos } from "@/hooks/usePostesProximos";
import { NavigationOptionsSheet } from "./NavigationOptionsSheet";
import { RecusarVistoriaFlow } from "./RecusarVistoriaFlow";
import { MudarPosteFlow } from "@/components/postes/MudarPosteFlow";
import type { RecusaMotivo } from "@/lib/glpi/recusaMotivos";

/** Raio (m) usado pro gate automático de "Recusar vistoria" — mesmo raio de troca de poste. */
const GATE_RAIO_M = 100;

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
  /** Recarrega a lista — chamado após troca de poste ou recusa aprovada. */
  onDataChanged?: () => void;
}

type ApprovalPhase = "idle" | "aguardando" | "aprovado" | "reprovado";

export function GuidedArrival({
  vistoria,
  open,
  userPosition,
  onClose,
  onStart,
  onDataChanged,
}: GuidedArrivalProps) {
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  // Fluxo de aprovação remota
  const [approvalPhase, setApprovalPhase] = useState<ApprovalPhase>("idle");
  const [pendingRequestId, setPendingRequestId] = useState<number | null>(null);
  const [reprovacaoMotivo, setReprovacaoMotivo] = useState("");
  const pollRef = useRef<number | null>(null);
  const vistoriaRef = useRef(vistoria);
  const onStartRef = useRef(onStart);
  useEffect(() => { vistoriaRef.current = vistoria; }, [vistoria]);
  useEffect(() => { onStartRef.current = onStart; }, [onStart]);
  const expediente = useExpedienteStore((s) => s.expediente);
  const janela = useExpedienteStore((s) => s.janela);

  // Gate automático de "Recusar vistoria": busca postes num raio de 100m
  // assim que o técnico chega no local — 0 resultados libera "Recusar"
  // direto (motivo SEM_POSTES); 1+ resultados só libera "Trocar de poste"
  // (o "Recusar" fica escondido atrás do "nenhum poste é acessível" lá
  // dentro do MudarPosteFlow). Decide sozinho, sem depender do técnico
  // "achar" que não tem alternativa — evita recusa por preguiça.
  const posteGate = usePostesProximos();
  const [mudarPosteOpen, setMudarPosteOpen] = useState(false);
  const [recusarOpen, setRecusarOpen] = useState(false);
  const [recusarMotivoFixo, setRecusarMotivoFixo] = useState<RecusaMotivo | undefined>(undefined);

  // Zona rural / pouco sinal (equipamento "Repetidor"): baixa os postes da
  // região antes de liberar a rota, pra troca de poste funcionar offline.
  const offlinePrep = useOfflinePrep({
    equipamento: vistoria?.fields?.equipamentofield,
    lat: vistoria?.latitude ?? 0,
    lng: vistoria?.longitude ?? 0,
    municipio: vistoria?.cidade,
  });
  const rotaBloqueada = offlinePrep.bloqueado;

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

  // Dispara o gate assim que chega no "verde" — uma vez só por abertura.
  useEffect(() => {
    if (!open || fase !== "verde" || !vistoria || posteGate.fetched || posteGate.loading) return;
    const origin = userPosition ?? (hasCoord ? { lat: vistoria.latitude, lng: vistoria.longitude } : null);
    if (!origin) return;
    void posteGate.fetch({ lat: origin.lat, lng: origin.lng, raio: GATE_RAIO_M, limit: 5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fase, vistoria?.id]);

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

  // Polling de aprovação — deps mínimas para o interval não ser destruído por re-renders do GPS
  useEffect(() => {
    if (approvalPhase !== "aguardando" || !pendingRequestId) return;
    const poll = async () => {
      const v = vistoriaRef.current;
      if (!v) return;
      try {
        const r = await api.get<{ status: string; motivo?: string }>(
          `/vistorias/${v.id}/override-request?requestId=${pendingRequestId}`
        );
        if (r.data.status === "APROVADO") {
          window.clearInterval(pollRef.current!);
          setApprovalPhase("aprovado");
          window.setTimeout(() => onStartRef.current(v), 2000);
        } else if (r.data.status === "REPROVADO") {
          window.clearInterval(pollRef.current!);
          setReprovacaoMotivo(r.data.motivo ?? "");
          setApprovalPhase("reprovado");
        }
      } catch { /* rede ruim — tenta no próximo ciclo */ }
    };
    pollRef.current = window.setInterval(poll, 3000);
    return () => { window.clearInterval(pollRef.current!); };
  }, [approvalPhase, pendingRequestId]);

  useEffect(() => {
    if (!open) {
      setStarting(false);
      setError(null);
      setOverrideOpen(false);
      setJustificativa("");
      setNavOpen(false);
      setApprovalPhase("idle");
      setPendingRequestId(null);
      setReprovacaoMotivo("");
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      posteGate.reset();
      setMudarPosteOpen(false);
      setRecusarOpen(false);
      setRecusarMotivoFixo(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Vistoria devolvida pra correção → nunca mostra o fluxo normal de chegada
  // (chamar /iniciar aqui reabriria a vistoria do zero, ignorando os itens
  // apontados pelo analista). Manda direto pra tela de correção.
  useEffect(() => {
    if (!open || !vistoria) return;
    if (vistoria.status === "DEVOLVIDA") {
      onClose();
      router.push(`/vistoria-corrigir?id=${vistoria.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vistoria?.id, vistoria?.status]);

  const expedienteBloqueio = expediente?.emAndamento
    ? null
    : janela?.motivo === "fds"
      ? "Sem expediente aos fins de semana."
      : janela
        ? `Fora do horário de expediente (${janela.inicio}–${janela.fim}).`
        : "Fora do horário de expediente.";

  const iniciar = async (override?: { justificativa: string }) => {
    if (!vistoria) return;
    if (expedienteBloqueio) {
      setError(expedienteBloqueio);
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const result = await vistoriasService.iniciarVistoria(vistoria.id, {
        latitude: userPosition?.lat ?? null,
        longitude: userPosition?.lng ?? null,
        forcar: !!override,
        justificativa: override?.justificativa ?? "",
      });
      if (result.pending && result.requestId) {
        setPendingRequestId(result.requestId);
        setOverrideOpen(false);
        setApprovalPhase("aguardando");
      } else {
        onStart(vistoria);
      }
    } catch (err) {
      const apiErr = err as ApiError;
      const data = apiErr.response?.data as
        | {
            message?: string;
            foraDoRaio?: boolean;
            semGps?: boolean;
            motivo?: string;
            devolucaoVistoriaId?: number;
          }
        | undefined;
      // Devolução pendente de outro dia — obrigatório resolver antes de
      // iniciar qualquer vistoria nova. Manda direto pra tela de correção
      // em vez do fluxo normal de erro/override.
      if (data?.motivo === "devolucao-pendente" && data.devolucaoVistoriaId) {
        onClose();
        router.push(`/vistoria-corrigir?id=${data.devolucaoVistoriaId}`);
        return;
      }
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

  const BG_ORANGE = "linear-gradient(160deg,#EA580C 0%,#C2410C 60%,#9A3412 100%)";
  const BG_GREEN  = "linear-gradient(160deg,#059669 0%,#047857 60%,#065F46 100%)";
  const BG_RED    = "linear-gradient(160deg,#DC2626 0%,#B91C1C 60%,#991B1B 100%)";

  const bg =
    approvalPhase === "aguardando" ? BG_ORANGE
    : approvalPhase === "aprovado"  ? BG_GREEN
    : approvalPhase === "reprovado" ? BG_RED
    : concluida || fase === "verde" ? BG_GREEN
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
            {approvalPhase === "aguardando" ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="flex h-36 w-36 items-center justify-center rounded-full"
                  style={{ background: "rgba(255,255,255,0.15)", boxShadow: "0 0 0 12px rgba(255,255,255,0.07)" }}
                >
                  <Clock className="h-20 w-20 text-white" strokeWidth={1.5} />
                </motion.div>
                <p className="mt-8 text-[13px] font-bold uppercase tracking-[0.2em] text-white/60">
                  Solicitação Enviada
                </p>
                <p className="mt-2 text-[26px] font-bold text-white leading-tight">
                  Aguardando{"\n"}Aprovação
                </p>
                <p className="mt-3 max-w-[260px] text-[13px] text-white/70">
                  O responsável pelo painel precisa autorizar o início fora do local.
                </p>
              </>
            ) : approvalPhase === "aprovado" ? (
              <>
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 14 }}
                  className="flex h-36 w-36 items-center justify-center rounded-full bg-white/20"
                  style={{ boxShadow: "0 0 0 14px rgba(255,255,255,0.09)" }}
                >
                  <Check className="h-24 w-24 text-white" strokeWidth={3} />
                </motion.div>
                <p className="mt-8 text-[13px] font-bold uppercase tracking-[0.2em] text-white/60">
                  Solicitação Aprovada
                </p>
                <p className="mt-2 text-[26px] font-bold text-white">Abrindo vistoria…</p>
              </>
            ) : approvalPhase === "reprovado" ? (
              <>
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 14 }}
                  className="flex h-36 w-36 items-center justify-center rounded-full bg-white/15"
                  style={{ boxShadow: "0 0 0 14px rgba(255,255,255,0.07)" }}
                >
                  <XCircle className="h-24 w-24 text-white" strokeWidth={2} />
                </motion.div>
                <p className="mt-8 text-[13px] font-bold uppercase tracking-[0.2em] text-white/60">
                  Solicitação Recusada
                </p>
                <p className="mt-2 text-[26px] font-bold text-white">Não autorizado</p>
                {reprovacaoMotivo ? (
                  <div className="mt-4 max-w-[300px] rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">Motivo</p>
                    <p className="mt-1 text-[14px] text-white/90">{reprovacaoMotivo}</p>
                  </div>
                ) : null}
              </>
            ) : concluida ? (
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
                  {rotaBloqueada ? (
                    <Lock className="h-9 w-9 text-white/80" />
                  ) : (
                    <LocateFixed className="h-9 w-9 text-white/80" />
                  )}
                </motion.div>
                <p className="mt-5 text-[13px] font-semibold uppercase tracking-[0.2em] text-white/55">
                  {rotaBloqueada ? "Preparando modo offline" : "Aguardando deslocamento"}
                </p>
                <p className="mt-2 max-w-[280px] text-[14px] text-white/70">
                  {rotaBloqueada
                    ? "Região com sinal de rede baixo identificada. Baixando informações da área automaticamente — a rota libera em instantes."
                    : distancia == null
                    ? "Obtendo sua localização…"
                    : `Você está a ${distancia} m do poste. Selecione a rota para começar o trajeto.`}
                </p>
                {rotaBloqueada && (
                  <div className="mt-4 h-1.5 w-[220px] overflow-hidden rounded-full bg-white/15">
                    <motion.div
                      className="h-full rounded-full bg-white"
                      animate={{ width: `${offlinePrep.progresso}%` }}
                      transition={{ duration: 0.25 }}
                    />
                  </div>
                )}
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
            {approvalPhase === "reprovado" && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-white/20 text-[16px] font-bold text-white"
              >
                Fechar
              </button>
            )}
            {approvalPhase === "idle" && error && (
              <p className="mb-3 text-center text-[13px] font-medium text-amber-200">
                {error}
              </p>
            )}

            {approvalPhase === "idle" && !concluida && hasCoord && fase === "verde" && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => iniciar()}
                  disabled={starting}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[16px] font-bold text-emerald-700 shadow-lg disabled:opacity-70"
                >
                  {starting ? "Iniciando…" : "Iniciar Vistoria"}
                </button>

                {/* Gate automático: 0 postes em 100m → recusar direto. 1+ → só oferece trocar de poste. */}
                {posteGate.fetched && posteGate.items.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecusarMotivoFixo("SEM_POSTES");
                      setRecusarOpen(true);
                    }}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600/90 text-[14px] font-bold text-white backdrop-blur"
                  >
                    <Ban className="h-4 w-4" />
                    Recusar vistoria
                  </button>
                )}
                {posteGate.fetched && posteGate.items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMudarPosteOpen(true)}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/15 text-[14px] font-bold text-white backdrop-blur"
                  >
                    <Wrench className="h-4 w-4" />
                    Poste bloqueado? Trocar de poste
                  </button>
                )}
              </div>
            )}

            {approvalPhase === "idle" && !concluida && hasCoord && fase !== "verde" && !overrideOpen && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleRota}
                  disabled={rotaBloqueada}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white/15 text-[16px] font-bold text-white backdrop-blur disabled:opacity-60"
                >
                  {rotaBloqueada ? (
                    <>
                      <Lock className="h-5 w-5" />
                      Baixando modo offline…
                    </>
                  ) : (
                    <>
                      <Navigation className="h-5 w-5" />
                      Selecionar rota
                    </>
                  )}
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
            {approvalPhase === "idle" && !concluida && hasCoord && overrideOpen && fase !== "verde" && (
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

          <MudarPosteFlow
            open={mudarPosteOpen}
            onClose={() => setMudarPosteOpen(false)}
            vistoriaId={vistoria.id}
            psposteAntigo={vistoria.fields?.pspostefield ?? ""}
            municipioAntigo={vistoria.cidade}
            latAtual={vistoria.latitude}
            lngAtual={vistoria.longitude}
            onApplied={() => {
              setMudarPosteOpen(false);
              onDataChanged?.();
              onClose();
            }}
            onNenhumAcessivel={() => {
              setRecusarMotivoFixo(undefined);
              setRecusarOpen(true);
            }}
          />

          <RecusarVistoriaFlow
            open={recusarOpen}
            vistoriaId={vistoria.id}
            equipamento={vistoria.equipamento}
            motivoFixo={recusarMotivoFixo}
            onClose={() => setRecusarOpen(false)}
            onAprovada={() => {
              setRecusarOpen(false);
              onDataChanged?.();
              onClose();
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
