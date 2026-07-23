"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { compressImage } from "@/utils/image";
import { cn } from "@/utils/cn";
import type { CaptureBundle } from "@/types";
import { VideoRecorderSheet } from "./VideoRecorderSheet";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

type StepKey = "imagem1" | "imagem2" | "imagem3" | "video360" | "imagem4" | "imagem5";

interface StepDef {
  key: StepKey;
  title: string;
  objective: string;
  instruction: string;
  filename: string;
  kind: "photo" | "video" | "upload";
  capture?: "environment" | "user" | undefined;
  resolution?: { w: number; h: number };
  brand?: "vivo" | "claro";
}

const STEPS: StepDef[] = [
  {
    key: "imagem1",
    title: "Poste completo",
    objective: "Foto vertical do poste, da base ao topo",
    instruction:
      "Tire uma foto contendo o poste completo, desde a base até o topo.",
    filename: "imagem1.png",
    kind: "photo",
    capture: "environment",
    resolution: { w: 342, h: 453 },
  },
  {
    key: "imagem2",
    title: "Detalhe do topo",
    objective: "Zoom nos transformadores e equipamentos no topo",
    instruction: "Aproxime a câmera e capture os detalhes do topo do poste.",
    filename: "imagem2.png",
    kind: "photo",
    capture: "environment",
    resolution: { w: 180, h: 236 },
  },
  {
    key: "imagem3",
    title: "Vista horizontal",
    objective: "Foto deitada com o poste, os postes vizinhos e a infraestrutura",
    instruction:
      "Vire o celular na HORIZONTAL e enquadre o poste junto com os postes adjacentes e a infraestrutura ao redor.",
    filename: "imagem3.png",
    kind: "photo",
    capture: "environment",
    resolution: { w: 453, h: 342 },
  },
  {
    key: "video360",
    title: "Vídeo 360°",
    objective: "Caminhe ao redor do poste mantendo-o centralizado",
    instruction:
      "Inicie pela esquerda da rua e caminhe em sentido horário mantendo o poste centralizado.",
    filename: "video360.mp4",
    kind: "video",
    capture: "environment",
  },
  {
    key: "imagem4",
    title: "Print Vivo",
    objective: "Captura de tela do teste de sinal Vivo",
    instruction: "Faça upload do print da operadora Vivo.",
    filename: "imagem4.png",
    kind: "upload",
    brand: "vivo",
  },
  {
    key: "imagem5",
    title: "Print Claro",
    objective: "Captura de tela do teste de sinal Claro",
    instruction: "Faça upload do print da operadora Claro.",
    filename: "imagem5.png",
    kind: "upload",
    brand: "claro",
  },
];

/* ------------------------------------------------------------------ */
/*  Sound + Vibration helpers                                          */
/* ------------------------------------------------------------------ */

let audioCtx: AudioContext | null = null;
function chime(freq = 880, duration = 0.15) {
  if (typeof window === "undefined") return;
  try {
    audioCtx ||= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain).connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    /* ignore */
  }
}
function buzz(pattern: number | number[] = 60) {
  if (typeof navigator === "undefined") return;
  if ("vibrate" in navigator) navigator.vibrate(pattern);
}

/* ------------------------------------------------------------------ */
/*  Image validation                                                   */
/* ------------------------------------------------------------------ */

type Feedback =
  | { tone: "ok"; message: string }
  | { tone: "warn"; message: string }
  | { tone: "error"; message: string };

interface LoadedImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  size: number;
}

/** Dados estampados nas fotos (lat/lng/data/técnico) + logo no canto. */
export interface WatermarkInfo {
  lat?: number;
  lng?: number;
  vistoriador?: string;
}

