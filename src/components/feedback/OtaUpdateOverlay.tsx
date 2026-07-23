"use client";

/**
 * OtaUpdateOverlay — tela cheia "Atualizando Aplicativo" durante o OTA.
 *
 * Aparece quando o useOtaUpdate detecta um bundle novo e começa a baixar.
 * Cobre todo o download com um anel de progresso 0→100% (progresso REAL vindo
 * dos eventos do capgo, com creep suave de fallback caso não venham eventos) e
 * segue a mesma linguagem visual cinematográfica do LoadingShell (teal escuro,
 * glow, logo). Ao aplicar, é a última coisa pintada antes do reload do WebView;
 * ao remontar no bundle novo, mostra "Tudo pronto ✓" e some com fade.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Check, WifiOff } from "lucide-react";
import { useOtaStore } from "@/store/ota";

const RING_R = 74;
const RING_C = 2 * Math.PI * RING_R;

export function OtaUpdateOverlay() {
  const phase = useOtaStore((s) => s.phase);
  const progresso = useOtaStore((s) => s.progresso);
  const paraVersao = useOtaStore((s) => s.paraVersao);

  // Creep de fallback: se o download não emite progresso (ou emite devagar),
  // a barra ainda "respira" avançando suavemente até ~90% — nunca trava.
  const [creep, setCreep] = useState(0);
  useEffect(() => {
    if (phase !== "baixando") {
      setCreep(0);
      return;
    }
    const id = window.setInterval(() => {
      setCreep((c) => (c < 90 ? c + Math.random() * 3.5 : c));
    }, 260);
    return () => window.clearInterval(id);
  }, [phase]);

  const pct = useMemo(() => {
    if (phase === "aplicando" || phase === "concluido") return 100;
    if (phase === "erro") return progresso;
    return Math.min(99, Math.max(progresso, creep)); // baixando: real vence, creep segura
  }, [phase, progresso, creep]);

  const visivel = phase !== "idle";
  const erro = phase === "erro";
  const concluido = phase === "concluido";

  const titulo = erro
    ? "Atualização adiada"
    : concluido
      ? "Tudo pronto!"
      : phase === "aplicando"
        ? "Aplicando atualização"
        : "Atualizando Aplicativo";

  const subtitulo = erro
    ? "Sem conexão agora — seguimos com a versão atual."
    : concluido
      ? "Aplicativo atualizado com sucesso."
      : phase === "aplicando"
        ? "Reiniciando com a nova versão…"
        : "Baixando a versão mais recente. Isso leva só um instante.";

  const accent = erro ? "#F98F6B" : "#5EFFD9";

  return (
    <AnimatePresence>
      {visivel && (
        <motion.div
          key="ota-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden"
          style={{
            background:
              "radial-gradient(ellipse 85% 60% at 50% 38%, #0A2828 0%, #051818 55%, #020F0F 100%)",
          }}
        >
          {/* glow ambiente pulsante */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              width: 520,
              height: 520,
              borderRadius: "9999px",
              background:
                "radial-gradient(circle, rgba(0,200,150,0.18) 0%, rgba(0,200,150,0.05) 45%, transparent 72%)",
              filter: "blur(50px)",
            }}
            animate={{ opacity: [0.55, 0.9, 0.55], scale: [0.96, 1.04, 0.96] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* anéis orbitais decorativos */}
          {!erro && (
            <>
              <motion.div
                aria-hidden
                className="pointer-events-none absolute rounded-full border"
                style={{ width: 300, height: 300, borderColor: "rgba(94,255,217,0.10)" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                aria-hidden
                className="pointer-events-none absolute rounded-full border"
                style={{ width: 240, height: 240, borderColor: "rgba(94,255,217,0.06)" }}
                animate={{ rotate: -360 }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              />
            </>
          )}

          <div className="relative flex flex-col items-center">
            {/* ── ANEL DE PROGRESSO ─────────────────────────────────── */}
            <div className="relative flex items-center justify-center" style={{ width: 188, height: 188 }}>
              <svg width="188" height="188" viewBox="0 0 188 188" className="-rotate-90">
                <defs>
                  <linearGradient id="ota-ring-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#5EFFD9" />
                    <stop offset="60%" stopColor="#00E0A8" />
                    <stop offset="100%" stopColor="#00B388" />
                  </linearGradient>
                  <filter id="ota-ring-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {/* trilho */}
                <circle
                  cx="94"
                  cy="94"
                  r={RING_R}
                  fill="none"
                  stroke="rgba(255,255,255,0.07)"
                  strokeWidth="7"
                />
                {/* progresso */}
                <motion.circle
                  cx="94"
                  cy="94"
                  r={RING_R}
                  fill="none"
                  stroke={erro ? "#F98F6B" : "url(#ota-ring-grad)"}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  filter="url(#ota-ring-glow)"
                  animate={{ strokeDashoffset: RING_C * (1 - pct / 100) }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </svg>

              {/* miolo: % / check / offline */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <AnimatePresence mode="wait">
                  {concluido ? (
                    <motion.div
                      key="done"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 220, damping: 14 }}
                    >
                      <Check className="h-16 w-16" strokeWidth={3} style={{ color: accent }} />
                    </motion.div>
                  ) : erro ? (
                    <motion.div
                      key="err"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 220, damping: 14 }}
                    >
                      <WifiOff className="h-14 w-14" strokeWidth={2} style={{ color: accent }} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="pct"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-baseline tabular-nums"
                    >
                      <span
                        className="text-[52px] font-bold leading-none"
                        style={{ color: "#EAFFF9" }}
                      >
                        {Math.round(pct)}
                      </span>
                      <span
                        className="ml-0.5 text-[20px] font-semibold"
                        style={{ color: "rgba(94,255,217,0.75)" }}
                      >
                        %
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ── LOGO ──────────────────────────────────────────────── */}
            <motion.div
              className="relative mt-8"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0 -m-2 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(0,200,150,0.4) 0%, rgba(0,200,150,0.08) 55%, transparent 78%)",
                  filter: "blur(10px)",
                }}
                animate={{ opacity: [0.5, 0.85, 0.5] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo_favicon.PNG`}
                alt="VistoMap"
                className="relative h-9 w-9 rounded-lg"
                style={{ objectFit: "contain" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </motion.div>

            {/* ── TEXTOS ────────────────────────────────────────────── */}
            <motion.h2
              key={titulo}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-5 text-[19px] font-bold tracking-tight"
              style={{ color: "#EAFFF9" }}
            >
              {titulo}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-1.5 max-w-[280px] text-center text-[13px]"
              style={{ color: "rgba(200,255,240,0.7)" }}
            >
              {subtitulo}
            </motion.p>

            {/* chip de versão */}
            {paraVersao && !erro && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mt-4 rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
                style={{
                  background: "rgba(94,255,217,0.08)",
                  color: "rgba(94,255,217,0.72)",
                  border: "1px solid rgba(94,255,217,0.14)",
                }}
              >
                Versão {paraVersao}
              </motion.div>
            )}
          </div>

          {/* vinheta inferior */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
            style={{ background: "linear-gradient(to top, rgba(2,15,15,0.6), transparent)" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
