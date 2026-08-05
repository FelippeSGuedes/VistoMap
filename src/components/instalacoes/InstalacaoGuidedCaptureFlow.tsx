"use client";

/**
 * Captura guiada das 7 fotos fixas do Relatório Técnico Fotográfico de
 * Instalação — mesma experiência do GuidedCaptureFlow da vistoria (etapas
 * com animação + instrução, feedback sonoro/tátil, barra de progresso,
 * comemoração ao concluir), reconstruída do zero pro módulo de Instalação:
 * não importa nada de src/components/vistorias, só primitivos genéricos
 * (compressImage, haptics). As 7 etapas e os rótulos batem exatamente com
 * PHOTO_SLOTS de src/app/api/instalacoes/[id]/finalizar/route.ts e com o
 * template_instalacao.html do relatório — a legenda que aparece aqui é a
 * mesma que aparece no PDF.
 */

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { compressImage } from "@/utils/image";
import { chime, buzz } from "@/utils/haptics";
import { cn } from "@/utils/cn";
import type { InstalacaoCaptureBundle } from "@/types";

type StepKey = keyof InstalacaoCaptureBundle;

interface StepDef {
  key: StepKey;
  title: string;
  objective: string;
  instruction: string;
  scene: "chegada" | "preparacao" | "cinta" | "fixacao" | "tensao" | "frontal" | "geral";
}

const STEPS: StepDef[] = [
  {
    key: "foto1",
    title: "Chegada e inspeção",
    objective: "Poste e arredores antes de começar",
    instruction: "Fotografe o poste e a área ao redor assim que chegar, mostrando o contexto do local antes de iniciar a instalação.",
    scene: "chegada",
  },
  {
    key: "foto2",
    title: "Preparação do material",
    objective: "Access Point e material de fixação organizados",
    instruction: "Fotografe o Access Point e o material de fixação (cinta, parafusos, ferramentas) organizados e prontos, antes de subir no poste.",
    scene: "preparacao",
  },
  {
    key: "foto3",
    title: "Fixação da cinta",
    objective: "Cinta presa e firme no poste",
    instruction: "Fotografe a cinta de fixação já instalada e firme no poste, antes de encaixar o equipamento.",
    scene: "cinta",
  },
  {
    key: "foto4",
    title: "Fixação do Access Point",
    objective: "Equipamento fixado na cinta",
    instruction: "Fotografe o Access Point já fixado na cinta, mostrando a fixação completa no poste.",
    scene: "fixacao",
  },
  {
    key: "foto5",
    title: "Teste de tensão",
    objective: "Multímetro com a leitura da tensão",
    instruction: "Encoste o multímetro nos terminais e fotografe o visor mostrando a tensão medida (127V ou 220V).",
    scene: "tensao",
  },
  {
    key: "foto6",
    title: "Vista frontal",
    objective: "Equipamento instalado, de frente",
    instruction: "Fotografe o Access Point de frente, já energizado e instalado, bem enquadrado e sem obstruções.",
    scene: "frontal",
  },
  {
    key: "foto7",
    title: "Vista geral final",
    objective: "Poste completo com a instalação concluída",
    instruction: "Afaste-se e fotografe o poste inteiro, da base ao topo, mostrando o resultado final da instalação.",
    scene: "geral",
  },
];

/* ------------------------------------------------------------------ */
/*  Validação simples                                                  */
/* ------------------------------------------------------------------ */

type Feedback = { tone: "ok" | "warn"; message: string };

interface LoadedImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

async function readFileAsImage(file: File): Promise<LoadedImage> {
  const compressed = await compressImage(file, 1600, 0.85);
  const img = new Image();
  img.src = compressed.dataUrl;
  await img.decode();
  const blob = await (await fetch(compressed.dataUrl)).blob();
  return { blob, dataUrl: compressed.dataUrl, width: img.naturalWidth, height: img.naturalHeight };
}

function validateCapture(image: LoadedImage): Feedback {
  if (image.width < 400 || image.height < 400) {
    return { tone: "warn", message: "Resolução baixa, mas aceita. Aproxime mais se possível." };
  }
  return { tone: "ok", message: "Foto capturada com sucesso." };
}

