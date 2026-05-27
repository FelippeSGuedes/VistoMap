"use client";

/**
 * LoadingShell — preloader cinematográfico VistoMap.
 *
 * Conceito: começa como uma rede urbana abstrata (hubs + conexões) e a
 * malha vai progressivamente se reorganizando para revelar a palavra
 * "VistoMap". No final, o logo favicon entra com glow teal.
 *
 * Duração total ~2.6s — depois um fade out elegante.
 * Inspirações: Tesla UI, Apple Motion, dashboards de smart city.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

interface LoadingShellProps {
  /** Texto opcional abaixo da animação (default: nada — visual fala por si). */
  label?: string;
}

/* ── Letter paths — VISTOMAP em SVG paths simples ─────────────────────
 * Coords baseadas em viewBox 480×160, letras altura 50, baseline y=80.
 * Cada path é uma "edge" desenhada via stroke-dashoffset.
 */
const LETTER_PATHS: { d: string; len: number; delay: number }[] = [
  // V (x=117..143)
  { d: "M117,30 L130,80", len: 52, delay: 0.0 },
  { d: "M130,80 L143,30", len: 52, delay: 0.04 },
  // I (x=151..159)
  { d: "M155,30 L155,80", len: 50, delay: 0.08 },
  // S (x=167..189) — quatro segmentos curvos
  { d: "M189,36 Q178,28 167,36 Q167,48 178,55", len: 38, delay: 0.12 },
  { d: "M178,55 Q189,62 189,72 Q178,80 167,72", len: 38, delay: 0.16 },
  // T (x=197..221)
  { d: "M197,30 L221,30", len: 24, delay: 0.20 },
  { d: "M209,30 L209,80", len: 50, delay: 0.24 },
  // O (x=229..257) — círculo cheio aproximado por dois arcs
  { d: "M243,30 C257,30 257,80 243,80", len: 60, delay: 0.28 },
  { d: "M243,80 C229,80 229,30 243,30", len: 60, delay: 0.32 },
  // M (x=265..297)
  { d: "M265,80 L265,30", len: 50, delay: 0.36 },
  { d: "M265,30 L281,58", len: 33, delay: 0.40 },
  { d: "M281,58 L297,30", len: 33, delay: 0.44 },
  { d: "M297,30 L297,80", len: 50, delay: 0.48 },
  // A (x=305..333)
  { d: "M305,80 L319,30", len: 52, delay: 0.52 },
  { d: "M319,30 L333,80", len: 52, delay: 0.56 },
  { d: "M310,60 L328,60", len: 18, delay: 0.62 },
  // P (x=341..363)
  { d: "M341,80 L341,30", len: 50, delay: 0.64 },
  { d: "M341,30 L355,30 Q363,30 363,42 Q363,55 355,55 L341,55", len: 56, delay: 0.68 },
];

/** Vértices "hubs" — pontos que pulsam discretamente em interseções. */
const LETTER_HUBS: Array<[number, number]> = [
  [117, 30], [130, 80], [143, 30], [155, 30], [155, 80],
  [189, 36], [167, 72], [197, 30], [221, 30], [209, 80],
  [243, 30], [243, 80], [265, 30], [265, 80], [281, 58],
  [297, 30], [297, 80], [305, 80], [319, 30], [333, 80],
  [341, 30], [341, 80], [363, 42],
];

/** Pontos "extras" — hubs espalhados que dão sensação de rede urbana abstrata
 *  antes do reveal. Eles aparecem cedo e somem antes do logo. */
const EXTRA_HUBS: Array<[number, number]> = [
  [50, 50], [80, 105], [40, 130], [160, 110], [220, 125],
  [290, 110], [350, 125], [410, 50], [450, 100], [440, 130],
  [95, 35], [395, 35],
];

/** Linhas "rede urbana" — conectam alguns dos extras + hubs.
 *  Aparecem antes da palavra, somem antes do reveal. */
const NETWORK_LINES: Array<[number, number, number, number]> = [
  [50, 50, 117, 30],
  [80, 105, 130, 80],
  [40, 130, 80, 105],
  [220, 125, 281, 58],
  [290, 110, 297, 80],
  [350, 125, 333, 80],
  [410, 50, 363, 42],
  [450, 100, 410, 50],
  [95, 35, 155, 30],
  [395, 35, 333, 80],
];

