"use client";

/**
 * OtaUpdateOverlay — tela cheia "Atualização em Andamento" durante o OTA.
 *
 * Aparece quando o useOtaUpdate detecta um bundle novo e começa a baixar.
 * Design: verde escuro premium + verde neon, glassmorphism, anel de
 * progresso com ícone de nuvem, cartão de benefícios e barra horizontal —
 * cobre todo o download (progresso REAL vindo dos eventos do capgo, com
 * creep suave de fallback). Ao aplicar, é a última coisa pintada antes do
 * reload do WebView; ao remontar no bundle novo, mostra "Tudo pronto ✓" e
 * some com fade.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Check, CloudUpload, Gauge, ShieldCheck, Sparkles, WifiOff } from "lucide-react";
import { useOtaStore } from "@/store/ota";

const RING_R = 78;
const RING_C = 2 * Math.PI * RING_R;

const BENEFITS = [
  { icon: ShieldCheck, title: "Segurança reforçada", desc: "Proteção de dados avançada" },
  { icon: Gauge, title: "Melhor desempenho", desc: "App mais rápido e fluido" },
  { icon: Sparkles, title: "Novas funcionalidades", desc: "Recursos exclusivos liberados" },
] as const;

/** Se travar nisso tudo (fica preso nesse tempo em "baixando"), mostra uma
 * saída manual — defesa extra além do timeout no próprio useOtaUpdate,
 * pra nunca deixar o técnico realmente sem saída na tela cheia. */
const ESCAPE_HATCH_MS = 25_000;