/* ------------------------------------------------------------------ */
/*  Animações por etapa                                                */
/* ------------------------------------------------------------------ */

const TEAL = "#06D6A0";
const DEEP = "#073B4C";
const AMBER = "#FFD166";

/** Só o gradiente — vai dentro de <defs>. */
function PoleGradientDef() {
  return (
    <linearGradient id="ip-pole" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#073B4C" />
      <stop offset="100%" stopColor="#0A4F65" />
    </linearGradient>
  );
}

/** O poste em si — precisa ficar FORA de <defs> pra renderizar (defs só
 * declara recursos referenciáveis via url(#...), nunca desenha os filhos
 * diretamente). */
function PoleShape() {
  return (
    <>
      <rect x="94" y="30" width="10" height="220" rx="3" fill="url(#ip-pole)" />
      <rect x="84" y="252" width="30" height="6" rx="2" fill={DEEP} />
    </>
  );
}

function ChegadaAnim() {
  return (
    <svg viewBox="0 0 200 280" className="h-full w-full">
      <defs>
        <PoleGradientDef />
      </defs>
      <PoleShape />
      {/* Scan ring pulsando ao redor do poste */}
      <motion.circle
        cx="99" cy="140" r="70"
        fill="none" stroke={TEAL} strokeWidth="2" strokeDasharray="6 8"
        animate={{ rotate: 360, opacity: [0.3, 0.8, 0.3] }}
        transition={{ rotate: { duration: 8, repeat: Infinity, ease: "linear" }, opacity: { duration: 2.2, repeat: Infinity } }}
        style={{ transformOrigin: "99px 140px" }}
      />
      {/* Caminhonete entrando */}
      <motion.g
        initial={{ x: -70, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 0.7, 0.2, 1] }}
      >
        <rect x="10" y="196" width="58" height="26" rx="4" fill={DEEP} />
        <rect x="16" y="184" width="30" height="18" rx="3" fill="#0A4F65" />
        <circle cx="24" cy="224" r="6" fill="#1F2933" />
        <circle cx="56" cy="224" r="6" fill="#1F2933" />
        <circle cx="24" cy="224" r="2.4" fill={TEAL} />
        <circle cx="56" cy="224" r="2.4" fill={TEAL} />
      </motion.g>
      {/* Lupa de inspeção */}
      <motion.g
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <circle cx="140" cy="90" r="16" fill="none" stroke={AMBER} strokeWidth="3" />
        <line x1="151" y1="101" x2="164" y2="114" stroke={AMBER} strokeWidth="4" strokeLinecap="round" />
      </motion.g>
    </svg>
  );
}

function PreparacaoAnim() {
  const items = [0, 1, 2];
  return (
    <svg viewBox="0 0 200 280" className="h-full w-full">
      {/* Caixa de ferramentas */}
      <rect x="55" y="170" width="90" height="52" rx="8" fill={DEEP} />
      <rect x="70" y="158" width="60" height="16" rx="6" fill="#0A4F65" />
      <rect x="55" y="188" width="90" height="6" fill={TEAL} opacity="0.7" />
      {/* Itens "montando" um a um */}
      {items.map((i) => (
        <motion.g
          key={i}
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 + i * 0.35, repeat: Infinity, repeatDelay: 1.8, ease: "easeOut" }}
        >
          <rect x={72 + i * 22} y="120" width="14" height="14" rx="3" fill={i === 1 ? AMBER : TEAL} />
        </motion.g>
      ))}
      {/* Check final */}
      <motion.circle
        cx="100" cy="70" r="20"
        fill={TEAL} opacity="0.15"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        style={{ transformOrigin: "100px 70px" }}
      />
      <path d="M90 70 L97 78 L112 60" stroke={TEAL} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CintaAnim() {
  return (
    <svg viewBox="0 0 200 280" className="h-full w-full">
      <defs>
        <PoleGradientDef />
      </defs>
      <PoleShape />
      {/* Cinta envolvendo o poste, "apertando" */}
      <motion.rect
        x="70" y="128" width="60" height="18" rx="9"
        fill="none" stroke={AMBER} strokeWidth="5"
        initial={{ scaleX: 1.6, opacity: 0.4 }}
        animate={{ scaleX: [1.6, 1, 1.08, 1], opacity: [0.4, 1, 1, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" }}
        style={{ transformOrigin: "99px 137px" }}
      />
      {/* Trava/fivela */}
      <motion.rect
        x="90" y="130" width="18" height="14" rx="3"
        fill={DEEP}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2.2, repeat: Infinity }}
      />
    </svg>
  );
}

function FixacaoAnim() {
  return (
    <svg viewBox="0 0 200 280" className="h-full w-full">
      <defs>
        <PoleGradientDef />
      </defs>
      <PoleShape />
      <rect x="70" y="128" width="60" height="18" rx="9" fill="none" stroke={AMBER} strokeWidth="5" />
      {/* AP descendo e encaixando */}
      <motion.g
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1, repeat: Infinity, repeatDelay: 1.4, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <rect x="62" y="96" width="74" height="46" rx="8" fill={DEEP} />
        <rect x="72" y="106" width="54" height="26" rx="4" fill="#0A4F65" />
        <circle cx="99" cy="119" r="6" fill={TEAL} />
      </motion.g>
      {/* Pulso de "encaixado" */}
      <motion.circle
        cx="99" cy="119" r="46"
        fill="none" stroke={TEAL} strokeWidth="2"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: [0.6, 1.3], opacity: [0, 0.6, 0] }}
        transition={{ duration: 1, repeat: Infinity, repeatDelay: 1.4, delay: 0.9 }}
        style={{ transformOrigin: "99px 119px" }}
      />
    </svg>
  );
}

