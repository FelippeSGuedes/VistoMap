"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import mapboxgl from "mapbox-gl";
import { novoMapa } from "@/lib/mapaSeguro";
import "mapbox-gl/dist/mapbox-gl.css";
// Mesma linguagem visual (anel na cor do técnico + núcleo/glifo por família
// de status) do /painel/mapa dedicado — pedido de campo 2026-09-23 pra não
// destoar entre os dois mapas do painel. sinal.ts é um módulo puro (tipos +
// funções + canvas), sem nada específico da rota /painel/mapa em si.
import {
  ANEL_SEM_TECNICO,
  FAMILIA_COR,
  FAMILIA_LABEL,
  FAMILIA_ORDEM,
  iconeDe,
  registrarSpritesSinal,
} from "./mapa/sinal";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUp,
  Ban,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Layers,
  Map as MapIcon,
  RotateCw,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Undo2,
  UserPlus,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { painelService } from "@/services/painel";
import { CountUp } from "@/components/ui/CountUp";
import type { AuditEntry, PainelStats, RevisitaPendente, TecnicoAtivo } from "@/types";
import type {
  HistoricoAnalytics,
  RankingTecnicoItem,
  TopTecnicosDashboard,
} from "@/services/painel";
import { getMapboxToken } from "@/services/maps";
import { api } from "@/services/api";
import type { PainelMapaResponse, PainelMapaTecnico, PainelMapaVistoria } from "@/types/painel-mapa";
import { asset } from "@/utils/asset";
// Instalação — service/tipos isolados (src/lib/glpi/painel-instalacoes.ts),
// nunca a Vistoria importando dados dela: só consome o próprio endpoint
// novo. Poll independente (ver useEffect próprio abaixo), não entra no
// Promise.all da Vistoria — zero acoplamento com o fluxo de dados dela.
import { fetchInstalacoesStats } from "@/services/painel-instalacoes";
import type { PainelInstalacoesStats } from "@/types/painel-instalacoes";
import { VelocityChart } from "./VelocityChart";
import EquipeAoVivo from "./EquipeAoVivo";

/* ─── helpers ───────────────────────────────────────────────────────────── */

function relativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function fmtNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",") + "k";
  return String(n);
}

