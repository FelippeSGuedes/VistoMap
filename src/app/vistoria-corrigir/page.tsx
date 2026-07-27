"use client";

/**
 * /vistoria-corrigir?id=<id> — tela de correção de devolução.
 *
 * Rota por QUERY PARAM (mesmo motivo de /vistoria?id=): `/vistorias/[id]`
 * é excluído do build mobile (export estático não aceita segmento dinâmico
 * sem generateStaticParams), então essa tela fica FORA daquela pasta.
 *
 * Mostra SÓ os itens que o analista apontou como errados (fotos/vídeo e/ou
 * campos do formulário) — o resto da vistoria já enviada não é tocado.
 * Se algum item apontado for foto/vídeo, exige estar no local (mesmo raio
 * de 100m do fluxo normal) antes de liberar o formulário, com a saída
 * "Não posso deslocar agora" (aprovação do analista, mesmo mecanismo do
 * início fora do raio).
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle, Camera, Check, Clock, Loader2,
  Navigation as NavigationIcon, Send, Video, XCircle,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { LoadingShell } from "@/components/feedback/LoadingShell";
import { NavigationOptionsSheet } from "@/components/vistorias/NavigationOptionsSheet";
import { SelectField } from "@/components/vistorias/SelectField";
import { VideoRecorderSheet } from "@/components/vistorias/VideoRecorderSheet";
import { vistoriasService } from "@/services/vistorias";
import { api, type ApiError } from "@/services/api";
import {
  useDevolucaoStore,
  type DevolucaoPendente,
  type DevolucaoVistoria,
} from "@/store/devolucao";
import { DEVOLUCAO_DROPDOWN_FIELD, DEVOLUCAO_ITEM_LABEL, DEVOLUCAO_ITENS } from "@/lib/glpi/devolucaoItens";

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

type Fase =
  | "carregando"
  | "geofence"
  | "aguardando-aprovacao"
  | "form"
  | "enviando"
  | "concluido"
  | "erro-fatal";

function CorrigirDevolucaoInner() {
  const router = useRouter();
  const search = useSearchParams();
  const id = search.get("id") ?? undefined;

  const storeDevolucao = useDevolucaoStore((s) => s.devolucao);
  const storeVistoria = useDevolucaoStore((s) => s.vistoria);

  const [devolucao, setDevolucao] = useState<DevolucaoPendente | null>(null);
  const [vistoria, setVistoria] = useState<DevolucaoVistoria | null>(null);
  const [fase, setFase] = useState<Fase>("carregando");
  const [erroFatal, setErroFatal] = useState<string | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  const [navOpen, setNavOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<number | null>(null);
  const [reprovacaoMotivo, setReprovacaoMotivo] = useState<string | null>(null);

  const [campos, setCampos] = useState<Record<string, string>>({});
  const [arquivos, setArquivos] = useState<Record<string, Blob>>({});
  const [dropdownOptions, setDropdownOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [videoKeyRecording, setVideoKeyRecording] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  // 1) carrega a devolução (usa o store se já veio de lá, senão busca).
  useEffect(() => {
    if (!id) return;
    if (storeDevolucao && storeVistoria && String(storeDevolucao.vistoriaId) === String(id)) {
      setDevolucao(storeDevolucao);
      setVistoria(storeVistoria);
      setFase(storeDevolucao.precisaDeslocamento ? "geofence" : "form");
      return;
    }
    (async () => {
      try {
        const { data } = await api.get<{ devolucao: DevolucaoPendente | null; vistoria: DevolucaoVistoria | null }>(
          "/vistorias/devolucao-pendente"
        );
        if (!data.devolucao || String(data.devolucao.vistoriaId) !== String(id)) {
          setErroFatal("Não há devolução pendente para essa vistoria.");
          setFase("erro-fatal");
          return;
        }
        setDevolucao(data.devolucao);
        setVistoria(data.vistoria);
        setFase(data.devolucao.precisaDeslocamento ? "geofence" : "form");
      } catch {
        setErroFatal("Falha ao carregar a devolução.");
        setFase("erro-fatal");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 2) GPS ao vivo durante o geofence.
  useEffect(() => {
    if (fase !== "geofence" || typeof navigator === "undefined" || !navigator.geolocation) return;
    const wid = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { /* segue sem posição — mostra "obtendo localização" */ },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 }
    );
    return () => navigator.geolocation.clearWatch(wid);
  }, [fase]);

  const distancia = useMemo(() => {
    if (!pos || !vistoria?.latitude || !vistoria?.longitude) return null;
    return distanciaMetros(pos, { lat: vistoria.latitude, lng: vistoria.longitude });
  }, [pos, vistoria]);

  useEffect(() => {
    if (fase === "geofence" && distancia != null && distancia <= RAIO_M) setFase("form");
  }, [fase, distancia]);

  // 3) polling da aprovação de "não posso deslocar agora".
  useEffect(() => {
    if (fase !== "aguardando-aprovacao" || !pendingRequestId || !id) return;
    const poll = async () => {
      try {
        const { data } = await api.get<{ status: string; motivo?: string }>(
          `/vistorias/${id}/override-request?requestId=${pendingRequestId}`
        );
        if (data.status === "APROVADO") {
          setFase("form");
        } else if (data.status === "REPROVADO") {
          setReprovacaoMotivo(data.motivo ?? null);
          setFase("geofence");
        }
      } catch { /* rede ruim — tenta no próximo ciclo */ }
    };
    const iid = window.setInterval(poll, 3000);
    return () => window.clearInterval(iid);
  }, [fase, pendingRequestId, id]);

  async function handleNaoPossoDeslocar() {
    if (!justificativa.trim() || !id) return;
    setOverrideLoading(true);
    try {
      const { data } = await api.post<{ requestId: number }>(`/vistorias/${id}/nao-posso-deslocar`, {
        justificativa: justificativa.trim(),
      });
      setPendingRequestId(data.requestId);
      setOverrideOpen(false);
      setFase("aguardando-aprovacao");
    } catch (err) {
      const msg = (err as ApiError).response?.data?.message;
      setErroEnvio(msg ?? "Falha ao enviar a solicitação. Tente de novo.");
    } finally {
      setOverrideLoading(false);
    }
  }

  // 4) opções de dropdown pros campos que precisam.
  useEffect(() => {
    if (!devolucao) return;
    devolucao.itens
      .filter((k) => DEVOLUCAO_DROPDOWN_FIELD[k])
      .forEach((k) => {
        vistoriasService.fetchDropdownOptions(DEVOLUCAO_DROPDOWN_FIELD[k]).then((opts) => {
          setDropdownOptions((cur) => ({
            ...cur,
            [k]: opts.map((o) => ({ value: o.name, label: o.name })),
          }));
        });
      });
  }, [devolucao]);

  const fotosApontadas = useMemo(
    () => devolucao?.itens.filter((k) => DEVOLUCAO_ITENS.find((i) => i.key === k)?.tipo === "foto") ?? [],
    [devolucao]
  );
  const camposApontados = useMemo(
    () => devolucao?.itens.filter((k) => DEVOLUCAO_ITENS.find((i) => i.key === k)?.tipo === "campo") ?? [],
    [devolucao]
  );

  const podeEnviar =
    fotosApontadas.every((k) => !!arquivos[k]) &&
    camposApontados.every((k) => (campos[k] ?? "").trim().length > 0);

  async function handleEnviar() {
    if (!id || !podeEnviar) return;
    setFase("enviando");
    setErroEnvio(null);
    try {
      await vistoriasService.corrigirDevolucao(id, campos, arquivos);
      setFase("concluido");
      window.setTimeout(() => router.push("/vistorias"), 1800);
    } catch (err) {
      const msg = (err as ApiError).response?.data?.message;
      setErroEnvio(msg ?? "Falha ao enviar a correção. Verifique a conexão e tente de novo.");
      setFase("form");
    }
  }

  if (fase === "carregando") return <LoadingShell label="Carregando devolução" />;

  if (fase === "erro-fatal") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-brand-ice">
        <AppHeader backHref="/vistorias" title="Correção" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <XCircle className="h-10 w-10 text-red-400" />
          <p className="text-[14px] font-medium text-ink-muted">{erroFatal}</p>
        </div>
      </div>
    );
  }

  if (!devolucao || !vistoria) return <LoadingShell label="Carregando devolução" />;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-brand-ice">
      <AppHeader backHref="/vistorias" title="Corrigir vistoria" subtitle={vistoria.equipamento} />

      {/* ── GEOFENCE ─────────────────────────────────────────────── */}
      {fase === "geofence" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <NavigationIcon className="h-7 w-7 text-amber-600" />
          </span>
          <div>
            <p className="text-[16px] font-bold text-ink">Vá até o equipamento</p>
            <p className="mt-1 max-w-[280px] text-[13px] text-ink-muted">
              {distancia == null
                ? "Obtendo sua localização…"
                : `Você está a ${distancia} m — precisa chegar a até ${RAIO_M} m pra corrigir a foto/vídeo.`}
            </p>
          </div>
          {reprovacaoMotivo && (
            <div className="w-full max-w-[300px] rounded-2xl bg-red-50 px-4 py-3 text-left">
              <p className="text-[11px] font-bold uppercase tracking-wide text-red-700">Solicitação recusada</p>
              <p className="mt-1 text-[13px] text-red-800">{reprovacaoMotivo}</p>
            </div>
          )}
          <div className="mt-2 w-full max-w-[300px] space-y-2">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-emerald text-[14px] font-bold text-[#073B4C]"
            >
              <NavigationIcon className="h-4 w-4" />
              Selecionar rota
            </button>
            {!overrideOpen ? (
              <button
                type="button"
                onClick={() => setOverrideOpen(true)}
                className="w-full py-2 text-center text-[12.5px] font-medium text-ink-muted underline-offset-2 hover:underline"
              >
                Não posso deslocar agora
              </button>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-left">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                  Explique o motivo
                </p>
                <textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  rows={2}
                  placeholder="Ex.: sem transporte disponível hoje, acesso interditado…"
                  className="w-full resize-none rounded-xl border border-amber-200 bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-amber-400"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOverrideOpen(false)}
                    className="h-10 flex-1 rounded-xl bg-white text-[13px] font-semibold text-ink-muted"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={justificativa.trim().length < 4 || overrideLoading}
                    onClick={handleNaoPossoDeslocar}
                    className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 text-[13px] font-bold text-white disabled:opacity-50"
                  >
                    {overrideLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Enviar
                  </button>
                </div>
              </div>
            )}
            {erroEnvio && <p className="text-[12px] text-red-500">{erroEnvio}</p>}
          </div>
          <NavigationOptionsSheet
            open={navOpen}
            onClose={() => setNavOpen(false)}
            lat={vistoria.latitude ?? 0}
            lng={vistoria.longitude ?? 0}
            label={vistoria.equipamento}
          />
        </div>
      )}

      {/* ── AGUARDANDO APROVAÇÃO ────────────────────────────────────── */}
      {fase === "aguardando-aprovacao" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100"
          >
            <Clock className="h-9 w-9 text-amber-600" />
          </motion.div>
          <p className="text-[15px] font-bold text-ink">Aguardando aprovação</p>
          <p className="max-w-[280px] text-[13px] text-ink-muted">
            O responsável pelo painel precisa autorizar o adiamento. A devolução continua pendente
            até você conseguir corrigir.
          </p>
        </div>
      )}

      {/* ── FORMULÁRIO ───────────────────────────────────────────────── */}
      {fase === "form" || fase === "enviando" || fase === "concluido" ? (
        fase === "concluido" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100"
            >
              <Check className="h-8 w-8 text-emerald-600" />
            </motion.span>
            <p className="text-[15px] font-bold text-ink">Correção enviada!</p>
            <p className="text-[13px] text-ink-muted">A vistoria volta pra fila normal.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 pb-28 pt-3">
            {devolucao.motivos.length > 0 && (
              <div className="mb-4 rounded-2xl bg-red-50 px-3.5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">Motivo da devolução</p>
                <p className="mt-0.5 text-[13px] text-red-800">
                  {devolucao.motivos
                    .map((m) => (m === "Outro" ? devolucao.motivoOutro || "Outro" : m))
                    .join(" · ")}
                </p>
              </div>
            )}

            {fotosApontadas.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  <Camera className="h-3 w-3" /> Fotos e vídeo pra refazer
                </p>
                <div className="space-y-2">
                  {fotosApontadas.map((key) => {
                    const done = !!arquivos[key];
                    const isVideo = key === "video360";
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-3 rounded-2xl border border-brand-steel/70 bg-white/80 px-3.5 py-3"
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            done ? "bg-emerald-100 text-emerald-600" : "bg-brand-ice text-brand-deep"
                          }`}
                        >
                          {done ? <Check className="h-5 w-5" /> : isVideo ? <Video className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-ink">
                            {DEVOLUCAO_ITEM_LABEL[key] ?? key}
                          </p>
                          <p className="text-[11.5px] text-ink-muted">{done ? "Capturado" : "Pendente"}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (isVideo) setVideoKeyRecording(key);
                            else fileInputs.current[key]?.click();
                          }}
                          className="shrink-0 rounded-xl bg-brand-emerald px-3.5 py-2 text-[12.5px] font-bold text-[#073B4C]"
                        >
                          {done ? "Refazer" : "Capturar"}
                        </button>
                        {!isVideo && (
                          <input
                            ref={(el) => { fileInputs.current[key] = el; }}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) setArquivos((cur) => ({ ...cur, [key]: f }));
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {camposApontados.length > 0 && (
              <div className="mb-4 space-y-2.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Campos pra corrigir
                </p>
                {camposApontados.map((key) => {
                  const label = DEVOLUCAO_ITEM_LABEL[key] ?? key;
                  const dropdownKey = DEVOLUCAO_DROPDOWN_FIELD[key];
                  if (dropdownKey) {
                    return (
                      <SelectField
                        key={key}
                        label={label}
                        value={campos[key] ?? ""}
                        options={dropdownOptions[key] ?? []}
                        onChange={(v) => setCampos((cur) => ({ ...cur, [key]: v }))}
                      />
                    );
                  }
                  if (key === "observacao") {
                    return (
                      <div key={key} className="rounded-2xl border border-brand-steel/70 bg-white/80 px-3.5 py-2.5">
                        <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                          {label}
                        </label>
                        <textarea
                          value={campos[key] ?? ""}
                          onChange={(e) => setCampos((cur) => ({ ...cur, [key]: e.target.value }))}
                          rows={3}
                          className="mt-1 w-full resize-none bg-transparent text-[14px] text-ink outline-none"
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={key} className="rounded-2xl border border-brand-steel/70 bg-white/80 px-3.5 py-2.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                        {label}
                      </label>
                      <input
                        value={campos[key] ?? ""}
                        onChange={(e) => setCampos((cur) => ({ ...cur, [key]: e.target.value }))}
                        className="mt-0.5 w-full bg-transparent text-[14px] font-medium text-ink outline-none"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {erroEnvio && (
              <div className="mb-3 flex items-center gap-2 rounded-2xl bg-red-50 px-3.5 py-3 text-[12.5px] text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {erroEnvio}
              </div>
            )}

            <div className="fixed inset-x-0 bottom-0 border-t border-brand-steel/40 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 backdrop-blur">
              <button
                type="button"
                disabled={!podeEnviar || fase === "enviando"}
                onClick={handleEnviar}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-emerald text-[14px] font-bold text-[#073B4C] disabled:opacity-50"
              >
                {fase === "enviando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {fase === "enviando" ? "Enviando…" : "Enviar correção"}
              </button>
            </div>
          </div>
        )
      ) : null}

      {vistoria.latitude != null && vistoria.longitude != null && (
        <VideoRecorderSheet
          open={!!videoKeyRecording}
          onClose={() => setVideoKeyRecording(null)}
          onCapture={(file) => {
            if (videoKeyRecording) setArquivos((cur) => ({ ...cur, [videoKeyRecording]: file }));
            setVideoKeyRecording(null);
          }}
          onFallback={() => setVideoKeyRecording(null)}
        />
      )}
    </div>
  );
}

export default function CorrigirDevolucaoPage() {
  return (
    <Suspense fallback={<LoadingShell label="Carregando devolução" />}>
      <CorrigirDevolucaoInner />
    </Suspense>
  );
}