function TensaoAnim() {
  return (
    <svg viewBox="0 0 200 280" className="h-full w-full">
      {/* Multímetro */}
      <rect x="60" y="80" width="80" height="110" rx="12" fill={DEEP} />
      <rect x="72" y="94" width="56" height="30" rx="4" fill="#0A4F65" />
      {/* Leitura piscando */}
      <motion.text
        x="100" y="115" textAnchor="middle" fontSize="16" fontWeight="700" fill={TEAL}
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1.4, repeat: Infinity }}
      >
        220V
      </motion.text>
      {/* Botão giratório */}
      <circle cx="100" cy="150" r="14" fill="#1F2933" />
      <motion.line
        x1="100" y1="150" x2="100" y2="138" stroke={AMBER} strokeWidth="3" strokeLinecap="round"
        animate={{ rotate: [0, 320] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }}
        style={{ transformOrigin: "100px 150px" }}
      />
      {/* Pontas de prova */}
      <motion.line
        x1="60" y1="175" x2="30" y2="205" stroke={AMBER} strokeWidth="3" strokeLinecap="round"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.4, repeat: Infinity }}
      />
      <motion.line
        x1="140" y1="175" x2="170" y2="205" stroke="#EF4444" strokeWidth="3" strokeLinecap="round"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.4, repeat: Infinity, delay: 0.3 }}
      />
    </svg>
  );
}

function FrontalAnim() {
  return (
    <svg viewBox="0 0 200 280" className="h-full w-full">
      <rect x="60" y="100" width="80" height="60" rx="10" fill={DEEP} />
      <rect x="72" y="112" width="56" height="36" rx="5" fill="#0A4F65" />
      <motion.circle
        cx="100" cy="130" r="6" fill={TEAL}
        animate={{ opacity: [1, 0.35, 1] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      />
      {/* Moldura de enquadramento (viewfinder) */}
      {[
        { x: 34, y: 74, rot: 0 },
        { x: 166, y: 74, rot: 90 },
        { x: 166, y: 186, rot: 180 },
        { x: 34, y: 186, rot: 270 },
      ].map((c, i) => (
        <motion.g key={i} transform={`translate(${c.x} ${c.y}) rotate(${c.rot})`}
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.15 }}
        >
          <path d="M0 0 L0 18 M0 0 L18 0" stroke={AMBER} strokeWidth="3" strokeLinecap="round" fill="none" />
        </motion.g>
      ))}
    </svg>
  );
}