export function LoadingShell({ label }: LoadingShellProps) {
  // Controla saída final — depois de ~2.8s, o shell se prepara pra desmontar.
  const [phase, setPhase] = useState<"animating" | "settled">("animating");
  useEffect(() => {
    const t = window.setTimeout(() => setPhase("settled"), 2400);
    return () => window.clearTimeout(t);
  }, []);

  // IDs únicos pra gradientes/filters (evita conflito no SSR/HMR).
  const ids = useMemo(
    () => ({
      noise: `vm-noise-${Math.random().toString(36).slice(2, 8)}`,
      glowTeal: `vm-glow-teal-${Math.random().toString(36).slice(2, 8)}`,
      letterGrad: `vm-letter-grad-${Math.random().toString(36).slice(2, 8)}`,
    }),
    []
  );

  return (
    <div
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 40%, #0A2828 0%, #051818 55%, #020F0F 100%)",
      }}
    >
      {/* NOISE SUTIL — cinematográfico, baixíssima opacidade */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06] mix-blend-screen">
        <defs>
          <filter id={ids.noise}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter={`url(#${ids.noise})`} />
      </svg>

      {/* Glow ambient teal no centro */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 600,
          height: 280,
          background:
            "radial-gradient(ellipse 60% 80% at 50% 50%, rgba(0,200,150,0.16) 0%, rgba(0,200,150,0.04) 50%, transparent 80%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative flex flex-col items-center gap-6">
        {/* ── SVG cinemático ─────────────────────────────────────────── */}
        <svg
          viewBox="0 0 480 160"
          width="320"
          height="107"
          className="overflow-visible"
        >
          <defs>
            {/* gradiente das letras: teal claro → branco */}
            <linearGradient id={ids.letterGrad} x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#5EFFD9" stopOpacity="0.95" />
              <stop offset="55%" stopColor="#FFFFFF" stopOpacity="1" />
              <stop offset="100%" stopColor="#00B388" stopOpacity="0.9" />
            </linearGradient>
            {/* glow filter para path das letras */}
            <filter id={ids.glowTeal} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 1. LINHAS DA REDE URBANA (fase abstrata, fade out antes das letras) */}
          {NETWORK_LINES.map(([x1, y1, x2, y2], i) => (
            <motion.line
              key={`net-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(94,255,217,0.32)"
              strokeWidth="0.6"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: [0, 1, 1, 1],
                opacity: [0, 0.55, 0.55, 0],
              }}
              transition={{
                duration: 1.4,
                times: [0, 0.35, 0.6, 1],
                delay: 0.15 + i * 0.05,
                ease: "easeInOut",
              }}
            />
          ))}

          {/* 2. EXTRA HUBS — pontos espalhados que dão sensação de rede urbana */}
          {EXTRA_HUBS.map(([cx, cy], i) => (
            <motion.circle
              key={`xhub-${i}`}
              cx={cx}
              cy={cy}
              r="1.6"
              fill="rgba(94,255,217,0.85)"
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, 0.9, 0.9, 0],
                scale: [0, 1, 1, 0.6],
              }}
              transition={{
                duration: 1.8,
                times: [0, 0.2, 0.65, 1],
                delay: 0.05 + i * 0.04,
                ease: "easeOut",
              }}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
            />
          ))}

          {/* 3. PATHS DAS LETRAS VISTOMAP — stroke draw progressivo */}
          {LETTER_PATHS.map((p, i) => (
            <motion.path
              key={`letter-${i}`}
              d={p.d}
              stroke={`url(#${ids.letterGrad})`}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              filter={`url(#${ids.glowTeal})`}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{
                pathLength: { duration: 0.85, delay: 0.9 + p.delay, ease: [0.22, 0.7, 0.2, 1] },
                opacity: { duration: 0.3, delay: 0.9 + p.delay },
              }}
            />
          ))}

          {/* 4. LETTER HUBS — pulsam discretamente quando as letras se formam */}
          {LETTER_HUBS.map(([cx, cy], i) => (
            <motion.circle
              key={`lhub-${i}`}
              cx={cx}
              cy={cy}
              r="2"
              fill="#5EFFD9"
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, 1, 0.6, 1, 0.6],
                scale: [0, 1.2, 1, 1.15, 1],
              }}
              transition={{
                duration: 1.8,
                delay: 1.4 + i * 0.02,
                times: [0, 0.25, 0.5, 0.75, 1],
                ease: "easeInOut",
              }}
              style={{
                transformOrigin: `${cx}px ${cy}px`,
                filter: "drop-shadow(0 0 4px rgba(94,255,217,0.7))",
              }}
            />
          ))}

          {/* 5. SUBLINHA decorativa fina — pousa abaixo do nome */}
          <motion.line
            x1="180"
            y1="105"
            x2="300"
            y2="105"
            stroke="rgba(94,255,217,0.5)"
            strokeWidth="0.8"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.7, 0.7] }}
            transition={{ duration: 0.8, delay: 1.9, ease: "easeOut" }}
          />
          <motion.text
            x="240"
            y="121"
            textAnchor="middle"
            fontSize="9"
            fontWeight="600"
            letterSpacing="3"
            fill="rgba(94,255,217,0.85)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 2.05 }}
            style={{ fontFamily: "ui-sans-serif, system-ui" }}
          >
            FIELD OPS
          </motion.text>
        </svg>

        {/* ── LOGO favicon premium ─────────────────────────────────── */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 1.7, ease: [0.22, 0.7, 0.2, 1] }}
        >
          {/* glow teal atrás do logo */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 -m-3 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(0,200,150,0.45) 0%, rgba(0,200,150,0.10) 50%, transparent 75%)",
              filter: "blur(12px)",
            }}
            animate={{ opacity: [0.5, 0.85, 0.5] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo_favicon.PNG`}
            alt="VistoMap"
            className="relative h-10 w-10 rounded-xl"
            style={{ objectFit: "contain" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </motion.div>

        {/* ── label opcional ────────────────────────────────────────── */}
        <AnimatePresence>
          {label && phase === "animating" && (
            <motion.p
              key="label"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 0.7, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, delay: 2.0 }}
              className="text-[10.5px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: "rgba(94,255,217,0.7)" }}
            >
              {label}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* vinheta inferior — finalização cinematográfica */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
        style={{
          background:
            "linear-gradient(to top, rgba(2,15,15,0.6), transparent)",
        }}
      />
    </div>
  );
}
