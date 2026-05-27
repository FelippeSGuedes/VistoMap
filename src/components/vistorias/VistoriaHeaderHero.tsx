"use client";

/**
 * VistoriaHeaderHero — cabeçalho cinematográfico usado pelo PinSheet e pelo
 * ExecucaoForm. Múltiplos overlays sobre /fundo_img.png + animações premium
 * (fog drift, shimmer no highlight, glow pulsante, image parallax sutil).
 */

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import type { Vistoria } from "@/types";

interface VistoriaHeaderHeroProps {
  vistoria: Vistoria;
  /** Quando passado, renderiza botão X no canto direito superior. */
  onClose?: () => void;
  /** Altura customizável (em px). Default 132. */
  height?: number;
}

export function VistoriaHeaderHero({
  vistoria,
  onClose,
  height = 132,
}: VistoriaHeaderHeroProps) {
  return (
    <div
      className="group relative overflow-hidden"
      style={{ isolation: "isolate", height }}
    >
      {/* ── IMG base — parallax sutil + filter cinematográfico ──────── */}
      <motion.img
        src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/fundo_img.png`}
        alt=""
        aria-hidden
        initial={{ scale: 1.12, opacity: 0 }}
        animate={{ scale: 1.04, opacity: 1 }}
        transition={{ duration: 1.6, ease: [0.22, 0.7, 0.2, 1] }}
        whileHover={{ scale: 1.08, transition: { duration: 1.2 } }}
        className="absolute inset-0 h-full w-full"
        style={{
          objectFit: "cover",
          objectPosition: "center 45%",
          filter:
            "brightness(0.62) contrast(1.12) saturate(0.92) hue-rotate(-4deg)",
          zIndex: 0,
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      {/* fallback bg quando img falha */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          zIndex: -1,
          background:
            "linear-gradient(135deg, #021F1F 0%, #042B2B 50%, #073838 100%)",
        }}
      />

      {/* 1. Gradiente escuro lateral — escurecimento progressivo esquerdo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 1,
          background:
            "linear-gradient(to right, " +
              "rgba(2,18,18,0.88) 0%, " +
              "rgba(2,18,18,0.74) 28%, " +
              "rgba(2,18,18,0.48) 50%, " +
              "rgba(2,18,18,0.22) 72%, " +
              "rgba(2,18,18,0.10) 90%, " +
              "rgba(2,18,18,0) 100%)",
        }}
      />

      {/* 2. Overlay teal screen-blend — integra atmosfera tecnológica */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 2,
          background:
            "linear-gradient(135deg, rgba(0,179,136,0.12) 0%, rgba(0,179,136,0) 60%)",
          mixBlendMode: "screen",
        }}
      />

      {/* 3. Fog drifting — duas camadas que oscilam infinitamente */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 3,
          background:
            "radial-gradient(ellipse 55% 75% at 22% 100%, rgba(255,255,255,0.06) 0%, transparent 60%)",
        }}
        animate={{ x: [-10, 14, -10], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 3,
          background:
            "radial-gradient(ellipse 65% 95% at 105% -5%, rgba(94,255,217,0.08) 0%, transparent 55%)",
        }}
        animate={{ x: [8, -12, 8], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 4. Glow teal pulsante — canto inferior-direito */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -right-10 h-48 w-48 rounded-full blur-[42px]"
        style={{ background: "rgba(0,200,150,0.22)", zIndex: 3 }}
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.55, 0.85, 0.55],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 5. Shimmer no highlight superior — varredura horizontal */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden"
        style={{ zIndex: 4 }}
      >
        <div
          className="h-full w-full"
          style={{
            background:
              "linear-gradient(to right, transparent, rgba(0,200,150,0.45), transparent)",
          }}
        />
        <motion.div
          className="absolute inset-y-0 w-[40%]"
          style={{
            background:
              "linear-gradient(to right, transparent, rgba(94,255,217,0.85), transparent)",
          }}
          initial={{ x: "-100%" }}
          animate={{ x: "260%" }}
          transition={{
            duration: 4.2,
            repeat: Infinity,
            repeatDelay: 2.5,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* 6. Scanline ambient — ultra-sutil, dá tech feel */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          zIndex: 4,
          background:
            "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(255,255,255,0.6) 2px, rgba(255,255,255,0.6) 3px)",
        }}
      />

      {/* CONTEÚDO — entrada com spring delicada */}
      <header className="relative z-10 flex h-full items-start justify-between gap-3 px-5 py-4">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 0.7, 0.2, 1], delay: 0.1 }}
          className="min-w-0 flex-1"
        >
          {/* TAG — antes era "GLPI · NE-3", agora "VISTORIA · NE-3" */}
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "#5EFFD9" }}
          >
            <motion.span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: "#5EFFD9",
                boxShadow: "0 0 8px rgba(94,255,217,0.7)",
              }}
              animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.15, 0.9] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
            Vistoria · {vistoria.glpiId}
          </span>
          <motion.h3
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut", delay: 0.22 }}
            className="mt-1.5 truncate text-[19px] font-semibold tracking-[-0.4px] text-white"
            style={{
              textShadow:
                "0 1px 12px rgba(0,0,0,0.55), 0 0 24px rgba(0,200,150,0.15)",
            }}
          >
            {vistoria.equipamento}
          </motion.h3>
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-2 flex flex-wrap items-center gap-1.5"
          >
            <StatusBadge status={vistoria.status} />
            <PriorityBadge priority={vistoria.prioridade} />
          </motion.div>
        </motion.div>

        {onClose && (
          <motion.button
            type="button"
            onClick={onClose}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            whileTap={{ scale: 0.9 }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:text-white"
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.18)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <X className="h-4 w-4" />
          </motion.button>
        )}
      </header>
    </div>
  );
}