/** Cache module-level do logo carregado — evita re-decode em cada foto. */
let LOGO_PROMISE: Promise<HTMLImageElement | null> | null = null;
function loadLogo(): Promise<HTMLImageElement | null> {
  if (LOGO_PROMISE) return LOGO_PROMISE;
  LOGO_PROMISE = new Promise((resolve) => {
    // Tenta múltiplas variações de casing (Linux case-sensitive).
    const candidatos = ["/logo-marca.PNG", "/logo-marca.png", "/logo_app.png"];
    let i = 0;
    const tentar = () => {
      if (i >= candidatos.length) return resolve(null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        i++;
        tentar();
      };
      img.src = candidatos[i];
    };
    tentar();
  });
  return LOGO_PROMISE;
}

/**
 * Desenha marca-d'água sobre o canvas:
 *  - canto inferior esquerdo: lat/lng, data/hora, vistoriador
 *  - canto superior direito: logo
 * Mantém legibilidade com bg semi-transparente + text-shadow.
 */
async function stampWatermark(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  info: WatermarkInfo
): Promise<void> {
  const W = canvas.width;
  const H = canvas.height;
  // Escala generosa: a menor dimensão garante visibilidade em retrato/paisagem.
  // Base 1200px; min 1.0 / max 3.0 pra não saturar em fotos enormes.
  const base = Math.min(W, H);
  const scale = Math.min(3.0, Math.max(1.4, base / 900));
  const pad = Math.round(22 * scale);
  const fontSize = Math.round(28 * scale);
  const lineGap = Math.round(10 * scale);

  // ── Textos canto inferior esquerdo ──────────────────────────────
  const lines: string[] = [];
  if (info.lat != null && info.lng != null) {
    lines.push(`${info.lat.toFixed(6)}, ${info.lng.toFixed(6)}`);
  }
  lines.push(
    new Date().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  );
  if (info.vistoriador) {
    lines.push(info.vistoriador);
  }

  ctx.save();
  ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "alphabetic";
  // Calcula width máximo do bloco
  const widths = lines.map((l) => ctx.measureText(l).width);
  const blockW = Math.max(...widths) + pad * 1.4;
  const lineHeight = fontSize + lineGap;
  const blockH = lineHeight * lines.length + pad * 0.8;
  const blockX = pad;
  const blockY = H - pad - blockH;

  // Fundo pill arredondado mais opaco pra legibilidade forte
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  roundRect(ctx, blockX, blockY, blockW, blockH, Math.round(14 * scale));
  ctx.fill();
  // Borda teal mais visível
  ctx.strokeStyle = "rgba(94,255,217,0.55)";
  ctx.lineWidth = Math.max(1.5, scale * 1.1);
  roundRect(ctx, blockX, blockY, blockW, blockH, Math.round(14 * scale));
  ctx.stroke();

  // Textos brancos com shadow forte
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = Math.round(5 * scale);
  for (let i = 0; i < lines.length; i++) {
    const x = blockX + pad * 0.7;
    const y =
      blockY + pad * 0.55 + (i + 1) * lineHeight - lineGap;
    // primeira linha (coords) em teal claro pra destacar
    ctx.fillStyle = i === 0 && info.lat != null ? "#5EFFD9" : "#fff";
    ctx.fillText(lines[i], x, y);
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── Logo canto superior direito ─────────────────────────────────
  const logo = await loadLogo();
  if (logo && logo.width > 0) {
    // Largura alvo: ~16% da menor dimensão da foto (visível mas não invasivo).
    const targetW = Math.round(Math.min(W, H) * 0.18);
    const ratio = logo.height / logo.width;
    const targetH = Math.round(targetW * ratio);
    ctx.save();
    // Backdrop sutil escuro atrás do logo pra garantir contraste em fundo claro
    const bgPad = Math.round(10 * scale);
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    roundRect(
      ctx,
      W - targetW - pad - bgPad,
      pad - bgPad / 2,
      targetW + bgPad * 2,
      targetH + bgPad,
      Math.round(12 * scale)
    );
    ctx.fill();
    // Logo com sombra
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = Math.round(10 * scale);
    ctx.globalAlpha = 1.0;
    ctx.drawImage(logo, W - targetW - pad, pad, targetW, targetH);
    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function readFileAsImage(
  file: File,
  watermark?: WatermarkInfo
): Promise<LoadedImage> {
  const compressed = await compressImage(file, 1600, 0.85);
  const img = new Image();
  img.src = compressed.dataUrl;
  await img.decode();
  // Re-export como PNG e Blob
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(img, 0, 0);

  // Estampa lat/lng/data/técnico + logo (se watermark fornecido).
  if (watermark) {
    await stampWatermark(canvas, ctx, watermark);
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar PNG"))),
      "image/png",
      0.95
    )
  );
  // Regenera dataUrl com watermark aplicado (pra preview refletir o stamp).
  const stampedDataUrl = watermark ? canvas.toDataURL("image/png", 0.92) : compressed.dataUrl;
  return {
    blob,
    dataUrl: stampedDataUrl,
    width: img.naturalWidth,
    height: img.naturalHeight,
    size: blob.size,
  };
}

function validateAgainstStep(
  step: StepDef,
  image: LoadedImage
): Feedback {
  // Só barra orientação claramente errada (horizontal quando é p/ ser vertical).
  // Resolução do sensor não é critério de qualidade — qualquer foto serve.
  if (!step.resolution) return { tone: "ok", message: "Captura válida." };

  const aspectTarget = step.resolution.w / step.resolution.h;
  const aspectActual = image.width / image.height;

  // Target vertical (w<h → aspect<1): bloqueia se vier horizontal.
  if (aspectTarget < 1 && aspectActual > 1.15) {
    return {
      tone: "error",
      message: "Foto na horizontal. Gire o celular para a vertical e tente novamente.",
    };
  }

  // Target horizontal (w>h → aspect>1): bloqueia se vier vertical.
  if (aspectTarget > 1 && aspectActual < 0.87) {
    return {
      tone: "error",
      message: "Foto na vertical. Gire o celular para a HORIZONTAL e tente novamente.",
    };
  }

  // Imagem minúscula (raríssimo após compressImage) — avisa mas aceita.
  if (image.width < 400 || image.height < 400) {
    return {
      tone: "warn",
      message: "Resolução baixa, mas aceita. Aproxime mais se possível.",
    };
  }

  return { tone: "ok", message: "Foto capturada com sucesso." };
}

/* ------------------------------------------------------------------ */
/*  Animation cards                                                    */
/* ------------------------------------------------------------------ */

function PoleAnim({ focus = "full" }: { focus?: "full" | "top" | "base" }) {
  const yStart = focus === "top" ? 50 : focus === "base" ? 200 : 240;
  const yEnd = focus === "top" ? 50 : focus === "base" ? 200 : 60;
  return (
    <svg viewBox="0 0 200 280" className="h-full w-full">
      <defs>
        <linearGradient id="poleGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#06D6A0" stopOpacity="0.0" />
          <stop offset="40%" stopColor="#06D6A0" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#06D6A0" stopOpacity="0.0" />
        </linearGradient>
        <linearGradient id="poleColor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#073B4C" />
          <stop offset="100%" stopColor="#0A4F65" />
        </linearGradient>
      </defs>
      {/* Glow */}
      <motion.rect
        x="92"
        y="20"
        width="16"
        height="240"
        fill="url(#poleGrad)"
        animate={{ opacity: [0.4, 0.9, 0.4] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Pole shaft */}
      <rect x="95" y="20" width="10" height="240" rx="3" fill="url(#poleColor)" />
      {/* Transformer at top */}
      <rect x="78" y="32" width="44" height="22" rx="3" fill="#073B4C" />
      <rect x="74" y="36" width="52" height="3" fill="#06D6A0" />
      {/* Base */}
      <rect x="85" y="258" width="30" height="6" rx="2" fill="#073B4C" />
      {/* Phone moving */}
      <motion.g
        initial={{ y: yStart }}
        animate={{ y: yEnd }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }}
      >
        <rect x="135" y="0" width="38" height="60" rx="6" fill="#FFD166" stroke="#073B4C" strokeWidth="2" />
        <rect x="139" y="6" width="30" height="44" rx="2" fill="#073B4C" />
        <circle cx="154" cy="56" r="2.5" fill="#06D6A0" />
        {/* Lens */}
        <circle cx="154" cy="28" r="6" fill="#06D6A0" opacity="0.85" />
      </motion.g>
      {/* Highlight ring depending on focus */}
      {focus === "top" && (
        <motion.circle
          cx="100"
          cy="42"
          r="28"
          fill="none"
          stroke="#FFD166"
          strokeWidth="2"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          style={{ transformOrigin: "100px 42px" }}
        />
      )}
      {focus === "base" && (
        <motion.circle
          cx="100"
          cy="258"
          r="28"
          fill="none"
          stroke="#FFD166"
          strokeWidth="2"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          style={{ transformOrigin: "100px 258px" }}
        />
      )}
    </svg>
  );
}

function WideAnim() {
  return (
    <svg viewBox="0 0 200 280" className="h-full w-full">
      {/* Chão / infraestrutura */}
      <line x1="12" y1="208" x2="188" y2="208" stroke="#06D6A0" strokeWidth="2" opacity="0.5" />
      {/* Poste vizinho esquerdo */}
      <rect x="46" y="150" width="6" height="58" rx="2" fill="#073B4C" opacity="0.65" />
      <rect x="38" y="150" width="22" height="3" fill="#06D6A0" opacity="0.65" />
      {/* Poste principal (centro) */}
      <rect x="96" y="120" width="9" height="88" rx="3" fill="#0A4F65" />
      <rect x="84" y="126" width="33" height="14" rx="2" fill="#073B4C" />
      <rect x="80" y="124" width="41" height="3" fill="#06D6A0" />
      {/* Poste vizinho direito */}
      <rect x="148" y="150" width="6" height="58" rx="2" fill="#073B4C" opacity="0.65" />
      <rect x="140" y="150" width="22" height="3" fill="#06D6A0" opacity="0.65" />
      {/* Moldura paisagem pulsando (enquadramento desejado) */}
      <motion.rect
        x="28"
        y="98"
        width="144"
        height="92"
        rx="8"
        fill="none"
        stroke="#FFD166"
        strokeWidth="2.5"
        strokeDasharray="9 6"
        animate={{ opacity: [0.35, 1, 0.35] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Celular girando para a horizontal */}
      <motion.g
        animate={{ rotate: [0, 0, 90, 90, 0] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          times: [0, 0.2, 0.45, 0.85, 1],
          ease: "easeInOut",
        }}
        style={{ transformOrigin: "100px 247px" }}
      >
        <rect x="86" y="225" width="28" height="44" rx="5" fill="#FFD166" stroke="#073B4C" strokeWidth="2" />
        <rect x="89" y="230" width="22" height="32" rx="2" fill="#073B4C" />
        <circle cx="100" cy="266" r="2" fill="#06D6A0" />
      </motion.g>
    </svg>
  );
}

function OrbitAnim({ progress }: { progress: number }) {
  const dash = useMemo(() => 2 * Math.PI * 80, []);
  return (
    <svg viewBox="0 0 240 240" className="h-full w-full">
      <defs>
        <linearGradient id="orbitGrad">
          <stop offset="0%" stopColor="#06D6A0" />
          <stop offset="100%" stopColor="#FFD166" />
        </linearGradient>
      </defs>
      {/* Pole center */}
      <rect x="115" y="60" width="10" height="120" rx="3" fill="url(#poleColor)" />
      <rect x="98" y="68" width="44" height="20" rx="3" fill="#073B4C" />
      {/* Orbit ring */}
      <circle
        cx="120"
        cy="120"
        r="80"
        fill="none"
        stroke="#E5E7EB"
        strokeWidth="6"
      />
      <motion.circle
        cx="120"
        cy="120"
        r="80"
        fill="none"
        stroke="url(#orbitGrad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={dash}
        strokeDashoffset={dash * (1 - progress / 100)}
        transform="rotate(-90 120 120)"
        transition={{ duration: 0.6 }}
      />
      {/* Phone orbiting */}
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "120px 120px" }}
      >
        <g transform="translate(120, 40)">
          <rect x="-12" y="-18" width="24" height="36" rx="4" fill="#FFD166" stroke="#073B4C" strokeWidth="2" />
          <rect x="-10" y="-14" width="20" height="28" rx="2" fill="#073B4C" />
        </g>
      </motion.g>
      <text x="120" y="124" textAnchor="middle" fontSize="22" fontWeight="700" fill="#073B4C">
        {Math.round(progress)}%
      </text>
      <text x="120" y="144" textAnchor="middle" fontSize="9" fontWeight="600" fill="#667280" letterSpacing="2">
        SENTIDO HORÁRIO
      </text>
    </svg>
  );
}

function BrandAnim({ brand }: { brand: "vivo" | "claro" }) {
  const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const src = brand === "vivo" ? `${BP}/Logo_VIVO.svg` : `${BP}/claro.svg`;
  return (
    <div className="flex h-full w-full items-center justify-center p-10">
      <motion.img
        src={src}
        alt={brand === "vivo" ? "Vivo" : "Claro"}
        className="max-h-full max-w-full object-contain drop-shadow-lg"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Confetti                                                           */
/* ------------------------------------------------------------------ */

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 32 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.4,
        color:
          i % 3 === 0
            ? "#06D6A0"
            : i % 3 === 1
            ? "#FFD166"
            : "#073B4C",
        rotate: Math.random() * 360,
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ y: -20, opacity: 0, rotate: p.rotate }}
          animate={{ y: 380, opacity: [0, 1, 1, 0], rotate: p.rotate + 360 }}
          transition={{ duration: 2.2, delay: p.delay, ease: "easeOut" }}
          className="absolute h-2.5 w-2.5 rounded-sm"
          style={{ left: `${p.x}%`, backgroundColor: p.color }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface GuidedCaptureFlowProps {
  bundle: CaptureBundle;
  onChange: (bundle: CaptureBundle) => void;
  /** Disparado ~2s depois que TODAS as 6 capturas válidas estão no bundle. */
  onComplete?: () => void;
  /** Aplica marca-d'água nas fotos (lat/lng/data/técnico + logo). */
  watermark?: WatermarkInfo;
}

interface PreviewState {
  url: string;
  feedback: Feedback;
}

export function GuidedCaptureFlow({
  bundle,
  onChange,
  onComplete,
  watermark,
}: GuidedCaptureFlowProps) {
  // Ao reabrir pra "revisar evidências", começa na primeira etapa que ainda
  // falta — se já está tudo completo (reabriu só pra conferir/refazer algo
  // específico), fica na etapa 1 mas o técnico pode pular direto pra
  // qualquer uma clicando na barra de progresso (ver ProgressHeader).
  const [stepIdx, setStepIdx] = useState(() => {
    const firstMissing = STEPS.findIndex((s) => !bundle[s.key]);
    return firstMissing === -1 ? 0 : firstMissing;
  });
  // Inicializa com os previews do que já está no bundle (senão reabrir
  // pra revisão mostrava tudo como "não capturado", mesmo já tendo dado).
  const [previews, setPreviews] = useState<Partial<Record<StepKey, PreviewState>>>(() => {
    const initial: Partial<Record<StepKey, PreviewState>> = {};
    for (const s of STEPS) {
      const blob = bundle[s.key];
      if (blob) {
        initial[s.key] = {
          url: URL.createObjectURL(blob),
          feedback: { tone: "ok", message: "Evidência já capturada." },
        };
      }
    }
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [orbitProgress, setOrbitProgress] = useState(0);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const step = STEPS[stepIdx];
  const total = STEPS.length;
  const isLast = stepIdx === total - 1;
  // Sucesso = todas 6 entradas existem no bundle (ok OU warn — error não persiste).
  const allDone =
    !!bundle.imagem1 &&
    !!bundle.imagem2 &&
    !!bundle.imagem3 &&
    !!bundle.video360 &&
    !!bundle.imagem4 &&
    !!bundle.imagem5;

  // Auto-fechar 2s só na TRANSIÇÃO pra completo (acabou de capturar a
  // última etapa) — nunca ao reabrir um bundle que já estava 100% completo
  // (reabrir era só pra revisar, e fechava sozinho em 2s antes do técnico
  // conseguir olhar qualquer coisa).
  const wasDoneOnMount = useRef(allDone);
  useEffect(() => {
    if (!allDone || !onComplete || wasDoneOnMount.current) return;
    const t = window.setTimeout(() => onComplete(), 2000);
    return () => window.clearTimeout(t);
  }, [allDone, onComplete]);

  /* Cleanup blob urls */
  useEffect(() => {
    return () => {
      Object.values(previews).forEach((p) => {
        if (p?.url) URL.revokeObjectURL(p.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Orbit progress for video step */
  useEffect(() => {
    if (step.kind !== "video" || !bundle.video360) {
      setOrbitProgress(0);
      return;
    }
    const start = performance.now();
    const duration = 1200;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      setOrbitProgress(k * 100);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step.kind, bundle.video360]);

  const goNext = () => {
    if (stepIdx < total - 1) setStepIdx(stepIdx + 1);
  };
  const goBack = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      if (step.kind === "video") {
        const url = URL.createObjectURL(file);
        const fb: Feedback =
          file.size > 0
            ? { tone: "ok", message: "Vídeo capturado." }
            : { tone: "error", message: "Vídeo inválido." };
        setPreviews((p) => ({ ...p, [step.key]: { url, feedback: fb } }));
        onChange({ ...bundle, video360: file });
        if (fb.tone === "ok") {
          chime(700);
          buzz(80);
        }
      } else {
        const image = await readFileAsImage(file, watermark);
        const feedback = validateAgainstStep(step, image);
        const previousUrl = previews[step.key]?.url;
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        const url = URL.createObjectURL(image.blob);
        setPreviews((p) => ({ ...p, [step.key]: { url, feedback } }));
        if (feedback.tone === "ok") {
          onChange({ ...bundle, [step.key]: image.blob });
          chime(880);
          buzz(60);
        } else if (feedback.tone === "warn") {
          onChange({ ...bundle, [step.key]: image.blob });
          chime(520, 0.1);
          buzz([30, 40, 30]);
        } else {
          // Não persiste no bundle quando erro
          chime(220, 0.18);
          buzz([60, 80, 60]);
        }
      }
    } catch (err) {
      console.error(err);
      setPreviews((p) => ({
        ...p,
        [step.key]: {
          url: previews[step.key]?.url ?? "",
          feedback: {
            tone: "error",
            message: "Falha ao processar o arquivo.",
          },
        },
      }));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const current = previews[step.key];

  return (
    <div className="space-y-4">
      <ProgressHeader stepIdx={stepIdx} total={total} onStepClick={setStepIdx} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step.key}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.35, ease: [0.22, 0.7, 0.2, 1] }}
          className="space-y-3"
        >
          {/* Illustration */}
          <div className="relative h-56 w-full overflow-hidden rounded-3xl bg-grad-deep">
            <div className="absolute inset-0 opacity-25 [background:radial-gradient(60%_80%_at_50%_0%,rgba(6,214,160,0.5),rgba(6,214,160,0))]" />
            <div className="relative h-full w-full">
              {step.kind === "photo" &&
                (step.key === "imagem3" ? (
                  <WideAnim />
                ) : (
                  <PoleAnim focus={step.key === "imagem2" ? "top" : "full"} />
                ))}
              {step.kind === "video" && (
                <OrbitAnim progress={orbitProgress} />
              )}
              {step.kind === "upload" && step.brand && (
                <BrandAnim brand={step.brand} />
              )}
            </div>
            <div className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85 backdrop-blur">
              <Sparkles className="h-3 w-3" />
              Etapa {stepIdx + 1}
            </div>
          </div>

          {/* Step header */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[16px] font-semibold tracking-tight text-ink">
                {step.title}
              </h3>
              <p className="text-xs text-ink-muted">{step.objective}</p>
            </div>
            {step.resolution && (
              <span className="rounded-full bg-brand-deep/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-deep">
                {step.resolution.w}×{step.resolution.h} · PNG
              </span>
            )}
          </div>

          {/* Instruction */}
          <p className="rounded-2xl bg-brand-ice px-4 py-3 text-sm font-medium text-ink">
            {step.instruction}
          </p>

          {/* Capture area */}
          <CaptureArea
            step={step}
            preview={current}
            busy={busy}
            onPick={() =>
              step.kind === "video"
                ? setRecorderOpen(true)
                : fileRef.current?.click()
            }
          />

          {/* Feedback */}
          <AnimatePresence mode="wait">
            {current?.feedback && (
              <motion.div
                key={current.feedback.message}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-medium",
                  current.feedback.tone === "ok" &&
                    "bg-brand-emerald/15 text-brand-emerald",
                  current.feedback.tone === "warn" &&
                    "bg-brand-amber/20 text-[#8a5a00]",
                  current.feedback.tone === "error" &&
                    "bg-red-100 text-red-600"
                )}
              >
                {current.feedback.tone === "ok" ? "✅" : current.feedback.tone === "warn" ? "⚠️" : "❌"}
                <span className="flex-1">{current.feedback.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Nav */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={stepIdx === 0}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-ink shadow-soft transition disabled:opacity-40"
              aria-label="Anterior"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {current && current.feedback.tone !== "error" && (
              <button
                type="button"
                onClick={() =>
                  step.kind === "video"
                    ? setRecorderOpen(true)
                    : fileRef.current?.click()
                }
                className="flex h-12 items-center gap-1.5 rounded-2xl border border-brand-steel bg-white px-3.5 text-sm font-semibold text-ink-muted hover:text-ink"
              >
                <RotateCcw className="h-4 w-4" />
                Refazer
              </button>
            )}
            <button
              type="button"
              onClick={isLast ? onComplete : goNext}
              disabled={!current || current.feedback.tone === "error" || (isLast && !allDone)}
              className="ml-auto inline-flex h-12 items-center gap-2 rounded-2xl bg-grad-emerald px-5 text-sm font-semibold text-white shadow-glow transition disabled:opacity-50"
            >
              {isLast ? "Concluir" : "Próximo"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* File input */}
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={
              step.kind === "video"
                ? "video/*"
                : step.kind === "upload"
                ? "image/*"
                : "image/*"
            }
            capture={step.capture}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {/* Gravador leve do vídeo 360 (baixa resolução + 15s). */}
          <VideoRecorderSheet
            open={recorderOpen}
            onClose={() => setRecorderOpen(false)}
            onCapture={(file) => {
              setRecorderOpen(false);
              void handleFile(file);
            }}
            onFallback={() => fileRef.current?.click()}
          />
        </motion.div>
      </AnimatePresence>

      {/* Completion banner */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative overflow-hidden rounded-3xl bg-grad-emerald p-5 text-white shadow-glow"
          >
            <Confetti />
            <div className="relative flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[15px] font-semibold tracking-tight">
                  🎉 6/6 evidências capturadas!
                </p>
                <p className="text-xs text-white/85">
                  Voltando ao formulário em instantes…
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ProgressHeader({
  stepIdx,
  total,
  onStepClick,
}: {
  stepIdx: number;
  total: number;
  /** Pular direto pra etapa `i` — pra revisar/refazer uma etapa específica
      sem ter que passar por todas de novo em ordem. */
  onStepClick?: (i: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em]">
        <span className="text-ink-muted">
          Etapa <span className="text-ink">{stepIdx + 1}</span> de {total}
        </span>
        <span className="text-brand-emerald">
          {Math.round(((stepIdx + 1) / total) * 100)}%
        </span>
      </div>
      <div className="flex h-2.5 gap-1 overflow-hidden rounded-full bg-brand-steel/60">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onStepClick?.(i)}
            aria-label={`Ir para etapa ${i + 1}`}
            className="h-full flex-1 cursor-pointer rounded-full p-0"
          >
            <motion.span
              initial={false}
              animate={{
                backgroundColor: i <= stepIdx ? "#06D6A0" : "rgba(229,231,235,0)",
              }}
              transition={{ duration: 0.4 }}
              className="block h-full w-full rounded-full"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function CaptureArea({
  step,
  preview,
  busy,
  onPick,
}: {
  step: StepDef;
  preview?: PreviewState;
  busy: boolean;
  onPick: () => void;
}) {
  const aspect = step.resolution
    ? `${step.resolution.w}/${step.resolution.h}`
    : step.kind === "video"
    ? "16/9"
    : "4/3";

  const hasPreview = !!preview?.url;
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "relative w-full overflow-hidden rounded-3xl border-2 border-dashed transition",
        hasPreview
          ? "border-brand-emerald/60 bg-black"
          : "border-brand-steel bg-brand-ice hover:border-brand-emerald hover:bg-white"
      )}
      style={{ aspectRatio: aspect }}
    >
      {hasPreview ? (
        step.kind === "video" ? (
          <video
            src={preview!.url}
            className="h-full w-full object-cover"
            controls
            playsInline
          />
        ) : (
          <img
            src={preview!.url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-muted">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-deep shadow-soft">
            {step.kind === "video" ? (
              <Video className="h-6 w-6" />
            ) : step.kind === "upload" ? (
              <Upload className="h-6 w-6" />
            ) : (
              <Camera className="h-6 w-6" />
            )}
          </span>
          <span className="text-sm font-semibold text-ink">
            {step.kind === "video"
              ? "Gravar vídeo"
              : step.kind === "upload"
              ? "Selecionar imagem"
              : "Abrir câmera"}
          </span>
          <span className="text-xs">
            Toque para {step.kind === "upload" ? "fazer upload" : "iniciar"}
          </span>
        </div>
      )}

      {/* Guide frame overlay */}
      {step.resolution && (
        <div className="pointer-events-none absolute inset-4 rounded-2xl border-2 border-dashed border-white/50 mix-blend-difference">
          <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white">
            ENQUADRAMENTO IDEAL
          </span>
        </div>
      )}

      {/* Validation badge */}
      {preview?.feedback && (
        <span
          className={cn(
            "absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
            preview.feedback.tone === "ok" && "bg-brand-emerald text-white",
            preview.feedback.tone === "warn" && "bg-brand-amber text-brand-deep",
            preview.feedback.tone === "error" && "bg-red-500 text-white"
          )}
        >
          {preview.feedback.tone === "ok" && <Check className="h-3 w-3" />}
          {preview.feedback.tone === "ok"
            ? "Validada"
            : preview.feedback.tone === "warn"
            ? "Atenção"
            : "Inválida"}
        </span>
      )}

      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand-emerald border-t-transparent" />
        </div>
      )}
    </button>
  );
}