function GeralAnim() {
  return (
    <svg viewBox="0 0 200 280" className="h-full w-full">
      <defs>
        <PoleGradientDef />
      </defs>
      <PoleShape />
      <rect x="70" y="128" width="60" height="18" rx="9" fill="none" stroke={AMBER} strokeWidth="4" />
      <rect x="65" y="98" width="68" height="42" rx="7" fill={DEEP} />
      <circle cx="99" cy="119" r="5" fill={TEAL} />
      {/* Câmera "afastando" (zoom out) */}
      <motion.rect
        x="16" y="16" width="168" height="248" rx="16"
        fill="none" stroke={TEAL} strokeWidth="2" strokeDasharray="8 6"
        initial={{ scale: 0.55, opacity: 0.3 }}
        animate={{ scale: 1, opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "100px 140px" }}
      />
      {/* Badge de concluído */}
      <motion.g
        animate={{ scale: [1, 1.12, 1] }}
        transition={{ duration: 1.8, repeat: Infinity }}
        style={{ transformOrigin: "160px 40px" }}
      >
        <circle cx="160" cy="40" r="16" fill={TEAL} />
        <path d="M152 40 L157 46 L169 32" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
    </svg>
  );
}

function StepAnimation({ scene }: { scene: StepDef["scene"] }) {
  switch (scene) {
    case "chegada": return <ChegadaAnim />;
    case "preparacao": return <PreparacaoAnim />;
    case "cinta": return <CintaAnim />;
    case "fixacao": return <FixacaoAnim />;
    case "tensao": return <TensaoAnim />;
    case "frontal": return <FrontalAnim />;
    case "geral": return <GeralAnim />;
  }
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
        color: i % 3 === 0 ? TEAL : i % 3 === 1 ? AMBER : DEEP,
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
/*  Componente principal                                               */
/* ------------------------------------------------------------------ */

interface InstalacaoGuidedCaptureFlowProps {
  bundle: InstalacaoCaptureBundle;
  onChange: (bundle: InstalacaoCaptureBundle) => void;
  onComplete?: () => void;
}

interface PreviewState {
  url: string;
  feedback: Feedback;
}

export function InstalacaoGuidedCaptureFlow({ bundle, onChange, onComplete }: InstalacaoGuidedCaptureFlowProps) {
  const [stepIdx, setStepIdx] = useState(() => {
    const firstMissing = STEPS.findIndex((s) => !bundle[s.key]);
    return firstMissing === -1 ? 0 : firstMissing;
  });
  const [previews, setPreviews] = useState<Partial<Record<StepKey, PreviewState>>>(() => {
    const initial: Partial<Record<StepKey, PreviewState>> = {};
    for (const s of STEPS) {
      const blob = bundle[s.key];
      if (blob) {
        initial[s.key] = { url: URL.createObjectURL(blob), feedback: { tone: "ok", message: "Evidência já capturada." } };
      }
    }
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const step = STEPS[stepIdx];
  const total = STEPS.length;
  const isLast = stepIdx === total - 1;
  const allDone = STEPS.every((s) => !!bundle[s.key]);

  const wasDoneOnMount = useRef(allDone);
  useEffect(() => {
    if (!allDone || !onComplete || wasDoneOnMount.current) return;
    const t = window.setTimeout(() => onComplete(), 2000);
    return () => window.clearTimeout(t);
  }, [allDone, onComplete]);

  useEffect(() => {
    return () => {
      Object.values(previews).forEach((p) => {
        if (p?.url) URL.revokeObjectURL(p.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goNext = () => {
    if (stepIdx < total - 1) setStepIdx(stepIdx + 1);
  };
  const goBack = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const image = await readFileAsImage(file);
      const feedback = validateCapture(image);
      const previousUrl = previews[step.key]?.url;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      const url = URL.createObjectURL(image.blob);
      setPreviews((p) => ({ ...p, [step.key]: { url, feedback } }));
      onChange({ ...bundle, [step.key]: image.blob });
      if (feedback.tone === "ok") {
        chime(880);
        buzz(60);
      } else {
        chime(520, 0.1);
        buzz([30, 40, 30]);
      }
    } catch (err) {
      console.error(err);
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
          <div className="relative h-56 w-full overflow-hidden rounded-3xl bg-grad-deep">
            <div className="absolute inset-0 opacity-25 [background:radial-gradient(60%_80%_at_50%_0%,rgba(6,214,160,0.5),rgba(6,214,160,0))]" />
            <div className="relative h-full w-full">
              <StepAnimation scene={step.scene} />
            </div>
            <div className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85 backdrop-blur">
              <Sparkles className="h-3 w-3" />
              Foto {stepIdx + 1} de {total}
            </div>
          </div>

          <div>
            <h3 className="text-[16px] font-semibold tracking-tight text-ink">{step.title}</h3>
            <p className="text-xs text-ink-muted">{step.objective}</p>
          </div>

          <p className="rounded-2xl bg-brand-ice px-4 py-3 text-sm font-medium text-ink">{step.instruction}</p>

          <CaptureArea preview={current} busy={busy} onPick={() => fileRef.current?.click()} />

          <AnimatePresence mode="wait">
            {current?.feedback && (
              <motion.div
                key={current.feedback.message}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-medium",
                  current.feedback.tone === "ok" ? "bg-brand-emerald/15 text-brand-emerald" : "bg-brand-amber/20 text-[#8a5a00]"
                )}
              >
                {current.feedback.tone === "ok" ? "✅" : "⚠️"}
                <span className="flex-1">{current.feedback.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

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
            {current && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-12 items-center gap-1.5 rounded-2xl border border-brand-steel bg-white px-3.5 text-sm font-semibold text-ink-muted hover:text-ink"
              >
                <RotateCcw className="h-4 w-4" />
                Refazer
              </button>
            )}
            <button
              type="button"
              onClick={isLast ? onComplete : goNext}
              disabled={!current || (isLast && !allDone)}
              className="ml-auto inline-flex h-12 items-center gap-2 rounded-2xl bg-grad-emerald px-5 text-sm font-semibold text-white shadow-glow transition disabled:opacity-50"
            >
              {isLast ? "Concluir" : "Próximo"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            hidden
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </motion.div>
      </AnimatePresence>

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
                <p className="text-[15px] font-semibold tracking-tight">🎉 7/7 fotos capturadas!</p>
                <p className="text-xs text-white/85">Voltando ao formulário em instantes…</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Subcomponentes                                                     */
/* ------------------------------------------------------------------ */

function ProgressHeader({
  stepIdx,
  total,
  onStepClick,
}: {
  stepIdx: number;
  total: number;
  onStepClick?: (i: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em]">
        <span className="text-ink-muted">
          Foto <span className="text-ink">{stepIdx + 1}</span> de {total}
        </span>
        <span className="text-brand-emerald">{Math.round(((stepIdx + 1) / total) * 100)}%</span>
      </div>
      <div className="flex h-2.5 gap-1 overflow-hidden rounded-full bg-brand-steel/60">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onStepClick?.(i)}
            aria-label={`Ir para foto ${i + 1}`}
            className="h-full flex-1 cursor-pointer rounded-full p-0"
          >
            <motion.span
              initial={false}
              animate={{ backgroundColor: i <= stepIdx ? "#06D6A0" : "rgba(229,231,235,0)" }}
              transition={{ duration: 0.4 }}
              className="block h-full w-full rounded-full"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function CaptureArea({ preview, busy, onPick }: { preview?: PreviewState; busy: boolean; onPick: () => void }) {
  const hasPreview = !!preview?.url;
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "relative w-full overflow-hidden rounded-3xl border-2 border-dashed transition",
        hasPreview ? "border-brand-emerald/60 bg-black" : "border-brand-steel bg-brand-ice hover:border-brand-emerald hover:bg-white"
      )}
      style={{ aspectRatio: "4/3" }}
    >
      {hasPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview!.url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-muted">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-deep shadow-soft">
            <Camera className="h-6 w-6" />
          </span>
          <span className="text-sm font-semibold text-ink">Abrir câmera</span>
          <span className="text-xs">Toque para iniciar</span>
        </div>
      )}

      {preview?.feedback && (
        <span
          className={cn(
            "absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
            preview.feedback.tone === "ok" ? "bg-brand-emerald text-white" : "bg-brand-amber text-brand-deep"
          )}
        >
          {preview.feedback.tone === "ok" && <Check className="h-3 w-3" />}
          {preview.feedback.tone === "ok" ? "Validada" : "Atenção"}
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