/** Minutos → "Xmin" ou "Xh Ymin". */
function fmtMin(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function diaCurto(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function initials(nome: string): string {
  const p = nome.trim().split(/[\s._-]+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

/* ─── constants ─────────────────────────────────────────────────────────── */

const ACCENT = "#00D084";

/**
 * Filtro de período único do dashboard (2026-09-15): antes cada widget
 * histórico tinha sua própria janela fixa (Vistorias Finalizadas em 14
 * dias, Padrão Diário em 30, Top Técnicos com um seletor só dele) — a
 * nível gerencial isso não batia, cada card contava uma história de um
 * recorte diferente. Os widgets AO VIVO (Equipe ao Vivo/mapa, Atividade ao
 * vivo, Reprovados CPFL, Pendentes CPFL, distribuição do pipeline, KPIs do
 * topo) ficam de fora de propósito: mostram o agora, não um período.
 */
type PeriodoModo = "hoje" | "7dias" | "30dias" | "todoperiodo" | "personalizado";

const PERIODO_MODOS: Array<{ id: PeriodoModo; label: string }> = [
  { id: "hoje", label: "Hoje" },
  { id: "7dias", label: "7 dias" },
  { id: "30dias", label: "30 dias" },
  { id: "todoperiodo", label: "Todo Período" },
  { id: "personalizado", label: "Personalizado" },
];

/** Data bem anterior a qualquer vistoria real — "todo período" na prática. */
const INICIO_DOS_TEMPOS = "2020-01-01";

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** YYYY-MM-DD de N dias atrás (0 = hoje). */
function isoDiasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Dias corridos entre duas datas YYYY-MM-DD, ambas inclusive. */
function diasEntreInclusive(inicio: string, fim: string): number {
  return Math.max(1, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000) + 1);
}

// Tema para os mapas dos widgets (JS, fora do CSS var).
function dashDark(): boolean {
  return typeof window !== "undefined" && localStorage.getItem("vm_painel_theme") === "dark";
}
function dashMapStyle(lightStyle: string): string {
  return dashDark() ? "mapbox://styles/mapbox/dark-v11" : lightStyle;
}
function dashMapBg(): string {
  return dashDark() ? "#141A23" : "#ffffff";
}
// Coroplético: preenchimento de município SEM dados + rampa de intensidade,
// ambos adaptados ao tema (no dark o "vazio" é um tom escuro sutil, não branco).
function choroEmpty(): string {
  return dashDark() ? "#1E2733" : "#e8f5ee";
}
function choroRamp(): [string, string, string] {
  return dashDark()
    ? ["#2E7D5B", "#00B388", "#22E0A6"] // dark: verdes vivos que destacam no escuro
    : ["#7bc49a", "#3f9468", "#1a6b3c"];
}
const STATUS_DOT: Record<TecnicoAtivo["status"], string> = {
  "em-campo":  "#10B981",
  "base":      "#6366F1",
  "off-shift": "#F59E0B",
  "offline":   "var(--vm-faint)",
};

const STATUS_LABEL: Record<TecnicoAtivo["status"], string> = {
  "em-campo":  "Em campo",
  "base":      "Na base",
  "off-shift": "Off-shift",
  "offline":   "Offline",
};

function auditColor(acao: AuditEntry["acao"]): string {
  if (acao.startsWith("login") || acao.startsWith("expediente")) return "#8B5CF6";
  if (acao.startsWith("pdf") || acao === "sincronizacao") return "#3B82F6";
  if (acao.includes("revisita") || acao.includes("atribuida") || acao.includes("desvinculada")) return "#F59E0B";
  return "#059669";
}

function auditIcon(acao: AuditEntry["acao"]) {
  if (acao.startsWith("login") || acao.startsWith("expediente")) return Users;
  if (acao.startsWith("pdf") || acao === "sincronizacao") return FileText;
  if (acao.includes("revisita")) return RotateCw;
  if (acao.includes("atribuida") || acao.includes("desvinculada")) return UserPlus;
  if (acao.includes("aprovada")) return CheckCircle2;
  if (acao.includes("reprovada")) return ShieldAlert;
  return Activity;
}

// SP municipalities polygon GeoJSON (tbrugz/geodata-br, property "name" = title-case name)
const SP_GEOJSON_URL =
  "https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-35-mun.json";

function injectStyle(id: string, css: string) {
  if (typeof document === "undefined" || document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

function normalizeStr(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function featureCentroid(geometry: { type: string; coordinates: unknown }): [number, number] | null {
  let ring: number[][] = [];
  if (geometry.type === "Polygon") {
    ring = (geometry.coordinates as number[][][])[0] ?? [];
  } else if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as number[][][][];
    ring = polys.reduce((a, b) => (a[0].length >= b[0].length ? a : b))[0] ?? [];
  }
  if (!ring.length) return null;
  return [
    ring.reduce((s, c) => s + c[0], 0) / ring.length,
    ring.reduce((s, c) => s + c[1], 0) / ring.length,
  ];
}

const NOC_CSS = `
@keyframes vmFadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes vmRing{0%{transform:scale(.85);opacity:.75}100%{transform:scale(2.6);opacity:0}}
@keyframes vmScan{0%{top:-14%}100%{top:114%}}
@keyframes vmTick{from{width:0}to{width:100%}}
@keyframes vmBlink{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes vmHeroPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}
@keyframes vmFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.vm-rise{opacity:0;animation:vmFadeUp .55s cubic-bezier(.22,.7,.2,1) forwards}
.vm-card{transition:transform .25s cubic-bezier(.22,.7,.2,1),box-shadow .25s ease}
.vm-card:hover{transform:translateY(-3px);box-shadow:0 14px 34px rgba(6,24,16,.10)}
`;

/* ─── primitives ────────────────────────────────────────────────────────── */

function Skeleton({ h }: { h: number }) {
  return <div className="w-full animate-pulse rounded-xl bg-[var(--vm-tile-2)]" style={{ height: h }} />;
}

function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  useEffect(() => { injectStyle("vm-noc-css", NOC_CSS); }, []);
  return (
    <div
      className={`vm-card flex flex-col overflow-hidden rounded-2xl bg-white ${className}`}
      style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", ...style }}
    >
      {children}
    </div>
  );
}

/* ── AprovacoesChart (clone do VelocityChart p/ 2 séries) ───────────────────
   Mesmo tratamento visual (linha suave, área gradiente, grid, eixo X) do
   VelocityChart de Vistorias Finalizadas — mas com DUAS séries na MESMA
   escala (nunca eixo duplo: um gráfico com escalas independentes por série
   mentiria sobre o tamanho relativo das duas). Sem linha de média/pico (com
   2 séries isso vira poluição visual); no lugar, rótulo direto no fim de
   cada linha com o valor do dia mais recente. */
function AprovacoesChart({
  labels,
  serieA,
  corA,
  serieB,
  corB,
}: {
  labels: string[];
  serieA: number[];
  corA: string;
  serieB: number[];
  corB: string;
}) {
  if (!labels.length) return null;
  const VB_W = 1000;
  const H = 160;
  const padX = 12;
  const padTop = 22;
  const padBottom = 24;
  const plotH = H - padTop - padBottom;
  const n = labels.length;
  const max = Math.max(...serieA, ...serieB, 1);

  const x = (i: number) => padX + (n === 1 ? 0 : (i / (n - 1)) * (VB_W - padX * 2));
  const y = (v: number) => padTop + (1 - v / max) * plotH;

  const pathFor = (values: number[]) => {
    const pts = values.map((v, i) => [x(i), y(v)] as const);
    return pts
      .map(([px, py], i) => {
        if (i === 0) return `M${px.toFixed(1)},${py.toFixed(1)}`;
        const [qx, qy] = pts[i - 1];
        const mx = (qx + px) / 2;
        return `Q${qx.toFixed(1)},${qy.toFixed(1)} ${mx.toFixed(1)},${((qy + py) / 2).toFixed(1)} T${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(" ");
  };
  const fillFor = (line: string) => `${line} L${x(n - 1).toFixed(1)},${H - padBottom} L${x(0).toFixed(1)},${H - padBottom} Z`;

  const lineA = pathFor(serieA);
  const lineB = pathFor(serieB);

  const tickIdx = Array.from({ length: Math.min(5, n) }, (_, k) =>
    Math.round((k / (Math.min(5, n) - 1 || 1)) * (n - 1))
  );
  const pctLeft = (px: number) => `${(px / VB_W) * 100}%`;

  const ultimoA = serieA[n - 1] ?? 0;
  const ultimoB = serieB[n - 1] ?? 0;

  return (
    <div className="relative" style={{ height: H }}>
      <svg viewBox={`0 0 ${VB_W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="vm-aprov-grad-a" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={corA} stopOpacity="0.15" />
            <stop offset="100%" stopColor={corA} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="vm-aprov-grad-b" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={corB} stopOpacity="0.15" />
            <stop offset="100%" stopColor={corB} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* grid horizontal */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={VB_W - padX}
            y1={padTop + plotH * t}
            y2={padTop + plotH * t}
            stroke="var(--vm-border-soft)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={fillFor(lineB)} fill="url(#vm-aprov-grad-b)" />
        <path d={fillFor(lineA)} fill="url(#vm-aprov-grad-a)" />
        <path d={lineB} fill="none" stroke={corB} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={lineA} fill="none" stroke={corA} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(n - 1)} cy={y(ultimoA)} r="3.2" fill={corA} />
        <circle cx={x(n - 1)} cy={y(ultimoB)} r="3.2" fill={corB} />
      </svg>

      {/* rótulos diretos no fim de cada linha */}
      <span
        className="pointer-events-none absolute translate-x-1 -translate-y-1/2 whitespace-nowrap text-[10px] font-bold"
        style={{ left: pctLeft(x(n - 1)), top: `${y(ultimoA)}px`, color: corA }}
      >
        {ultimoA}
      </span>
      <span
        className="pointer-events-none absolute translate-x-1 -translate-y-1/2 whitespace-nowrap text-[10px] font-bold"
        style={{ left: pctLeft(x(n - 1)), top: `${y(ultimoB)}px`, color: corB }}
      >
        {ultimoB}
      </span>

      {/* eixo X */}
      <div className="absolute inset-x-0 bottom-0 h-[16px]">
        {tickIdx.map((i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 text-[0.7rem] text-[var(--vm-faint)]"
            style={{ left: pctLeft(x(i)) }}
          >
            {labels[i]}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── PipelineWidget (self-contained) ───────────────────────────────────────
   Distribuição de TODAS as vistorias por estado operacional: barra empilhada
   + legenda com contagem e %. Traz Devoluções e Rejeições, que não apareciam
   em nenhum gráfico do dashboard. Cada item leva pra sua tela. */
function PipelineWidget({ stats }: { stats: PainelStats | null }) {
  const segs = useMemo(() => {
    const s = stats;
    const concluidas = (s?.vistoriadas ?? 0) + (s?.revisitadas ?? 0);
    const revisitas = (s?.aguardandoRevisita ?? 0) + (s?.emRevisita ?? 0);
    const base = [
      { key: "pendentes",  label: "Pendentes",   value: s?.pendentes ?? 0,  color: "#F59E0B", icon: ClipboardList, href: "/painel/vistorias" },
      { key: "emVistoria", label: "Em vistoria", value: s?.emVistoria ?? 0,  color: "#3B82F6", icon: Activity,      href: "/painel/andamento" },
      { key: "concluidas", label: "Concluídas",  value: concluidas,          color: "#10B981", icon: CheckCircle2,  href: "/painel/realizadas" },
      { key: "aprovados",  label: "Aprovados",   value: s?.aprovadas ?? 0,   color: "#22C55E", icon: ShieldCheck,   href: "/painel/realizadas" },
      { key: "revisitas",  label: "Reprovados CPFL", value: revisitas,        color: "#A855F7", icon: RotateCw,      href: "/painel/revisitas" },
      { key: "devolucoes", label: "Devoluções",  value: s?.devolvidas ?? 0,  color: "#DC2626", icon: Undo2,         href: "/painel/devolucoes" },
      { key: "rejeicoes",  label: "Rejeições",   value: s?.rejeitadas ?? 0,  color: "#6B7280", icon: Ban,           href: "/painel/rejeitadas" },
    ];
    const total = base.reduce((a, b) => a + b.value, 0);
    return { total, items: base.map((b) => ({ ...b, pct: total > 0 ? (b.value / total) * 100 : 0 })) };
  }, [stats]);

  const loading = !stats;

  return (
    <Card>
      <div style={{ height: 3, background: "linear-gradient(90deg,#F59E0B,#3B82F6,#10B981,#22C55E,#A855F7,#DC2626,#6B7280)", flexShrink: 0 }} />
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.18)" }}>
            <Layers className="h-3.5 w-3.5 text-[#6366F1]" strokeWidth={2} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-semibold text-[var(--vm-text)]">Distribuição das Vistorias</span>
            <span className="text-[9.5px] text-[var(--vm-faint)]">todo o pipeline por estado operacional</span>
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[22px] font-bold tabular-nums text-[var(--vm-text)]">{loading ? "—" : <CountUp value={segs.total} />}</span>
          <span className="text-[10px] text-[var(--vm-faint)]">total</span>
        </div>
      </div>

      {loading ? (
        <div className="px-5 pb-5"><Skeleton h={120} /></div>
      ) : segs.total === 0 ? (
        <div className="px-5 pb-8 pt-4 text-center text-[12px] text-[var(--vm-faint)]">Sem vistorias no sistema.</div>
      ) : (
        <div className="px-5 pb-5">
          {/* barra empilhada */}
          <div className="flex h-8 w-full gap-[3px] overflow-hidden rounded-xl" style={{ background: "var(--vm-tile-2)" }}>
            {segs.items.filter((s) => s.value > 0).map((s, i) => (
              <motion.div
                key={s.key}
                initial={{ width: 0 }}
                animate={{ width: `${s.pct}%` }}
                transition={{ duration: 0.9, delay: 0.05 * i, ease: [0.22, 0.7, 0.2, 1] }}
                title={`${s.label}: ${s.value} (${s.pct.toFixed(1)}%)`}
                style={{ background: s.color, minWidth: 3 }}
              />
            ))}
          </div>

          {/* legenda */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-7">
            {segs.items.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.key}
                  href={s.href}
                  className="flex items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-[var(--vm-tile)]"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${s.color}18` }}>
                    <Icon className="h-3.5 w-3.5" style={{ color: s.color }} strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[15px] font-bold tabular-nums text-[var(--vm-text)]">{s.value}</span>
                      <span className="text-[10px] font-semibold tabular-nums" style={{ color: s.color }}>{s.pct.toFixed(0)}%</span>
                    </div>
                    <span className="block truncate text-[10.5px] text-[var(--vm-faint)]">{s.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}




/* ─── ParticlesCanvas ───────────────────────────────────────────────────── */

function ParticlesCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const resize = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    const N = 26;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00014,
      vy: (Math.random() - 0.5) * 0.00014,
    }));
    const draw = () => {
      const { width: w, height: h } = cv;
      ctx.clearRect(0, 0, w, h);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
      });
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = (pts[i].x - pts[j].x) * w;
          const dy = (pts[i].y - pts[j].y) * h;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 115) {
            ctx.globalAlpha = (1 - d / 115) * 0.28;
            ctx.strokeStyle = "#00ff88";
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(pts[i].x * w, pts[i].y * h);
            ctx.lineTo(pts[j].x * w, pts[j].y * h);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#00ff88";
      pts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 1.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return (
    <canvas
      ref={ref}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE
   ══════════════════════════════════════════════════════════════════════════ */

export default function PainelOverviewPage() {
  // Filtro de período único — controla todo widget histórico da página (ver
  // comentário em PeriodoModo). Estado vive aqui, no topo, porque tanto o
  // efeito principal (historico) quanto o de Top Técnicos dependem dele.
  const [periodoModo, setPeriodoModo] = useState<PeriodoModo>("30dias");
  const [periodoCustomInicio, setPeriodoCustomInicio] = useState("");
  const [periodoCustomFim, setPeriodoCustomFim] = useState("");

  // Resolve o modo em {inicio, fim, dias} reais. "Personalizado" sem os 2
  // campos preenchidos cai no default de 30 dias até o usuário completar.
  const periodoRange = useMemo(() => {
    const hoje = isoHoje();
    if (periodoModo === "hoje") return { inicio: hoje, fim: hoje, dias: 1 };
    if (periodoModo === "7dias") return { inicio: isoDiasAtras(6), fim: hoje, dias: 7 };
    if (periodoModo === "todoperiodo") {
      return {
        inicio: INICIO_DOS_TEMPOS,
        fim: hoje,
        dias: diasEntreInclusive(INICIO_DOS_TEMPOS, hoje),
      };
    }
    if (periodoModo === "personalizado" && periodoCustomInicio && periodoCustomFim) {
      return {
        inicio: periodoCustomInicio,
        fim: periodoCustomFim,
        dias: diasEntreInclusive(periodoCustomInicio, periodoCustomFim),
      };
    }
    return { inicio: isoDiasAtras(29), fim: hoje, dias: 30 };
  }, [periodoModo, periodoCustomInicio, periodoCustomFim]);

  // Filtro global "Concessionária" (2026-09-24) — "" = Tudo. Junto com
  // periodoRange, é a outra dimensão que TODO widget alimentado por
  // stats/historico/topTecsDash/mapaRealtime tem que respeitar (achado em
  // campo: "Vistorias no mapa tem que ser fidedigno aos filtros também").
  const [concessionaria, setConcessionaria] = useState("");
  const [concessionariasDisponiveis, setConcessionariasDisponiveis] = useState<string[]>([]);
  useEffect(() => {
    painelService.fetchConcessionarias().then(setConcessionariasDisponiveis).catch(() => {});
  }, []);
  // Filtro global de Município (2026-09-25) — mesmo alcance de concessionária.
  const [municipio, setMunicipio] = useState("");
  // Incrementado pelo botão "Atualizar" da Equipe ao Vivo — força o load()
  // e o poll de topTecsDash a rodar imediatamente, sem esperar o intervalo.
  const [refreshTick, setRefreshTick] = useState(0);

  const [stats,        setStats]        = useState<PainelStats | null>(null);
  const [tecnicos,     setTecnicos]     = useState<TecnicoAtivo[]>([]);
  const [revisitas,    setRevisitas]    = useState<RevisitaPendente[]>([]);
  const [audit,        setAudit]        = useState<AuditEntry[]>([]);
  const [historico,    setHistorico]    = useState<HistoricoAnalytics | null>(null);
  const [mapaRealtime, setMapaRealtime] = useState<PainelMapaResponse | null>(null);
  const [now,          setNow]          = useState(() => new Date());

  useEffect(() => {
    injectStyle("vm-noc-css", NOC_CSS);
    let alive = true;
    // Início mais antigo SÓ pra série diária (dá pra comparar "este período"
    // com "o anterior" no Widget de Vistorias Finalizadas) — mas
    // totais/taxas/médias (Padrão Diário, gauges de Equipe ao Vivo) usam
    // inicio/fim reais, refletindo exatamente o período selecionado.
    //
    // O "olhar pra trás" é limitado a 366 dias mesmo quando o período
    // selecionado é enorme (Todo Período, ~anos) — dobrar um período já
    // gigante pra achar "o anterior" não faz sentido (não existe "período
    // antes de todo o histórico") e essa comparação nem é usada nesse
    // modo. Sem o cap, achado em campo 2026-09-18: Todo Período pedia um
    // inicioSerie tão distante que passava do limite de segurança do
    // endpoint, a chamada falhava, e por não ter isolamento por request
    // (ver Promise.allSettled abaixo) o /painel inteiro congelava nos
    // últimos números válidos — sintoma visível: "Aprovadas 463 · 135%".
    const lookbackDias = Math.min(periodoRange.dias, 366);
    const d = new Date(periodoRange.fim);
    d.setDate(d.getDate() - (periodoRange.dias + lookbackDias - 1));
    const inicioSerie = d.toISOString().slice(0, 10);
    const load = async () => {
      // allSettled, não all: um endpoint falhando (rede, timeout, período
      // fora do alcance do backend) não pode mais travar os OUTROS nem
      // deixar o dashboard com números de fetches de momentos diferentes
      // coexistindo na tela — cada um atualiza seu próprio estado só
      // quando responde com sucesso; senão mantém o último valor bom e
      // avisa no console (achado em campo 2026-09-18, ver comentário do
      // MAX_DIAS/lookbackDias acima).
      const mapaParams = new URLSearchParams({ inicio: periodoRange.inicio, fim: periodoRange.fim });
      if (concessionaria) mapaParams.set("concessionaria", concessionaria);
      const mapaQs = `?${mapaParams.toString()}`;
      const [s, t, r, a, h, mp] = await Promise.allSettled([
        painelService.fetchStats(concessionaria, municipio),
        painelService.fetchTecnicos(),
        painelService.fetchRevisitas(),
        painelService.fetchAudit({ limit: 8 }),
        painelService.fetchHistorico(periodoRange.inicio, periodoRange.fim, inicioSerie, concessionaria, municipio),
        api.get<PainelMapaResponse>(`/painel/mapa${mapaQs}`).then(res => res.data).catch(() => null),
      ]);
      if (!alive) return;
      if (s.status === "fulfilled") setStats(s.value); else console.warn("[painel] fetchStats falhou:", s.reason);
      if (t.status === "fulfilled") setTecnicos(t.value); else console.warn("[painel] fetchTecnicos falhou:", t.reason);
      if (r.status === "fulfilled") setRevisitas(r.value); else console.warn("[painel] fetchRevisitas falhou:", r.reason);
      if (a.status === "fulfilled") setAudit(a.value); else console.warn("[painel] fetchAudit falhou:", a.reason);
      if (h.status === "fulfilled") setHistorico(h.value); else console.warn("[painel] fetchHistorico falhou:", h.reason);
      if (mp.status === "fulfilled" && mp.value) setMapaRealtime(mp.value);
      setNow(new Date());
    };
    load();
    const poll = window.setInterval(load, 20_000);
    const tick = window.setInterval(() => setNow(new Date()), 1_000);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, [periodoRange, concessionaria, municipio, refreshTick]);

  // Instalação — poll totalmente independente do bloco acima (nunca entra
  // no Promise.all da Vistoria), pra garantir zero interferência se essa
  // chamada falhar ou atrasar.
  const [instalacaoStats, setInstalacaoStats] = useState<PainelInstalacoesStats | null>(null);
  useEffect(() => {
    let alive = true;
    const loadInstalacao = () => {
      fetchInstalacoesStats()
        .then((s) => { if (alive) setInstalacaoStats(s); })
        .catch(() => {});
    };
    loadInstalacao();
    const poll = window.setInterval(loadInstalacao, 20_000);
    return () => { alive = false; clearInterval(poll); };
  }, []);

  // Top Técnicos — antes tinha um seletor de período PRÓPRIO (Hoje/Semana/
  // 30d/Personalizado); agora segue o filtro global igual todo o resto,
  // com o MESMO inicio/fim do historico acima. Poll continua isolado do
  // bloco principal (zero interferência se atrasar).
  const [topTecsDash, setTopTecsDash] = useState<TopTecnicosDashboard | null>(null);
  const [topTecsLoading, setTopTecsLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setTopTecsLoading(true);
    const load = () =>
      painelService
        // limit=50 (não o default 8): a Análise Operacional dos Técnicos
        // precisa da equipe INTEIRA na lateral pra seleção, não só o top 8 —
        // e como kpiAtribuidas/kpiRealizadas/tecnicosPorReprovacao/
        // equipePeriodo somam sobre esse mesmo array, também deixam de
        // ficar (silenciosamente) truncados no top 8.
        .fetchTopTecnicosDashboard("personalizado", periodoRange.inicio, periodoRange.fim, concessionaria, 50, municipio)
        .then((d) => { if (alive) setTopTecsDash(d); })
        .finally(() => { if (alive) setTopTecsLoading(false); });
    load();
    const poll = window.setInterval(load, 30_000);
    return () => { alive = false; clearInterval(poll); };
  }, [periodoRange, concessionaria, municipio, refreshTick]);

  /* ── derived ── */
  const emCampo    = useMemo(() => tecnicos.filter(t => t.status === "em-campo").length, [tecnicos]);
  const expediente = useMemo(
    () => tecnicos.filter(t => t.status === "em-campo" || t.status === "base").length,
    [tecnicos],
  );
  // ── dados reais do novo "Equipe ao vivo" (EquipeAoVivoWidget) ──────────
  // Achado em campo 2026-09-23: os números desta seção têm que seguir o
  // MESMO filtro de período central de todo o resto da tela (não "hoje"
  // fixo) — por isso tudo aqui sai de topTecsDash/historico (já respeitam
  // periodoRange), nunca de TecnicoAtivo.atribuidas/concluidasHoje.
  const equipePeriodo = useMemo(() => {
    const porId = new Map(tecnicos.map((t) => [String(t.id), t]));
    return (topTecsDash?.tecnicos ?? [])
      .map((ranking) => ({ ranking, ativo: porId.get(String(ranking.id)) ?? null }))
      // Só exclui quem está CONFIRMADAMENTE offline agora (tem registro ao
      // vivo e o status é offline). Quem não tem registro ao vivo — técnico
      // que já saiu da empresa, ex.: José Renato — continua aparecendo em
      // "Todo Período"/período que cobre quando ele trabalhou; achado em
      // campo 2026-09-23: exigir `ativo` sempre presente escondia todo
      // técnico desligado, mesmo com dado real do período selecionado.
      .filter((x) => x.ativo?.status !== "offline")
      .sort((a, b) => b.ranking.total - a.ranking.total);
  }, [topTecsDash, tecnicos]);
  const tecnicosPorReprovacao = [...(topTecsDash?.tecnicos ?? [])]
    .filter((t) => t.revisitas > 0)
    .sort((a, b) => b.revisitas - a.revisitas)
    .slice(0, 6);
  const motivosReprovacaoEquipe = historico?.motivosReprovacao ?? [];
  const motivosImpedimentoEquipe = historico?.motivosImpedimento ?? [];
  // Fiel aos KPIs (2026-09-24): antes o mapa só mostrava "hoje/em aberto" e
  // nunca batia com "Atribuídas" do período (ex.: 325 atribuídas, poucos
  // pinos) — o corte por período+concessionária agora é feito no servidor
  // (fetchPainelMapa), igual ao critério de Atribuídas. Aqui só filtra o
  // que realmente não dá pra plotar (sem técnico ou sem coordenada válida).
  const vistoriasMapa = useMemo(
    () => (mapaRealtime?.vistorias ?? []).filter((v) => v.tecnico_id != null),
    [mapaRealtime],
  );
  const tecnicosMapa = useMemo(
    () => (mapaRealtime?.tecnicos ?? []).filter((t) => t.status_operacional !== "offline"),
    [mapaRealtime],
  );

  // Rótulo legível do período pros títulos dos widgets — "Hoje" fica feio
  // como "1 dias", e Personalizado mostra o intervalo de fato escolhido.
  const periodoLabel = useMemo(() => {
    if (periodoModo === "hoje") return "Hoje";
    if (periodoModo === "7dias") return "7 dias";
    if (periodoModo === "30dias") return "30 dias";
    const fmt = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };
    return `${fmt(periodoRange.inicio)} a ${fmt(periodoRange.fim)}`;
  }, [periodoModo, periodoRange]);

  const velocity = useMemo(() => {
    if (!historico) return { values: [] as number[], labels: [] as string[], avg: 0, peak: 0, total: 0, totalPrev: 0, delta: 0 };
    // serieDiaria tem 2×periodoRange.dias dias (ver inicioSerie no efeito
    // acima) — metade mais recente é "este período", a outra metade é "o
    // anterior", pra manter o comparativo de variação % seguindo o filtro.
    const dias   = periodoRange.dias;
    const all    = historico.serieDiaria;
    const last   = all.slice(-dias);
    const prev   = all.slice(-dias * 2, -dias);
    const values = last.map(d => d.finalizadas);
    const labels = last.map(d => diaCurto(d.dia));
    const avg    = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const peak   = Math.max(...values, 0);
    const total  = values.reduce((a, b) => a + b, 0);
    const totalPrev = prev.reduce((a, b) => a + b.finalizadas, 0);
    const delta  = totalPrev > 0 ? ((total - totalPrev) / totalPrev) * 100 : 0;
    return { values, labels, avg, peak, total, totalPrev, delta };
  }, [historico, periodoRange]);

  // Mesmo recorte de velocity acima (metade recente = período, metade
  // anterior = comparação), só que com as 2 séries de aprovação em vez de
  // "finalizadas" — alimenta o clone de Vistorias Finalizadas.
  const aprovacoesVelocity = useMemo(() => {
    const vazio = {
      labels: [] as string[],
      semPendencia: [] as number[],
      comPendencia: [] as number[],
      totalSemPendencia: 0,
      totalComPendencia: 0,
      total: 0,
      totalPrev: 0,
      delta: 0,
    };
    if (!historico) return vazio;
    const dias = periodoRange.dias;
    const all  = historico.serieDiaria;
    const last = all.slice(-dias);
    const prev = all.slice(-dias * 2, -dias);
    const labels = last.map((d) => diaCurto(d.dia));
    const semPendencia = last.map((d) => d.aprovadasSemPendencia);
    const comPendencia = last.map((d) => d.aprovadasComPendencia);
    const totalSemPendencia = semPendencia.reduce((a, b) => a + b, 0);
    const totalComPendencia = comPendencia.reduce((a, b) => a + b, 0);
    const total = totalSemPendencia + totalComPendencia;
    const totalPrev = prev.reduce((a, d) => a + d.aprovadasSemPendencia + d.aprovadasComPendencia, 0);
    const delta = totalPrev > 0 ? ((total - totalPrev) / totalPrev) * 100 : 0;
    return { labels, semPendencia, comPendencia, totalSemPendencia, totalComPendencia, total, totalPrev, delta };
  }, [historico, periodoRange]);

  const alertaRevisitas = revisitas.filter(
    r => r.prioridade === "CRITICA" || r.prioridade === "ALTA",
  );

  const heroStats = stats
    ? [
        { val: fmtNum(stats.pendentes + stats.emVistoria), label: "vistorias na fila" },
        { val: String(expediente),                         label: "em expediente"     },
        { val: String(emCampo),                            label: "técnico em campo"  },
        { val: fmtNum(stats.municipiosAtivos),             label: "municípios ativos" },
      ]
    : null;

  const kpis = [
    { label: "Backlog",     raw: stats ? stats.pendentes  : undefined, value: stats ? fmtNum(stats.pendentes)  : "—",  sub: "aguardando atribuição",  color: "#F59E0B", icon: ClipboardList, href: "/painel/vistorias" },
    { label: "Em vistoria", raw: stats ? stats.emVistoria : undefined, value: stats ? fmtNum(stats.emVistoria) : "—",  sub: `${emCampo} técnico${emCampo !== 1 ? "s" : ""} em campo`, color: "#3B82F6", icon: Activity,    href: "/painel/mapa" },
    { label: "Concluídas",  raw: stats ? stats.vistoriadas + stats.revisitadas : undefined, value: stats ? fmtNum(stats.vistoriadas + stats.revisitadas): "—",  sub: "aguardando aprovação",   color: "#10B981", icon: CheckCircle2, href: "/painel/historico" },
    { label: "Reprovados CPFL", raw: stats ? (stats.aguardandoRevisita ?? 0) + (stats.emRevisita ?? 0) : undefined, value: stats ? fmtNum((stats.aguardandoRevisita ?? 0) + (stats.emRevisita ?? 0)) : "—", sub: `${stats?.aguardandoRevisita ?? 0} sem técnico`, color: "#F97316", icon: RotateCw, href: "/painel/revisitas" },
    { label: "Projetos Aprovados", raw: stats ? (stats.aprovadas ?? 0) : undefined, value: stats ? fmtNum(stats.aprovadas ?? 0) : "—", sub: "validação concluída", color: "#22C55E", icon: ShieldCheck, href: undefined as string | undefined },
    { label: "Municípios",  raw: stats ? stats.municipiosAtivos : undefined, value: stats ? fmtNum(stats.municipiosAtivos)   : "—", sub: "com equipamentos ativos", color: "#8B5CF6", icon: Building2, href: undefined as string | undefined },
    { label: "Equipe",      raw: stats ? stats.tecnicosAtivos : undefined, value: stats ? fmtNum(stats.tecnicosAtivos)     : "—", sub: `${emCampo} em campo agora`, color: ACCENT, icon: Users, href: "/painel/tecnicos" },
  ];

  /* ══════════════════════════════ RENDER ══════════════════════════════ */
  return (
    <div className="space-y-4 pb-4">

      {/* ════════════ HERO NOC ════════════ */}
      <div style={{ borderRadius: 16, overflow: "hidden" }}>

        {/* NAVBAR */}
        <div style={{ height: 48, background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", padding: "0 24px", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00ff88", animation: "vmHeroPulse 2s infinite", display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.12em", color: "#00ff88", whiteSpace: "nowrap" }}>SISTEMA EM OPERAÇÃO</span>
            <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>atualiza a cada 28s</span>
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <div style={{ width: 360, display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "0 12px", height: 32 }}>
              <Search style={{ width: 13, height: 13, color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
              <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.28)" }}>Buscar por ativo, técnico ou local</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            {alertaRevisitas.length > 0 && (
              <Link href="/painel/revisitas" style={{ display: "flex", alignItems: "center", gap: 4, borderRadius: 6, border: "1px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.1)", padding: "4px 10px", fontSize: "0.76rem", fontWeight: 600, color: "#f59e0b", textDecoration: "none" }}>
                <ShieldAlert style={{ width: 12, height: 12 }} />{alertaRevisitas.length} alerta{alertaRevisitas.length !== 1 ? "s" : ""}
              </Link>
            )}
            <span style={{ fontSize: "1.05rem", fontWeight: 600, color: "#fff", fontFamily: "monospace", letterSpacing: "0.04em" }}>
              {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <Link href="/painel/vistorias" style={{ display: "flex", alignItems: "center", gap: 6, background: "#00ff88", color: "#052e28", fontWeight: 700, fontSize: "0.83rem", borderRadius: 8, padding: "8px 20px", textDecoration: "none" }}>
              <UserPlus style={{ width: 13, height: 13 }} />Atribuir
            </Link>
          </div>
        </div>

        {/* HERO BODY */}
        <div style={{ height: 520, background: "#0d1117", position: "relative", overflow: "hidden" }}>

          {/* Grid pattern */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(0,255,136,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,0.025) 1px,transparent 1px)", backgroundSize: "40px 40px" }} />

          {/* Content row */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "stretch" }}>

            {/* LEFT — título + contexto + botões */}
            <div style={{ width: 360, padding: "38px 28px 38px 40px", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", zIndex: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <span style={{ display: "inline-block", width: 40, height: 2, background: "#00ff88", flexShrink: 0 }} />
                <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.2em", color: "#00ff88" }}>CENTRAL GIOC</span>
              </div>
              <h1 style={{ fontSize: "clamp(2rem,3.6vw,3rem)", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.02em", color: "#fff", margin: "0 0 16px" }}>
                Operação<br />em<br />
                <span style={{ color: "#00ff88" }}>movimento.</span>
              </h1>
              <div style={{ width: 48, height: 2, background: "#00ff88", marginBottom: 18 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.78rem", color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}>
                  <Users style={{ width: 13, height: 13, color: "#00ff88", flexShrink: 0 }} />
                  {stats ? `${fmtNum(stats.pendentes + stats.emVistoria)} na fila · ${expediente}/${stats.tecnicosAtivos} em expediente` : "—"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.78rem", color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}>
                  <MapIcon style={{ width: 13, height: 13, color: "#00ff88", flexShrink: 0 }} />
                  {stats ? `${emCampo} em campo · ${fmtNum(stats.municipiosAtivos)} municípios ativos` : "—"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Link
                  href="/painel/vistorias"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#00ff88", color: "#052e28", fontWeight: 700, fontSize: "0.88rem", borderRadius: 8, padding: "14px 20px", textDecoration: "none", transition: "transform 0.2s ease" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateX(4px)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateX(0)"; }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}><UserPlus style={{ width: 15, height: 15 }} />Atribuir Vistorias</span>
                  <ArrowRight style={{ width: 14, height: 14 }} />
                </Link>
                <Link
                  href="/painel/mapa"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", color: "#fff", fontWeight: 500, fontSize: "0.88rem", borderRadius: 8, padding: "14px 20px", textDecoration: "none", border: "1px solid rgba(255,255,255,0.2)", transition: "transform 0.2s ease" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateX(4px)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateX(0)"; }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}><MapIcon style={{ width: 15, height: 15 }} />Mapa em Tempo Real</span>
                  <ArrowRight style={{ width: 14, height: 14 }} />
                </Link>
              </div>
            </div>

            {/* CENTER — vis.png + efeitos de camada */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden", backgroundImage: `url('${asset("/vis.png")}')`, backgroundSize: "cover", backgroundPosition: "center" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, #0d1117 0%, transparent 35%, transparent 65%, #0d1117 100%)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 60%, #0d1117 100%)", pointerEvents: "none" }} />
              <ParticlesCanvas />
              <div style={{ position: "absolute", left: "18%", top: "20%", width: 42, height: 42, borderRadius: "50%", border: "1px solid rgba(0,255,136,0.55)", background: "rgba(0,255,136,0.07)", display: "flex", alignItems: "center", justifyContent: "center", animation: "vmFloat 3s ease-in-out infinite", pointerEvents: "none" }}>
                <Activity style={{ width: 18, height: 18, color: "rgba(0,255,136,0.75)" }} />
              </div>
              <div style={{ position: "absolute", right: "16%", top: "22%", width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(0,255,136,0.5)", background: "rgba(0,255,136,0.06)", display: "flex", alignItems: "center", justifyContent: "center", animation: "vmFloat 3s ease-in-out 1.5s infinite", pointerEvents: "none" }}>
                <Zap style={{ width: 16, height: 16, color: "rgba(0,255,136,0.7)" }} />
              </div>
              <div style={{ position: "absolute", left: "50%", top: "44%", transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
                <div style={{ position: "relative", width: 14, height: 14 }}>
                  <span style={{ position: "absolute", inset: -14, borderRadius: "50%", border: "1.5px solid rgba(0,255,136,0.5)", animation: "vmRing 2.2s ease-out infinite", display: "block" }} />
                  <span style={{ position: "absolute", inset: -8, borderRadius: "50%", border: "1px solid rgba(0,255,136,0.3)", animation: "vmRing 2.2s ease-out 0.7s infinite", display: "block" }} />
                  <span style={{ display: "block", width: "100%", height: "100%", borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 14px #00ff88" }} />
                </div>
              </div>
              <div style={{ position: "absolute", inset: "0 0 0 0", height: 80, background: "linear-gradient(180deg,transparent,rgba(0,255,136,0.05),transparent)", animation: "vmScan 7s linear infinite", pointerEvents: "none" }} />
            </div>

            {/* RIGHT — 5 KPI cards (2×2 + 1 larga) */}
            <div style={{ width: 460, padding: 16, display: "flex", alignItems: "center", position: "relative", zIndex: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}>
                {([
                  { k: kpis[0], color: "#00ff88" },
                  { k: kpis[1], color: "#4A9EFF" },
                  { k: kpis[2], color: "#00ff88" },
                  { k: kpis[3], color: "#f59e0b" },
                  { k: kpis[4], color: "#22c55e", span: true },
                ]).map(({ k, color, span }, i) => {
                  const Icon = k.icon;
                  // Chip de contexto por card — dado real (audit 24h / campo).
                  // active = colorido; senão fica neutro (sem inventar tendência).
                  const atrib24 = stats?.atribuidas24h ?? 0;
                  const fin24 = stats?.finalizadas24h ?? 0;
                  const semTec = stats?.aguardandoRevisita ?? 0;
                  let chip: { icon: React.ReactNode; text: string; active: boolean };
                  if (i === 0) {
                    chip = atrib24 > 0
                      ? { icon: <ArrowUp style={{ width: 11, height: 11, transform: "rotate(180deg)" }} strokeWidth={2.6} />, text: `${atrib24} atribuída${atrib24 !== 1 ? "s" : ""} · 24h`, active: true }
                      : { icon: <Clock style={{ width: 11, height: 11 }} strokeWidth={2.2} />, text: "sem movimentação · 24h", active: false };
                  } else if (i === 1) {
                    chip = { icon: <Users style={{ width: 11, height: 11 }} strokeWidth={2.2} />, text: `${emCampo} técnico${emCampo !== 1 ? "s" : ""} em campo`, active: emCampo > 0 };
                  } else if (i === 2) {
                    chip = fin24 > 0
                      ? { icon: <ArrowUp style={{ width: 11, height: 11 }} strokeWidth={2.6} />, text: `${fin24} finalizada${fin24 !== 1 ? "s" : ""} · 24h`, active: true }
                      : { icon: <CheckCircle2 style={{ width: 11, height: 11 }} strokeWidth={2.2} />, text: "aguardando aprovação", active: false };
                  } else if (i === 3) {
                    chip = { icon: <Clock style={{ width: 11, height: 11 }} strokeWidth={2.2} />, text: `${semTec} sem técnico`, active: semTec > 0 };
                  } else {
                    chip = { icon: <ShieldCheck style={{ width: 11, height: 11 }} strokeWidth={2.2} />, text: "validação concluída", active: (stats?.aprovadas ?? 0) > 0 };
                  }
                  return (
                    <motion.div
                      key={k.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 + i * 0.07, duration: 0.35 }}
                      whileHover={{ scale: 1.02 }}
                      onMouseEnter={(e) => { const t = e.currentTarget as HTMLElement; t.style.borderColor = `${color}55`; t.style.background = "rgba(255,255,255,0.06)"; }}
                      onMouseLeave={(e) => { const t = e.currentTarget as HTMLElement; t.style.borderColor = "rgba(255,255,255,0.08)"; t.style.background = "rgba(255,255,255,0.04)"; }}
                      style={{
                        position: "relative",
                        gridColumn: span ? "1 / -1" : undefined,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 14,
                        padding: 16,
                        backdropFilter: "blur(8px)",
                        cursor: k.href ? "pointer" : "default",
                        overflow: "hidden",
                        ...(span ? { display: "flex", alignItems: "center", gap: 20 } : {}),
                      }}
                    >
                      {/* faixa de cor lateral sutil */}
                      <div style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: 999, background: color, opacity: 0.9 }} />
                      {/* header: ícone tint + label */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: span ? 0 : 14, flexShrink: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, background: `${color}22`, border: `1px solid ${color}33` }}>
                          <Icon style={{ width: 13, height: 13, color }} strokeWidth={2} />
                        </span>
                        <span style={{ fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>{k.label.toUpperCase()}</span>
                      </div>
                      {/* número */}
                      <div style={{ fontSize: "2.9rem", fontWeight: 800, color: "#fff", lineHeight: 1, marginBottom: span ? 0 : 12, letterSpacing: "-0.02em" }}>
                        {k.raw != null ? <CountUp value={k.raw} /> : "—"}
                      </div>
                      {/* chip de contexto */}
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          marginLeft: span ? "auto" : undefined,
                          gap: 5,
                          padding: "3px 9px",
                          borderRadius: 999,
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          background: chip.active ? `${color}1A` : "rgba(255,255,255,0.05)",
                          color: chip.active ? color : "rgba(255,255,255,0.5)",
                          border: `1px solid ${chip.active ? `${color}2E` : "rgba(255,255,255,0.07)"}`,
                        }}
                      >
                        {chip.icon}
                        {chip.text}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

          </div>


        </div>

      </div>

      {/* ════════════ FILTRO DE PERÍODO — controla os widgets históricos abaixo ════════════
          Não mexe em nada ao vivo (Equipe ao Vivo/mapa, Atividade ao vivo,
          Reprovados CPFL, Pendentes CPFL, distribuição do pipeline, KPIs do
          topo) — só nos que mostram um recorte de dias (ver PeriodoModo). */}
      <div
        className="vm-rise flex flex-wrap items-center gap-3 rounded-2xl px-5 py-3"
        style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}
      >
        <div className="flex items-center gap-1.5" style={{ color: "var(--vm-muted)" }}>
          <CalendarDays className="h-3.5 w-3.5" />
          <span className="text-[12px] font-semibold">Período de análise</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-xl p-0.5" style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)" }}>
          {PERIODO_MODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodoModo(p.id)}
              className="rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition"
              style={{
                background: periodoModo === p.id ? "var(--vm-card)" : "transparent",
                color: periodoModo === p.id ? "var(--vm-text)" : "var(--vm-muted)",
                boxShadow: periodoModo === p.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodoModo === "personalizado" && (
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--vm-muted)" }}>
            <input
              type="date"
              value={periodoCustomInicio}
              max={periodoCustomFim || isoHoje()}
              onChange={(e) => setPeriodoCustomInicio(e.target.value)}
              className="rounded-lg px-2 py-1 text-[11px] outline-none"
              style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)", color: "var(--vm-text)" }}
            />
            <span>até</span>
            <input
              type="date"
              value={periodoCustomFim}
              min={periodoCustomInicio || undefined}
              max={isoHoje()}
              onChange={(e) => setPeriodoCustomFim(e.target.value)}
              className="rounded-lg px-2 py-1 text-[11px] outline-none"
              style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)", color: "var(--vm-text)" }}
            />
          </div>
        )}

        {/* Filtro global "Concessionária" (2026-09-24) — DIFERENTE do período
            acima: este afeta TUDO, inclusive os widgets "ao vivo" (Equipe ao
            Vivo, mapa) — pedido explícito pra não ficar nenhum número/pin
            fora do filtro selecionado. */}
        <div className="ml-auto flex items-center gap-1.5" style={{ color: "var(--vm-muted)" }}>
          <Building2 className="h-3.5 w-3.5" />
          <span className="text-[12px] font-semibold">Concessionária</span>
        </div>
        <select
          value={concessionaria}
          onChange={(e) => setConcessionaria(e.target.value)}
          className="rounded-xl px-3 py-1.5 text-[11.5px] font-semibold outline-none"
          style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)", color: "var(--vm-text)" }}
        >
          <option value="">Tudo</option>
          {concessionariasDisponiveis.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* ════════════ LINHA 1a: Vistorias Finalizadas | Aprovações — lado a lado, mesmo tamanho ════════════ */}
      <div className="vm-rise grid grid-cols-1 gap-4 md:grid-cols-2" style={{ animationDelay: "0.08s" }}>

        {/* Widget 01 — Vistorias Finalizadas · 14 dias */}
        <Card className="relative">
          {/* fundo — graphwhite.png (claro) / graphblack.png (escuro) */}
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat dark:hidden"
            style={{ backgroundImage: `url('${asset("/graphwhite.png")}')` }}
          />
          <div
            className="pointer-events-none absolute inset-0 hidden bg-cover bg-center bg-no-repeat dark:block"
            style={{ backgroundImage: `url('${asset("/graphblack.png")}')` }}
          />
          <div className="pointer-events-none absolute inset-0 bg-white/55 dark:bg-black/55" />

          <div className="relative z-10 flex flex-col">
          <div className="flex items-start justify-between px-5 pt-5">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#059669]" strokeWidth={2} />
                <span className="text-[13px] font-semibold text-[var(--vm-text)]">Vistorias Finalizadas · {periodoLabel}</span>
              </div>
              <div className="mt-3 flex items-end gap-3">
                <span
                  className="tabular-nums leading-none"
                  style={{ fontSize: "3.5rem", fontWeight: 800, color: "#16a34a", letterSpacing: "-0.02em" }}
                >
                  {velocity.total > 0 ? <CountUp value={velocity.total} duration={1200} /> : "—"}
                </span>
                {velocity.total > 0 && (
                  velocity.totalPrev === 0 ? (
                    <span
                      className="mb-2 inline-flex items-center gap-0.5"
                      style={{ background: "var(--vm-lime-100)", color: "#16a34a", borderRadius: 999, padding: "2px 10px", fontSize: "0.8rem", fontWeight: 700 }}
                    >
                      <ArrowUp className="h-3 w-3" strokeWidth={2.6} />
                      novo
                    </span>
                  ) : (
                    <span
                      className="mb-2 inline-flex items-center gap-0.5"
                      style={{
                        background: velocity.delta >= 0 ? "var(--vm-lime-100)" : "var(--vm-red-100)",
                        color:      velocity.delta >= 0 ? "#16a34a" : "#DC2626",
                        borderRadius: 999,
                        padding: "2px 10px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                      }}
                    >
                      <ArrowUp className={`h-3 w-3 ${velocity.delta >= 0 ? "" : "rotate-180"}`} strokeWidth={2.6} />
                      {velocity.delta >= 0 ? "+" : ""}{velocity.delta.toFixed(0)}%
                    </span>
                  )
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2" style={{ fontSize: "0.8rem", color: "var(--vm-faint)" }}>
                <span>vistorias na fila</span>
                <span className="text-[#D1D5DB]">·</span>
                <span>vs. período anterior</span>
              </div>
            </div>
            <Link href="/painel/historico" className="flex items-center gap-1 text-[11px] font-semibold text-[#059669] hover:underline">
              Ver histórico <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="relative mt-4 px-4 pb-4">
            {/* Subtle geographic grid texture behind chart */}
            <div
              className="pointer-events-none absolute inset-0 rounded-xl"
              style={{
                backgroundImage: [
                  "linear-gradient(rgba(5,150,105,0.04) 1px,transparent 1px)",
                  "linear-gradient(90deg,rgba(5,150,105,0.04) 1px,transparent 1px)",
                  "linear-gradient(rgba(5,150,105,0.02) 1px,transparent 1px)",
                  "linear-gradient(90deg,rgba(5,150,105,0.02) 1px,transparent 1px)",
                ].join(","),
                backgroundSize: "40px 40px, 40px 40px, 8px 8px, 8px 8px",
                opacity: 0.9,
              }}
            />
            <div className="relative">
              {velocity.values.length > 0 ? (
                <VelocityChart
                  values={velocity.values}
                  labels={velocity.labels}
                  avg={velocity.avg}
                  peak={velocity.peak}
                />
              ) : (
                <Skeleton h={160} />
              )}
            </div>
          </div>
          </div>
        </Card>

        <Card className="relative">
          {/* fundo — mesmo par claro/escuro do clone original */}
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat dark:hidden"
            style={{ backgroundImage: `url('${asset("/graphwhite.png")}')` }}
          />
          <div
            className="pointer-events-none absolute inset-0 hidden bg-cover bg-center bg-no-repeat dark:block"
            style={{ backgroundImage: `url('${asset("/graphblack.png")}')` }}
          />
          <div className="pointer-events-none absolute inset-0 bg-white/55 dark:bg-black/55" />

          <div className="relative z-10 flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#16a34a]" strokeWidth={2} />
                <span className="text-[13px] font-semibold text-[var(--vm-text)]">Aprovações · {periodoLabel}</span>
              </div>
              <div className="mt-3 flex items-end gap-3">
                <span
                  className="tabular-nums leading-none"
                  style={{ fontSize: "3.5rem", fontWeight: 800, color: "#16a34a", letterSpacing: "-0.02em" }}
                >
                  {aprovacoesVelocity.total > 0 ? <CountUp value={aprovacoesVelocity.total} duration={1200} /> : "—"}
                </span>
                {aprovacoesVelocity.total > 0 && (
                  aprovacoesVelocity.totalPrev === 0 ? (
                    <span
                      className="mb-2 inline-flex items-center gap-0.5"
                      style={{ background: "var(--vm-lime-100)", color: "#16a34a", borderRadius: 999, padding: "2px 10px", fontSize: "0.8rem", fontWeight: 700 }}
                    >
                      <ArrowUp className="h-3 w-3" strokeWidth={2.6} />
                      novo
                    </span>
                  ) : (
                    <span
                      className="mb-2 inline-flex items-center gap-0.5"
                      style={{
                        background: aprovacoesVelocity.delta >= 0 ? "var(--vm-lime-100)" : "var(--vm-red-100)",
                        color:      aprovacoesVelocity.delta >= 0 ? "#16a34a" : "#DC2626",
                        borderRadius: 999,
                        padding: "2px 10px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                      }}
                    >
                      <ArrowUp className={`h-3 w-3 ${aprovacoesVelocity.delta >= 0 ? "" : "rotate-180"}`} strokeWidth={2.6} />
                      {aprovacoesVelocity.delta >= 0 ? "+" : ""}{aprovacoesVelocity.delta.toFixed(0)}%
                    </span>
                  )
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2" style={{ fontSize: "0.8rem", color: "var(--vm-faint)" }}>
                <span>aprovações da concessionária</span>
                <span className="text-[#D1D5DB]">·</span>
                <span>vs. período anterior</span>
              </div>
            </div>

            {/* legenda das 2 séries — identidade nunca só por cor */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: "#16a34a" }} />
                <span className="text-[11px]" style={{ color: "var(--vm-muted)" }}>Aprovado</span>
                <span className="text-[12px] font-bold tabular-nums" style={{ color: "var(--vm-text)" }}>
                  {aprovacoesVelocity.totalSemPendencia}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: "#F59E0B" }} />
                <span className="text-[11px]" style={{ color: "var(--vm-muted)" }}>Com pendência</span>
                <span className="text-[12px] font-bold tabular-nums" style={{ color: "var(--vm-text)" }}>
                  {aprovacoesVelocity.totalComPendencia}
                </span>
              </div>
              <Link href="/painel/central-vistorias?status=APROVADO,APROVADO_PENDENCIA" className="flex items-center gap-1 text-[11px] font-semibold text-[#059669] hover:underline">
                Ver tudo <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <div className="relative mt-4 px-4 pb-4">
            {/* Subtle geographic grid texture behind chart — mesma textura do clone original */}
            <div
              className="pointer-events-none absolute inset-0 rounded-xl"
              style={{
                backgroundImage: [
                  "linear-gradient(rgba(5,150,105,0.04) 1px,transparent 1px)",
                  "linear-gradient(90deg,rgba(5,150,105,0.04) 1px,transparent 1px)",
                  "linear-gradient(rgba(5,150,105,0.02) 1px,transparent 1px)",
                  "linear-gradient(90deg,rgba(5,150,105,0.02) 1px,transparent 1px)",
                ].join(","),
                backgroundSize: "40px 40px, 40px 40px, 8px 8px, 8px 8px",
                opacity: 0.9,
              }}
            />
            <div className="relative">
              {aprovacoesVelocity.labels.length > 0 ? (
                <AprovacoesChart
                  labels={aprovacoesVelocity.labels}
                  serieA={aprovacoesVelocity.semPendencia}
                  corA="#16a34a"
                  serieB={aprovacoesVelocity.comPendencia}
                  corB="#F59E0B"
                />
              ) : (
                <Skeleton h={160} />
              )}
            </div>
          </div>
          </div>
        </Card>
      </div>

      {/* ════════════ Equipe ao vivo — super-dashboard consolidado (2026-09-25) ════════════
          Substitui Padrão Diário + Equipe ao Vivo + Análise Operacional dos
          Técnicos (seletor individual, aposentado): tudo numa página só,
          sem duplicar KPI/ranking/motivo em vários lugares. Ver plano em
          C:\Users\nsn102098\.claude\plans\moonlit-dancing-wigderson.md. */}
      <div className="vm-rise" style={{ animationDelay: "0.1s" }}>
        <EquipeAoVivo
          periodoLabel={periodoLabel}
          periodoRange={periodoRange}
          historico={historico}
          topTecsDash={topTecsDash}
          equipePeriodo={equipePeriodo}
          vistoriasMapa={vistoriasMapa}
          tecnicosMapa={tecnicosMapa}
          tecnicosPorReprovacao={tecnicosPorReprovacao}
          kpiEmVistoria={stats?.emVistoria ?? 0}
          kpiEmDeslocamento={stats?.emDeslocamento ?? 0}
          municipio={municipio}
          onMunicipioChange={setMunicipio}
          onRefresh={() => setRefreshTick((t) => t + 1)}
        />
      </div>

      {/* ════════════ Atividade ao vivo ════════════ */}
      <div className="vm-rise" style={{ animationDelay: "0.16s" }}>
        <Card>
          <div className="flex items-center justify-between border-b border-[var(--vm-tile-2)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-[#3B82F6]" strokeWidth={2} />
              <span className="text-[12.5px] font-semibold text-[var(--vm-text)]">Atividade ao vivo</span>
              <span
                className="flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-blue-600"
              >
                <span className="h-1 w-1 rounded-full bg-blue-500" style={{ animation: "vmBlink 1.4s ease-in-out infinite" }} />
                live
              </span>
            </div>
            <Link href="/painel/auditoria" className="flex items-center gap-1 text-[10.5px] font-semibold text-[#3B82F6] hover:underline">
              Auditoria <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="px-4 py-3">
            {audit.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-[#D1D5DB]">Sem eventos recentes.</p>
            ) : (
              <div className="relative flex flex-col">
                {/* vertical connector line */}
                <div className="absolute left-[10px] top-3 bottom-3 w-px bg-gradient-to-b from-[var(--vm-border)] via-[var(--vm-border)] to-transparent" />
                {audit.slice(0, 6).map((e, i) => {
                  const color = auditColor(e.acao);
                  const Icon  = auditIcon(e.acao);
                  return (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i, duration: 0.3 }}
                      className="relative flex items-start gap-3 py-2"
                    >
                      <span
                        className="relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                        style={{ background: `${color}18`, border: `1.5px solid ${color}44` }}
                      >
                        {i === 0 && (
                          <span
                            className="absolute inset-0 rounded-full"
                            style={{ border: `1.5px solid ${color}`, animation: "vmRing 2.2s ease-out infinite" }}
                          />
                        )}
                        <Icon className="h-2.5 w-2.5" style={{ color }} strokeWidth={2.5} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] leading-snug text-[var(--vm-text-soft)]">
                          <span className="font-semibold">{e.ator.nome.split(" ")[0]}</span>{" "}
                          <span className="text-[var(--vm-faint)]">{e.acao.replace(/[-_]/g, " ")}</span>
                          {e.alvo && <span className="ml-1 font-semibold" style={{ color }}>{e.alvo.label}</span>}
                        </p>
                        <p className="text-[9.5px] text-[var(--vm-faint)]">{relativo(e.timestamp)}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ════════════ LINHA 3: Distribuição do pipeline ════════════ */}
      <div className="vm-rise" style={{ animationDelay: "0.22s" }}>
        <PipelineWidget stats={stats} />
      </div>

      {/* ════════════ VISTORIAS ATRIBUÍDAS — hoje / mês corrente ════════════
          "Atribuída" != "concluída": mede o que SAIU do backlog (audit
          vistoria-atribuida, COUNT DISTINCT alvo_id — mesma conta de
          atribuidas24h logo acima, só em janelas de dia/mês em vez de 24h). */}
      <div
        className="vm-rise rounded-2xl p-4"
        style={{ animationDelay: "0.24s", background: "var(--vm-tile)", border: "1px solid var(--vm-border)" }}
      >
        <div className="mb-2 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-[#8B5CF6]" strokeWidth={2} />
          <span className="text-[13px] font-semibold text-[var(--vm-text)]">Vistorias Atribuídas</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { label: "Hoje", value: stats?.atribuidasHoje ?? null, sub: "desde 00:00", color: "#8B5CF6" },
              { label: "Este mês", value: stats?.atribuidasMes ?? null, sub: "mês corrente", color: "#8B5CF6" },
            ] as const
          ).map((k) => (
            <Card key={k.label} className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--vm-text-muted)]">{k.label}</p>
              <div className="mt-0.5 text-[26px] font-bold tabular-nums" style={{ color: k.color }}>
                {k.value != null ? <CountUp value={k.value} /> : "—"}
              </div>
              <p className="mt-1 text-[11.5px] text-[var(--vm-text-muted)]">{k.sub}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* ════════════ INSTALAÇÃO — seção própria, depois de toda a Vistoria ════════════
          Cards da Instalação numa seção clara e separada, no fim da tela de
          Operação (depois da Distribuição das Vistorias) — dado vem de
          src/services/painel-instalacoes.ts, isolado da Vistoria; só a
          apresentação fica na mesma página. Mesmas imagens de fundo do app de
          campo (card_*.png, fundo_tudo.png), pra bater com o visual que o
          instalador já vê no celular. */}
      <div
        className="vm-rise rounded-2xl p-4"
        style={{
          animationDelay: "0.26s",
          backgroundColor: "#F7F9FB",
          backgroundImage: `url(${asset("/fundo_tudo.png")})`,
          backgroundSize: "cover",
          backgroundPosition: "top center",
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-[#3B82F6]" strokeWidth={2} />
            <span className="text-[13px] font-semibold text-[var(--vm-text)]">Instalação</span>
          </div>
          <Link href="/painel/mapa" className="flex items-center gap-1 text-[12px] font-semibold text-[#3B82F6] hover:underline">
            <MapIcon className="h-3 w-3" /> Mapa em tempo real
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              { label: "Liberados", value: instalacaoStats?.liberados ?? null, sub: "aguardando instalador assumir", color: "#F59E0B", icon: Wrench, href: "/painel/mapa", bg: "card_disponivel.png" },
              { label: "Em Instalação", value: instalacaoStats?.emInstalacao ?? null, sub: `${instalacaoStats?.instaladores24h ?? 0} instalador${(instalacaoStats?.instaladores24h ?? 0) === 1 ? "" : "es"} em campo`, color: "#3B82F6", icon: Activity, href: "/painel/mapa", bg: "card_andamento.png" },
              { label: "Instaladas (30d)", value: instalacaoStats?.instaladas30d ?? null, sub: "últimos 30 dias", color: "#10B981", icon: CheckCircle2, href: null, bg: "card_instalado.png" },
              { label: "Rejeitadas", value: instalacaoStats?.rejeitadasPendentes ?? null, sub: "aguardando decisão", color: "#DC2626", icon: Ban, href: "/painel/instalacoes/rejeitadas", bg: "card_rejeitado.png" },
            ] as const
          ).map((k) => {
            const Icon = k.icon;
            const content = (
              <Card
                className="p-4 transition hover:-translate-y-0.5"
                style={{
                  backgroundImage: `url(${asset(`/${k.bg}`)})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${k.color}1F`, color: k.color }}>
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--vm-text-muted)]">{k.label}</p>
                <div className="mt-0.5 text-[26px] font-bold tabular-nums text-[var(--vm-text)]">
                  {k.value != null ? <CountUp value={k.value} /> : "—"}
                </div>
                <p className="mt-1 text-[11.5px] text-[var(--vm-text-muted)]">{k.sub}</p>
              </Card>
            );
            return k.href ? <Link key={k.label} href={k.href}>{content}</Link> : <div key={k.label}>{content}</div>;
          })}
        </div>
      </div>

      {/* ════════════ RODAPÉ — barra de status NOC ════════════ */}
      <div
        className="vm-rise flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-5 py-3 text-[11px] text-[var(--vm-muted)]"
        style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)", animationDelay: "0.24s" }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-emerald-500" style={{ animation: "vmRing 2s ease-out infinite" }} />
            <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-medium text-[var(--vm-text-soft)]">Sistema em operação</span>
          <span className="text-[#D1D5DB]">·</span>
          <span className="flex items-center gap-1.5">
            próx. sync
            <span className="relative h-[3px] w-14 overflow-hidden rounded-full bg-emerald-100">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                style={{ animation: "vmTick 20s linear infinite" }}
              />
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          <span>Técnicos em campo: <span className="font-semibold text-[var(--vm-text-soft)]">{emCampo}</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" />
          <span>Em vistoria: <span className="font-semibold text-[var(--vm-text-soft)]">{stats?.emVistoria ?? 0}</span></span>
        </div>
        {alertaRevisitas.length > 0 && (
          <div className="flex items-center gap-1.5 text-orange-500">
            <ShieldAlert className="h-3.5 w-3.5" style={{ animation: "vmBlink 1.6s ease-in-out infinite" }} />
            <span>Alertas: <span className="font-semibold">{alertaRevisitas.length}</span></span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 font-mono tabular-nums text-[var(--vm-faint)]">
          <Clock className="h-3.5 w-3.5" />
          <span>
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            {" · "}
            {now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
          </span>
        </div>
      </div>

    </div>
  );
}