export function OtaUpdateOverlay() {
  const phase = useOtaStore((s) => s.phase);
  const progresso = useOtaStore((s) => s.progresso);
  const paraVersao = useOtaStore((s) => s.paraVersao);
  const reset = useOtaStore((s) => s.reset);

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

  const [showEscape, setShowEscape] = useState(false);
  useEffect(() => {
    if (phase !== "baixando" && phase !== "aplicando") {
      setShowEscape(false);
      return;
    }
    const id = window.setTimeout(() => setShowEscape(true), ESCAPE_HATCH_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  const pct = useMemo(() => {
    if (phase === "aplicando" || phase === "concluido") return 100;
    if (phase === "erro") return progresso;
    return Math.min(99, Math.max(progresso, creep));
  }, [phase, progresso, creep]);

  // "pausada" (trava de loop) tem tratamento próprio, pequeno e não-bloqueante
  // — ver o bloco no fim do componente. Não entra no fluxo de tela cheia.
  const visivel = phase !== "idle" && phase !== "pausada";
  const erro = phase === "erro";
  const concluido = phase === "concluido";

  const accent = erro ? "#FFB35A" : "#4DFF88";
  const accentSoft = erro ? "rgba(255,179,90,0.14)" : "rgba(77,255,136,0.14)";

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
              "radial-gradient(ellipse 90% 65% at 50% 34%, #0B5E3C 0%, #043322 46%, #021C12 100%)",
          }}
        >
          {/* ── ondas luminosas abstratas nas laterais ─────────────── */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -left-24 top-1/4"
            style={{
              width: 260,
              height: 480,
              borderRadius: "9999px",
              background:
                "radial-gradient(closest-side, rgba(77,255,136,0.22) 0%, rgba(77,255,136,0.05) 55%, transparent 80%)",
              filter: "blur(38px)",
            }}
            animate={{ y: [0, 26, 0], opacity: [0.6, 0.95, 0.6] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-24 bottom-1/4"
            style={{
              width: 240,
              height: 440,
              borderRadius: "9999px",
              background:
                "radial-gradient(closest-side, rgba(125,255,107,0.18) 0%, rgba(125,255,107,0.04) 55%, transparent 80%)",
              filter: "blur(36px)",
            }}
            animate={{ y: [0, -22, 0], opacity: [0.5, 0.85, 0.5] }}
            transition={{ duration: 6.2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          />

          {/* partículas discretas */}
          {[...Array(14)].map((_, i) => {
            const left = (i * 137) % 100;
            const top = (i * 71) % 100;
            const size = 1.4 + (i % 3) * 0.6;
            return (
              <motion.div
                key={i}
                aria-hidden
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: size,
                  height: size,
                  background: i % 3 === 0 ? "#7DFF6B" : "#4DFF88",
                  boxShadow: `0 0 ${4 + size}px rgba(77,255,136,0.8)`,
                }}
                animate={{ opacity: [0.15, 0.9, 0.15], scale: [0.8, 1.3, 0.8] }}
                transition={{
                  duration: 2.6 + (i % 5) * 0.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: (i % 7) * 0.35,
                }}
              />
            );
          })}

          {/* glow ambiente pulsante central */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              width: 460,
              height: 460,
              borderRadius: "9999px",
              background:
                "radial-gradient(circle, rgba(77,255,136,0.20) 0%, rgba(77,255,136,0.05) 45%, transparent 72%)",
              filter: "blur(46px)",
            }}
            animate={{ opacity: [0.5, 0.9, 0.5], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative flex w-full max-w-[380px] flex-col items-center px-6">
            {/* ── ANEL DE PROGRESSO (glassmorphism) ────────────────── */}
            <div className="relative flex items-center justify-center" style={{ width: 196, height: 196 }}>
              {/* disco de vidro fosco atrás do anel */}
              <div
                aria-hidden
                className="absolute rounded-full"
                style={{
                  width: 168,
                  height: 168,
                  background: "rgba(255,255,255,0.04)",
                  backdropFilter: "blur(6px)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "inset 0 1px 12px rgba(255,255,255,0.05)",
                }}
              />
              <svg width="196" height="196" viewBox="0 0 196 196" className="-rotate-90">
                <defs>
                  <linearGradient id="ota-ring-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7DFF6B" />
                    <stop offset="55%" stopColor="#4DFF88" />
                    <stop offset="100%" stopColor="#0B5E3C" />
                  </linearGradient>
                  <filter id="ota-ring-glow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="3.2" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <circle cx="98" cy="98" r={RING_R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
                <motion.circle
                  cx="98"
                  cy="98"
                  r={RING_R}
                  fill="none"
                  stroke={erro ? "#FFB35A" : "url(#ota-ring-grad)"}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  filter="url(#ota-ring-glow)"
                  animate={{ strokeDashoffset: RING_C * (1 - pct / 100) }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </svg>

              {/* miolo: ícone + % / check / offline */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
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
                      className="flex flex-col items-center"
                    >
                      <motion.div
                        animate={{ y: [0, -3, 0] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <CloudUpload
                          className="mb-1.5 h-7 w-7"
                          strokeWidth={1.8}
                          style={{ color: accent, filter: "drop-shadow(0 0 6px rgba(77,255,136,0.65))" }}
                        />
                      </motion.div>
                      <div className="flex items-baseline tabular-nums">
                        <span className="text-[44px] font-bold leading-none text-white">
                          {Math.round(pct)}
                        </span>
                        <span className="ml-0.5 text-[18px] font-semibold" style={{ color: accent }}>
                          %
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ── TÍTULO ────────────────────────────────────────────── */}
            <motion.h2
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="mt-6 text-center text-[19px] font-bold uppercase tracking-wide text-white"
            >
              {erro ? (
                "Atualização adiada"
              ) : concluido ? (
                <>
                  Tudo <span style={{ color: accent }}>pronto</span>
                </>
              ) : phase === "aplicando" ? (
                <>
                  Aplicando <span style={{ color: accent }}>atualização</span>
                </>
              ) : (
                <>
                  Atualização em <span style={{ color: accent }}>andamento</span>
                </>
              )}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.75 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-2 max-w-[300px] text-center text-[13px] leading-relaxed"
              style={{ color: "rgba(220,255,235,0.75)" }}
            >
              {erro
                ? "Sem conexão agora — seguimos com a versão atual."
                : concluido
                  ? "Aplicativo atualizado com sucesso."
                  : "Estamos instalando melhorias para oferecer uma experiência ainda mais rápida, segura e inteligente."}
            </motion.p>

            {/* ── CARTÃO DE BENEFÍCIOS (glassmorphism) ─────────────── */}
            {!erro && !concluido && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.18 }}
                className="mt-6 w-full rounded-2xl p-4"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  boxShadow: "0 8px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <div className="space-y-3">
                  {BENEFITS.map((b) => (
                    <div key={b.title} className="flex items-center gap-3">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: accentSoft }}
                      >
                        <b.icon className="h-4 w-4" style={{ color: accent }} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-semibold text-white">{b.title}</p>
                        <p className="text-[11px]" style={{ color: "rgba(210,225,220,0.6)" }}>
                          {b.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* chip de versão (concluído) */}
            {paraVersao && concluido && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="mt-5 rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
                style={{
                  background: accentSoft,
                  color: accent,
                  border: `1px solid ${accentSoft}`,
                }}
              >
                Versão {paraVersao}
              </motion.div>
            )}

            {/* ── BARRA DE PROGRESSO HORIZONTAL ────────────────────── */}
            {!concluido && !erro && (
              <div className="mt-6 w-full">
                <div
                  className="h-2 w-full overflow-hidden rounded-full"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: "linear-gradient(90deg, #0B5E3C 0%, #4DFF88 60%, #7DFF6B 100%)",
                      boxShadow: "0 0 12px rgba(77,255,136,0.75)",
                    }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
                <p
                  className="mt-3 text-center text-[11px]"
                  style={{ color: "rgba(200,220,210,0.55)" }}
                >
                  Não feche o aplicativo durante a atualização.
                </p>
                {showEscape && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => reset()}
                    className="mx-auto mt-4 block text-center text-[12px] font-semibold underline underline-offset-2"
                    style={{ color: "rgba(220,255,235,0.8)" }}
                  >
                    Está demorando? Continuar sem atualizar
                  </motion.button>
                )}
              </div>
            )}
          </div>

          {/* vinheta inferior */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-36"
            style={{ background: "linear-gradient(to top, rgba(1,12,8,0.65), transparent)" }}
          />
        </motion.div>
      )}

      {/* Aviso pequeno de "pausada" — nunca bloqueia a tela nem impede o
          técnico de usar o app; só existe pra ele não achar que nada tá
          acontecendo (ver OtaPhase.pausada em store/ota.ts). */}
      {phase === "pausada" && (
        <motion.div
          key="ota-paused-toast"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-x-4 z-[190] flex items-center gap-2.5 rounded-2xl px-4 py-3 shadow-lg"
          style={{
            bottom: "max(env(safe-area-inset-bottom), 16px)",
            background: "rgba(11,20,17,0.94)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(77,255,136,0.25)",
          }}
        >
          <CloudUpload className="h-4 w-4 shrink-0" style={{ color: "#4DFF88" }} strokeWidth={2} />
          <p className="text-[12px] leading-snug text-white/90">
            Atualização disponível — sinal instável agora, vamos tentar de novo em instantes.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
