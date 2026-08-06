"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUp,
  Ban,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Layers,
  Map as MapIcon,
  RotateCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Undo2,
  UserPlus,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { painelService } from "@/services/painel";
import type { AuditEntry, PainelStats, RevisitaPendente, TecnicoAtivo } from "@/types";
import type { HistoricoAnalytics } from "@/services/painel";
import { getMapboxToken } from "@/services/maps";
import { api } from "@/services/api";
import type { PainelMapaResponse, PainelMapaTecnico } from "@/types/painel-mapa";
import { asset } from "@/utils/asset";
// Instalação — service/tipos isolados (src/lib/glpi/painel-instalacoes.ts),
// nunca a Vistoria importando dados dela: só consome o próprio endpoint
// novo. Poll independente (ver useEffect próprio abaixo), não entra no
// Promise.all da Vistoria — zero acoplamento com o fluxo de dados dela.
import { fetchInstalacoesStats } from "@/services/painel-instalacoes";
import type { PainelInstalacoesStats } from "@/types/painel-instalacoes";

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

const CITY_COORDS: Record<string, [number, number]> = {
  "São Paulo":             [-46.6333, -23.5505],
  "Campinas":              [-47.0608, -22.9056],
  "Sorocaba":              [-47.4578, -23.5015],
  "Santo André":           [-46.5386, -23.6644],
  "São Bernardo do Campo": [-46.5643, -23.6939],
  "Guarulhos":             [-46.5333, -23.4628],
  "Osasco":                [-46.7921, -23.5329],
  "Ribeirão Preto":        [-47.8119, -21.1775],
  "São José dos Campos":   [-45.8869, -23.1896],
  "Santos":                [-46.3333, -23.9618],
  "Mauá":                  [-46.4664, -23.6678],
  "Diadema":               [-46.6228, -23.6858],
  "Jundiaí":               [-46.8850, -23.1858],
  "Piracicaba":            [-47.6481, -22.7292],
  "Bauru":                 [-49.0631, -22.3147],
  "Marília":               [-49.9458, -22.2139],
  "São José do Rio Preto": [-49.3744, -20.8197],
  "Araçatuba":             [-50.4322, -21.2089],
  "Curitiba":              [-49.2731, -25.4297],
  "Londrina":              [-51.1731, -23.3045],
  "Maringá":               [-51.9331, -23.4273],
  "Ponta Grossa":          [-50.1625, -25.0945],
  "Cascavel":              [-53.4553, -24.9555],
};

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

function CountUp({ value, duration = 850 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) { setDisplay(to); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{fmtNum(display)}</>;
}

/* ── VelocityChart (self-contained — Widget 01) ────────────────────────────
   SVG próprio para não tocar no AreaChart compartilhado (usado no histórico).
   Linha verde 2px, área gradiente, linha de média tracejada laranja, ponto de
   pico destacado e eixo X com datas. */
function VelocityChart({
  values,
  labels,
  avg,
  peak,
}: {
  values: number[];
  labels: string[];
  avg: number;
  peak: number;
}) {
  if (!values.length) return null;
  const VB_W = 1000;
  const H = 160;
  const padX = 12;
  const padTop = 22;
  const padBottom = 24;
  const plotH = H - padTop - padBottom;
  const n = values.length;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  const x = (i: number) => padX + (n === 1 ? 0 : (i / (n - 1)) * (VB_W - padX * 2));
  const y = (v: number) => padTop + (1 - (v - min) / range) * plotH;

  const pts = values.map((v, i) => [x(i), y(v)] as const);
  const line = pts
    .map(([px, py], i) => {
      if (i === 0) return `M${px.toFixed(1)},${py.toFixed(1)}`;
      const [qx, qy] = pts[i - 1];
      const mx = (qx + px) / 2;
      return `Q${qx.toFixed(1)},${qy.toFixed(1)} ${mx.toFixed(1)},${((qy + py) / 2).toFixed(1)} T${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
  const fill = `${line} L${x(n - 1).toFixed(1)},${H - padBottom} L${x(0).toFixed(1)},${H - padBottom} Z`;

  const avgY = y(avg);
  const peakIdx = values.indexOf(peak);
  const peakX = peakIdx >= 0 ? x(peakIdx) : 0;
  const peakY = peakIdx >= 0 ? y(peak) : 0;

  // 5 marcações de eixo X distribuídas
  const tickIdx = Array.from({ length: Math.min(5, n) }, (_, k) =>
    Math.round((k / (Math.min(5, n) - 1 || 1)) * (n - 1))
  );

  const pctLeft = (px: number) => `${(px / VB_W) * 100}%`;

  return (
    <div className="relative" style={{ height: H }}>
      <svg viewBox={`0 0 ${VB_W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="vm-vel-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
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
        {/* linha de média (tracejada laranja) */}
        <line
          x1={padX}
          x2={VB_W - padX}
          y1={avgY}
          y2={avgY}
          stroke="#f59e0b"
          strokeWidth="1.6"
          strokeDasharray="6 5"
          vectorEffect="non-scaling-stroke"
        />
        <path d={fill} fill="url(#vm-vel-grad)" />
        <path
          d={line}
          fill="none"
          stroke="#16a34a"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* label MÉDIA */}
      <span
        className="pointer-events-none absolute right-1 rounded bg-amber-50 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-700"
        style={{ top: `${avgY - 8}px` }}
      >
        Média
      </span>

      {/* ponto de pico + data */}
      {peakIdx >= 0 && peak > 0 && (
        <>
          <span
            className="pointer-events-none absolute -translate-x-1/2 rounded-full"
            style={{
              left: pctLeft(peakX),
              top: `${peakY - 4}px`,
              width: 8,
              height: 8,
              background: "#16a34a",
              boxShadow: "0 0 0 3px rgba(22,163,74,0.18)",
            }}
          />
          <span
            className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-[#16a34a]"
            style={{ left: pctLeft(peakX), top: `${peakY - 22}px` }}
          >
            {labels[peakIdx]}
          </span>
        </>
      )}

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

/* ── MiniDonut (self-contained — Widget 03) ────────────────────────────────
   Donut completo com animação de desenho ao entrar na viewport. */
function MiniDonut({
  value,
  color,
  caption,
}: {
  value: number;
  color: string;
  caption: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const size = 84;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value));
  const dash = shown ? (clamped / 100) * c : 0;
  const cx = size / 2;

  return (
    <div ref={ref} className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(6,59,59,0.07)" strokeWidth={stroke} />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            transform={`rotate(-90 ${cx} ${cx})`}
            style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.22,.7,.2,1)" }}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center text-[1.6rem] font-bold tabular-nums"
          style={{ color: "var(--vm-text)" }}
        >
          {Math.round(clamped)}%
        </div>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-[var(--vm-faint)]">{caption}</p>
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
      { key: "revisitas",  label: "Revisitas",   value: revisitas,           color: "#A855F7", icon: RotateCw,      href: "/painel/revisitas" },
      { key: "devolucoes", label: "Devoluções",  value: s?.devolvidas ?? 0,  color: "#DC2626", icon: Undo2,         href: "/painel/devolucoes" },
      { key: "rejeicoes",  label: "Rejeições",   value: s?.rejeitadas ?? 0,  color: "#6B7280", icon: Ban,           href: "/painel/rejeitadas" },
    ];
    const total = base.reduce((a, b) => a + b.value, 0);
    return { total, items: base.map((b) => ({ ...b, pct: total > 0 ? (b.value / total) * 100 : 0 })) };
  }, [stats]);

  const loading = !stats;

  return (
    <Card>
      <div style={{ height: 3, background: "linear-gradient(90deg,#F59E0B,#3B82F6,#10B981,#A855F7,#DC2626,#6B7280)", flexShrink: 0 }} />
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
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-6">
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

/* ══════════════════════════════════════════════════════════════════════════
   WIDGET 02 — Padrão Diário: SP municipalities fill layer
   ══════════════════════════════════════════════════════════════════════════ */

interface HeatmapMapWidgetProps {
  topMunicipios: Array<{ municipio: string; total: number }>;
  totais: { vistoriasFinalizadas: number; pdfsGerados: number };
  mediaSemanal: number;
}

function HeatmapMapWidget({ topMunicipios, totais, mediaSemanal }: HeatmapMapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const popupRef     = useRef<mapboxgl.Popup | null>(null);
  const geoRef       = useRef<{ type: string; features: Array<{ type: string; geometry: unknown; properties: Record<string, unknown> }> } | null>(null);
  const munisRef     = useRef(topMunicipios);
  munisRef.current   = topMunicipios;
  const token        = getMapboxToken();
  const [geoLoaded,  setGeoLoaded] = useState(false);

  const enrich = (munis: Array<{ municipio: string; total: number }>) => {
    const geo = geoRef.current;
    if (!geo) return null;
    const lookup = new Map(munis.map(m => [normalizeStr(m.municipio), m.total]));
    return {
      ...geo,
      features: geo.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          total: lookup.get(normalizeStr(String(f.properties.name ?? ""))) ?? 0,
        },
      })),
    };
  };

  // Escala relativa ao máximo dos dados — garante que o município mais ativo
  // sempre apareça em verde escuro, mesmo com poucos registros no período.
  const fillExpr = (munis: Array<{ municipio: string; total: number }>) => {
    const top = Math.max(...munis.map(m => m.total), 2);
    const mid = Math.max(Math.round(top / 2), 1);
    const [lo, md, hi] = choroRamp();
    return [
      "case", [">", ["get", "total"], 0],
      ["interpolate", ["linear"], ["get", "total"],
        1, lo,
        mid, md,
        top, hi],
      choroEmpty(),
    ] as unknown as mapboxgl.Expression;
  };

  useEffect(() => {
    if (!containerRef.current || !token) return;
    injectStyle(
      "vm-dash-heat-css",
      ".vm-dash-heat .mapboxgl-ctrl-logo,.vm-dash-heat .mapboxgl-ctrl-attrib{display:none!important}" +
      ".mapboxgl-popup-content{padding:0;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,0.12)}",
    );
    let alive = true;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/empty-v9",
      center: [-48.5, -22.0] as [number, number],
      zoom: 5.7,
      interactive: true,
      scrollZoom: false,
      doubleClickZoom: false,
      dragPan: false,
      dragRotate: false,
      boxZoom: false,
      touchZoomRotate: false,
      keyboard: false,
      attributionControl: false,
    });
    mapRef.current = map;

    const ro = new ResizeObserver(() => { if (alive) map.resize(); });
    ro.observe(containerRef.current);

    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    popupRef.current = popup;

    map.on("load", async () => {
      map.resize();
      map.addLayer({ id: "vm-sp-bg", type: "background", paint: { "background-color": dashMapBg() } });
      try {
        const res = await fetch(SP_GEOJSON_URL);
        const geoJSON = await res.json();
        if (!alive) return;
        geoRef.current = geoJSON;

        const enriched = enrich(munisRef.current);

        map.addSource("vm-sp-src", {
          type: "geojson",
          data: enriched as never,
          promoteId: "id",
        });

        map.addLayer({
          id: "vm-sp-fill",
          type: "fill",
          source: "vm-sp-src",
          paint: {
            "fill-color": fillExpr(munisRef.current),
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              1.0,
              0.92,
            ] as mapboxgl.Expression,
          },
        });

        map.addLayer({
          id: "vm-sp-outline",
          type: "line",
          source: "vm-sp-src",
          paint: { "line-color": dashDark() ? "rgba(255,255,255,0.10)" : "#ffffff", "line-width": 0.5 },
        });

        map.addLayer({
          id: "vm-sp-hover-outline",
          type: "line",
          source: "vm-sp-src",
          paint: {
            "line-color": "#1a6b3c",
            "line-width": 1.6,
            "line-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              1,
              0,
            ] as mapboxgl.Expression,
          },
        });

        const bounds = new mapboxgl.LngLatBounds();
        for (const f of geoJSON.features as Array<{ geometry: { type: string; coordinates: number[][][] | number[][][][] } }>) {
          const g = f.geometry;
          const rings = g.type === "Polygon"
            ? [g.coordinates[0] as number[][]]
            : (g.coordinates as number[][][][]).map(p => p[0]);
          for (const ring of rings) for (const c of ring) bounds.extend([c[0], c[1]]);
        }
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: { top: 8, bottom: 8, left: 8, right: 40 }, animate: false });
          const z = map.getZoom();
          map.setMinZoom(z);
          map.setMaxZoom(z);
        }

        let hoveredId: string | number | null = null;

        map.on("mousemove", "vm-sp-fill", (e) => {
          if (!e.features?.length) return;
          const f  = e.features[0];
          const id = f.id;
          map.getCanvas().style.cursor = "crosshair";
          if (hoveredId !== null && hoveredId !== id) {
            map.setFeatureState({ source: "vm-sp-src", id: hoveredId }, { hover: false });
          }
          hoveredId = id ?? null;
          if (hoveredId !== null) {
            map.setFeatureState({ source: "vm-sp-src", id: hoveredId }, { hover: true });
          }
          const name  = String(f.properties?.name ?? "");
          const total = Number(f.properties?.total ?? 0);
          const sum   = munisRef.current.reduce((s, m) => s + m.total, 0);
          const pctStr = sum > 0 ? ((total / sum) * 100).toFixed(1) : "0";
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-family:ui-sans-serif;padding:8px 12px;min-width:130px">
                <div style="font-size:12px;font-weight:700;color:var(--vm-text);margin-bottom:3px">${name || "—"}</div>
                <div style="font-size:11px;color:var(--vm-text-soft)">${total > 0 ? `${total} concluídas · ${pctStr}%` : "Sem vistorias concluídas"}</div>
              </div>`,
            )
            .addTo(map);
        });

        map.on("mouseleave", "vm-sp-fill", () => {
          map.getCanvas().style.cursor = "";
          if (hoveredId !== null) {
            map.setFeatureState({ source: "vm-sp-src", id: hoveredId }, { hover: false });
            hoveredId = null;
          }
          popup.remove();
        });

        setGeoLoaded(true);
      } catch {
        /* GeoJSON load failure is silent — widget degrades gracefully */
      }
    });

    return () => {
      alive = false;
      ro.disconnect();
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update data + fill scale on poll refresh without recreating the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getLayer("vm-sp-fill")) return;
    const enriched = enrich(topMunicipios);
    if (!enriched) return;
    (map.getSource("vm-sp-src") as mapboxgl.GeoJSONSource | undefined)?.setData(enriched as never);
    map.setPaintProperty("vm-sp-fill", "fill-color", fillExpr(topMunicipios));
  }, [topMunicipios]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#059669]" strokeWidth={2} />
          <span className="text-[13px] font-semibold text-[var(--vm-text)]">Padrão Diário · 30 dias</span>
        </div>
        <div className="flex items-center gap-1 text-[9.5px] text-[var(--vm-faint)]">
          {(dashDark()
            ? [choroEmpty(), ...choroRamp()]
            : ["#e8f5ee", "#a8d5b5", "#5a9e74", "#1a6b3c"]
          ).map(c => (
            <span key={c} className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
          ))}
          <span className="ml-0.5">+ ativo</span>
        </div>
      </div>
      <div className="relative h-[190px] w-full shrink-0">
        <div ref={containerRef} className="vm-dash-heat h-full w-full" />
        {/* Legenda de cores vertical (48px) */}
        <div
          className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 flex-col items-center justify-center gap-1"
          style={{ width: 48 }}
        >
          <span className="text-center text-[0.65rem] leading-tight text-[var(--vm-faint)]">Mais<br />vistorias</span>
          <div
            className="w-2.5 rounded-full"
            style={{ height: 80, background: dashDark() ? "linear-gradient(to bottom,#22E0A6,#1E2733)" : "linear-gradient(to bottom,#1a6b3c,#e8f5ee)", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}
          />
          <span className="text-center text-[0.65rem] leading-tight text-[var(--vm-faint)]">Menos<br />vistorias</span>
        </div>
        {!geoLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--vm-tile)]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--vm-border)] border-t-[#059669]" />
          </div>
        )}
      </div>
      <div className="mt-auto grid grid-cols-3 border-t border-[var(--vm-tile-2)]">
        {[
          { icon: Activity, label: "Total no período", value: String(totais.vistoriasFinalizadas), color: "#059669" },
          { icon: Clock,    label: "Média semanal",    value: mediaSemanal.toFixed(1).replace(".", ","), color: "#0EA5E9" },
          { icon: FileText, label: "PDFs gerados",      value: String(totais.pdfsGerados), color: "#7C3AED" },
        ].map((m, i) => (
          <div
            key={m.label}
            className="flex flex-col gap-1.5 px-4 py-3.5"
            style={{ borderLeft: i > 0 ? "1px solid var(--vm-tile-2)" : undefined }}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: `${m.color}14`, color: m.color }}
            >
              <m.icon className="h-3.5 w-3.5" strokeWidth={2.2} />
            </span>
            <div className="text-[20px] font-bold leading-none tabular-nums text-[var(--vm-text)]">{m.value}</div>
            <div className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-[var(--vm-faint)]">{m.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WIDGET 04 — Equipe ao Vivo
   ══════════════════════════════════════════════════════════════════════════ */

interface TeamMapWidgetProps {
  mapaTeam: PainelMapaTecnico[];
  tecnicosAtivos: TecnicoAtivo[];
  taxaAprov: number;
  taxaRevisita: number;
}

function TeamMapWidget({ mapaTeam, tecnicosAtivos, taxaAprov, taxaRevisita }: TeamMapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const markersRef   = useRef<mapboxgl.Marker[]>([]);
  const popupRef     = useRef<mapboxgl.Popup | null>(null);
  const token        = getMapboxToken();

  useEffect(() => {
    if (!containerRef.current || !token) return;
    injectStyle(
      "vm-dash-team-css",
      ".vm-dash-team .mapboxgl-ctrl-logo,.vm-dash-team .mapboxgl-ctrl-attrib{display:none!important}" +
      ".mapboxgl-popup-content{padding:0;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,0.12)}",
    );
    injectStyle(
      "vm-pulse-kf",
      "@keyframes vm-pulse{0%,100%{transform:scale(1);opacity:0.25}50%{transform:scale(1.7);opacity:0.08}}",
    );
    injectStyle(
      "vm-radar-kf",
      "@keyframes vm-radar{0%{box-shadow:0 0 0 0 rgba(22,163,74,0.4)}70%{box-shadow:0 0 0 12px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}",
    );
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: dashMapStyle("mapbox://styles/mapbox/light-v11"),
      center: [-47.0626, -22.9064],
      zoom: 9,
      interactive: false,
      dragPan: false,
      scrollZoom: false,
      doubleClickZoom: false,
      touchZoomRotate: false,
      attributionControl: false,
    });
    mapRef.current = map;
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    popupRef.current = popup;
    return () => {
      markersRef.current.forEach(mk => mk.remove());
      markersRef.current = [];
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const CAMPINAS: [number, number] = [-47.0626, -22.9064];
    const makeDot = () => {
      const el = document.createElement("div");
      el.style.cssText =
        "width:14px;height:14px;border-radius:50%;background:#16a34a;box-shadow:0 0 0 4px rgba(22,163,74,0.3);animation:vm-radar 2s infinite;cursor:default";
      return el;
    };
    const place = () => {
      markersRef.current.forEach(mk => mk.remove());
      markersRef.current = [];
      const coords = mapaTeam
        .filter(t => t.latitude != null && t.longitude != null && t.status_operacional !== "offline")
        .map(t => [t.longitude!, t.latitude!] as [number, number]);
      const pts = coords.length ? coords : [CAMPINAS];
      pts.forEach(c => {
        const mk = new mapboxgl.Marker({ element: makeDot(), anchor: "center" })
          .setLngLat(c)
          .addTo(map);
        markersRef.current.push(mk);
      });
    };
    if (map.isStyleLoaded()) place(); else map.once("load", place);
  }, [mapaTeam]);

  const destaque = tecnicosAtivos.find(t => t.status === "em-campo") ?? tecnicosAtivos[0];
  const emCampoCount = tecnicosAtivos.filter(t => t.status === "em-campo").length;

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#059669]" strokeWidth={2.2} />
          <span className="text-[13px] font-semibold text-[var(--vm-text)]">Equipe · ao vivo</span>
        </div>
        <div className="flex items-center gap-2">
          {emCampoCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-[3px] text-[9px] font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {emCampoCount} em campo
            </span>
          )}
          <Link href="/painel/mapa" className="flex items-center gap-1 text-[11px] font-semibold text-[#059669] hover:underline">
            Mapa <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div ref={containerRef} className="vm-dash-team h-[190px] w-full shrink-0" />
      {destaque && (
        <div className="flex items-center gap-3 border-t border-[var(--vm-tile-2)] px-4 py-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg,#10B981,#059669)" }}
          >
            {initials(destaque.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-[var(--vm-text)]">{destaque.nome.split(" ")[0]}</p>
            <p className="truncate text-[10px] text-[var(--vm-faint)]">{destaque.municipio ?? "—"} · {destaque.concluidasHoje} hoje</p>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-wide"
            style={{ background: `${STATUS_DOT[destaque.status]}18`, color: STATUS_DOT[destaque.status] }}
          >
            {STATUS_LABEL[destaque.status]}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 px-4 pb-4 pt-2">
        {[
          { title: "Aprovação", value: taxaAprov,    color: "#16a34a", caption: "aprovadas no período" },
          { title: "Revisitas", value: taxaRevisita, color: "#f59e0b", caption: "pendentes (30d)" },
        ].map(g => (
          <div key={g.title} className="flex flex-col items-center rounded-xl bg-[var(--vm-tile)] p-3">
            <p className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-[var(--vm-faint)]">{g.title}</p>
            <MiniDonut value={g.value} color={g.color} caption={g.caption} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WIDGET 03 — Top Municípios: map IS the chart + hover tooltip
   ══════════════════════════════════════════════════════════════════════════ */

interface MunicipiosMapWidgetProps {
  topMunicipios: Array<{ municipio: string; total: number; concluidas: number }>;
  tecnicos: TecnicoAtivo[];
}

function MunicipiosMapWidget({ topMunicipios, tecnicos: _t }: MunicipiosMapWidgetProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<mapboxgl.Map | null>(null);
  const markersRef    = useRef<mapboxgl.Marker[]>([]);
  const fillExprRef   = useRef<mapboxgl.Expression | null>(null);
  const geoRef        = useRef<{ type: string; features: Array<{ type: string; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }> } | null>(null);
  const [geoLoaded,   setGeoLoaded] = useState(false);
  const token         = getMapboxToken();
  void _t;

  const totalGlobal = topMunicipios.reduce((s, m) => s + m.total, 0);

  /* Effect 1 — mapa base + carrega GeoJSON */
  useEffect(() => {
    if (!containerRef.current || !token) return;
    let alive = true;
    injectStyle(
      "vm-dash-muni-css",
      ".vm-dash-muni .mapboxgl-ctrl-logo,.vm-dash-muni .mapboxgl-ctrl-attrib{display:none!important}",
    );
    injectStyle("vm-noc-css", NOC_CSS);
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/empty-v9",
      center: [-48.5, -22.0] as [number, number],
      zoom: 5.6,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;

    const ro = new ResizeObserver(() => { if (alive) map.resize(); });
    ro.observe(containerRef.current);

    map.on("load", async () => {
      map.resize();
      map.addLayer({ id: "vm-muni-bg", type: "background", paint: { "background-color": dashMapBg() } });
      try {
        const res = await fetch(SP_GEOJSON_URL);
        const geoJSON = await res.json() as {
          type: string;
          features: Array<{ type: string; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }>;
        };
        if (!alive) return;

        geoRef.current = geoJSON;

        map.addSource("vm-muni-sp", { type: "geojson", data: geoJSON as never });
        map.addLayer({
          id: "vm-muni-fill", type: "fill", source: "vm-muni-sp",
          paint: { "fill-color": choroEmpty(), "fill-opacity": 1 },
        });
        map.addLayer({
          id: "vm-muni-line", type: "line", source: "vm-muni-sp",
          paint: { "line-color": dashDark() ? "rgba(255,255,255,0.10)" : "#ffffff", "line-width": 0.5 },
        });

        const bounds = new mapboxgl.LngLatBounds();
        for (const f of geoJSON.features) {
          const g = f.geometry as { type: string; coordinates: number[][][] | number[][][][] };
          const rings = g.type === "Polygon"
            ? [g.coordinates[0] as number[][]]
            : (g.coordinates as number[][][][]).map(p => p[0]);
          for (const ring of rings) for (const c of ring) bounds.extend([c[0], c[1]]);
        }
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 14, animate: false });
          const z = map.getZoom();
          map.setMinZoom(z);
          map.setMaxZoom(z);
        }

        setGeoLoaded(true);
      } catch {
        /* GeoJSON load failure is silent — widget degrades gracefully */
      }
    });

    return () => {
      alive = false;
      ro.disconnect();
      markersRef.current.forEach(mk => mk.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Effect 2 — coloriza fill + cria pins quando dados chegam */
  useEffect(() => {
    const map = mapRef.current;
    const geo = geoRef.current;
    if (!map || !map.isStyleLoaded() || !geo || !topMunicipios.length) return;

    const lookup = new Map(topMunicipios.map(m => [normalizeStr(m.municipio), m.total]));
    const enriched = {
      ...geo,
      features: geo.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          total: lookup.get(normalizeStr(String(f.properties.name ?? ""))) ?? 0,
          name_norm: normalizeStr(String(f.properties.name ?? "")),
        },
      })),
    };

    (map.getSource("vm-muni-sp") as mapboxgl.GeoJSONSource | undefined)?.setData(enriched as never);
    const topVal = Math.max(...topMunicipios.map(m => m.total), 2);
    const midVal = Math.max(Math.round(topVal / 2), 1);
    const [rlo, rmd, rhi] = choroRamp();
    const fillExpr: mapboxgl.Expression = [
      "case", [">", ["get", "total"], 0],
      ["interpolate", ["linear"], ["get", "total"], 1, rlo, midVal, rmd, topVal, rhi],
      choroEmpty(),
    ];
    fillExprRef.current = fillExpr;
    map.setPaintProperty("vm-muni-fill", "fill-color", fillExpr);

    markersRef.current.forEach(mk => mk.remove());
    markersRef.current = [];

    for (const feature of enriched.features) {
      const total = Number(feature.properties.total ?? 0);
      if (total === 0) continue;

      const name = String((feature.properties as Record<string, unknown>).name ?? "");
      const item = topMunicipios.find(m => normalizeStr(m.municipio) === normalizeStr(name));
      if (!item) continue;

      const coords = featureCentroid(feature.geometry);
      if (!coords) continue;

      const el = document.createElement("div");
      el.style.cssText = "width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#4A6CF7,#7C3AED);box-shadow:0 2px 10px rgba(74,108,247,0.55);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;font-family:ui-sans-serif;border:2px solid rgba(255,255,255,0.75);cursor:default";
      el.textContent = String(item.total);

      const mk = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(coords)
        .addTo(map);
      markersRef.current.push(mk);
    }
  }, [topMunicipios, geoLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="h-full">
      {/* Accent strip */}
      <div style={{ height: 3, background: "linear-gradient(90deg,#4A6CF7,#7C3AED,#4A9EFF)", flexShrink: 0 }} />
      <div className="flex items-center justify-between px-5 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "linear-gradient(135deg,rgba(74,108,247,0.15),rgba(124,58,237,0.12))", border: "1px solid rgba(74,108,247,0.18)" }}
          >
            <Building2 className="h-3.5 w-3.5 text-[#4A6CF7]" strokeWidth={2} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-semibold text-[var(--vm-text)]">Top Municípios</span>
            <span className="text-[9.5px] text-[var(--vm-faint)]">progresso por município{totalGlobal > 0 ? ` · ${totalGlobal} vistorias` : ""}</span>
          </div>
        </div>
        <span
          className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold text-[#4A6CF7]"
          style={{ background: "rgba(74,108,247,0.08)", border: "1px solid rgba(74,108,247,0.14)" }}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4A6CF7]" />
          hover
        </span>
      </div>
      <div ref={containerRef} className="vm-dash-muni h-[200px] w-full shrink-0" />
      <ol className="flex flex-col px-3 pb-3 pt-2" style={{ gap: 2 }}>
        {topMunicipios.slice(0, 5).map((m, i) => {
          // % real de progresso do município (concluídas / total do município),
          // não a fatia dele dentre os top 10 — isso fazia o maior município
          // sempre bater 100%, mesmo sem estar nem perto de completo.
          const pct = m.total > 0 ? (m.concluidas / m.total) * 100 : 0;
          const rankBg =
            i === 0 ? "linear-gradient(135deg,#F59E0B,#D97706)"
            : i === 1 ? "linear-gradient(135deg,#94A3B8,#64748B)"
            : i === 2 ? "linear-gradient(135deg,#CD7F32,#A0522D)"
            : "rgba(74,108,247,0.10)";
          const rankColor = i < 3 ? "#fff" : "#4A6CF7";
          return (
            <motion.li
              key={m.municipio}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.06 * i, duration: 0.35 }}
              className="flex items-center gap-2 rounded-xl px-2 py-2 transition-all hover:bg-[var(--vm-tile-blue)]"
              style={{ borderLeft: "2px solid transparent" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderLeftColor = "#4A6CF7";
                const mp = mapRef.current;
                if (mp?.isStyleLoaded() && fillExprRef.current) {
                  const orig = fillExprRef.current as unknown[];
                  mp.setPaintProperty("vm-muni-fill", "fill-color", [
                    "case", ["==", ["get", "name_norm"], normalizeStr(m.municipio)], "#2563eb",
                    ...orig.slice(1),
                  ] as mapboxgl.Expression);
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderLeftColor = "transparent";
                const mp = mapRef.current;
                if (mp?.isStyleLoaded() && fillExprRef.current) {
                  mp.setPaintProperty("vm-muni-fill", "fill-color", fillExprRef.current);
                }
              }}
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[9px] font-bold"
                style={{ background: rankBg, color: rankColor, boxShadow: i < 3 ? "0 2px 6px rgba(0,0,0,0.14)" : "none" }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className="truncate text-[10.5px] font-semibold text-[var(--vm-text-soft)]">{m.municipio}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[9.5px] text-[var(--vm-faint)]">{pct.toFixed(0)}%</span>
                    <span className="tabular-nums text-[11px] font-bold text-[var(--vm-text)]">{m.concluidas}/{m.total}</span>
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--vm-tile-2)]">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: i === 0 ? "linear-gradient(90deg,#4A6CF7,#7C3AED)" : "linear-gradient(90deg,#5E84F7,#93B3FF)" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: 0.06 * i + 0.1, ease: [0.22, 0.7, 0.2, 1] }}
                  />
                </div>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WIDGET 07 — Revisitas: SP map background + highlight problem areas
   ══════════════════════════════════════════════════════════════════════════ */

function RevisitasMapWidget({ revisitas }: { revisitas: RevisitaPendente[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const markersRef   = useRef<mapboxgl.Marker[]>([]);
  const token        = getMapboxToken();
  const hasRevisitas = revisitas.length > 0;

  useEffect(() => {
    if (!containerRef.current || !token) return;
    injectStyle(
      "vm-dash-rev-css",
      ".vm-dash-rev .mapboxgl-ctrl-logo,.vm-dash-rev .mapboxgl-ctrl-attrib{display:none!important}",
    );
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: dashMapStyle("mapbox://styles/mapbox/light-v11"),
      center: [-48.5, -22.0] as [number, number],
      zoom: 5.6,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    return () => {
      markersRef.current.forEach(mk => mk.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const place = () => {
      markersRef.current.forEach(mk => mk.remove());
      markersRef.current = [];
      if (revisitas.length === 0) return;
      const groups = new Map<string, number>();
      revisitas.forEach(r => groups.set(r.municipio, (groups.get(r.municipio) ?? 0) + 1));
      groups.forEach((count, muni) => {
        const coords = CITY_COORDS[muni];
        if (!coords) return;
        const el = document.createElement("div");
        el.style.cssText = "position:relative;width:32px;height:32px";
        el.innerHTML = `
          <div style="position:absolute;inset:0;border-radius:50%;background:#F97316;opacity:0.2;animation:vm-pulse 2s ease-in-out infinite"></div>
          <div style="position:absolute;inset:6px;border-radius:50%;background:#F97316;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:#fff">${count}</div>`;
        const mk = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat(coords)
          .addTo(map);
        markersRef.current.push(mk);
      });
    };
    if (map.isStyleLoaded()) place(); else map.once("load", place);
  }, [revisitas]);

  return (
    <Card style={{ border: hasRevisitas ? "1px solid rgba(249,115,22,0.22)" : "1px solid var(--vm-border)" }}>
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${hasRevisitas ? "#FFEDD5" : "var(--vm-tile-2)"}` }}
      >
        <div className="flex items-center gap-2">
          <RotateCw className="h-3.5 w-3.5 text-orange-500" strokeWidth={2} />
          <span className="text-[12.5px] font-semibold text-[var(--vm-text)]">
            Revisitas
            {hasRevisitas && (
              <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 py-px text-[10px] font-bold text-orange-600">
                {revisitas.length}
              </span>
            )}
          </span>
        </div>
        <Link href="/painel/revisitas" className="flex items-center gap-1 text-[10.5px] font-semibold text-orange-500 hover:underline">
          Central <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Map always visible as background */}
      <div className="relative">
        <div ref={containerRef} className="vm-dash-rev h-[155px] w-full" />
        {/* Success overlay when no revisitas */}
        {!hasRevisitas && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 backdrop-blur-[3px]"
            style={{ background: "var(--vm-overlay)" }}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 shadow-sm">
              <Sparkles className="h-5 w-5 text-emerald-500" strokeWidth={1.5} />
            </div>
            <p className="text-[12px] font-semibold text-[var(--vm-text-soft)]">Operação em dia</p>
            <p className="text-[10.5px] text-[var(--vm-faint)]">Sem revisitas pendentes.</p>
          </div>
        )}
      </div>

      {hasRevisitas && (
        <ul className="divide-y divide-orange-50">
          {revisitas.slice(0, 3).map(r => (
            <li key={r.id} className="flex items-start gap-2.5 px-4 py-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-100">
                <ShieldAlert className="h-3 w-3 text-orange-500" strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-semibold text-[var(--vm-text-soft)]">{r.equipamento}</p>
                <p className="line-clamp-1 text-[10px] text-[var(--vm-faint)]">{r.municipio} · {relativo(r.reprovadoEm)}</p>
              </div>
            </li>
          ))}
        </ul>
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
    const load = async () => {
      const [s, t, r, a, h, mp] = await Promise.all([
        painelService.fetchStats(),
        painelService.fetchTecnicos(),
        painelService.fetchRevisitas(),
        painelService.fetchAudit({ limit: 8 }),
        painelService.fetchHistorico(30),
        api.get<PainelMapaResponse>("/painel/mapa").then(res => res.data).catch(() => null),
      ]);
      if (!alive) return;
      setStats(s); setTecnicos(t); setRevisitas(r); setAudit(a); setHistorico(h);
      if (mp) setMapaRealtime(mp);
      setNow(new Date());
    };
    load();
    const poll = window.setInterval(load, 20_000);
    const tick = window.setInterval(() => setNow(new Date()), 1_000);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, []);

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

  /* ── derived ── */
  const emCampo    = useMemo(() => tecnicos.filter(t => t.status === "em-campo").length, [tecnicos]);
  const expediente = useMemo(
    () => tecnicos.filter(t => t.status === "em-campo" || t.status === "base").length,
    [tecnicos],
  );
  const taxaAprov    = historico?.taxas.aprovacaoPct ?? 0;
  const taxaRevisita = historico?.taxas.revisitaPct  ?? 0;
  // Só entra no ranking quem já tem pelo menos 1 vistoria concluída —
  // município com puro backlog intocado não é "top" de nada ainda.
  const topMunis     = (historico?.topMunicipios ?? []).filter((m) => m.concluidas >= 1).slice(0, 8);
  const topTecs      = (historico?.rankingTecnicos ?? []).slice(0, 5);
  const mapaTeam     = mapaRealtime?.tecnicos ?? [];

  const velocity = useMemo(() => {
    if (!historico) return { values: [] as number[], labels: [] as string[], avg: 0, peak: 0, total: 0, totalPrev: 0, delta: 0 };
    const all    = historico.serieDiaria;
    const last   = all.slice(-14);
    const prev   = all.slice(-28, -14);
    const values = last.map(d => d.finalizadas);
    const labels = last.map(d => diaCurto(d.dia));
    const avg    = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const peak   = Math.max(...values, 0);
    const total  = values.reduce((a, b) => a + b, 0);
    const totalPrev = prev.reduce((a, b) => a + b.finalizadas, 0);
    const delta  = totalPrev > 0 ? ((total - totalPrev) / totalPrev) * 100 : 0;
    return { values, labels, avg, peak, total, totalPrev, delta };
  }, [historico]);

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
    { label: "Concluídas",  raw: stats ? stats.vistoriadas : undefined, value: stats ? fmtNum(stats.vistoriadas): "—",  sub: "aguardando aprovação",   color: "#10B981", icon: CheckCircle2, href: "/painel/historico" },
    { label: "Revisitas",   raw: stats ? (stats.aguardandoRevisita ?? 0) + (stats.emRevisita ?? 0) : undefined, value: stats ? fmtNum((stats.aguardandoRevisita ?? 0) + (stats.emRevisita ?? 0)) : "—", sub: `${stats?.aguardandoRevisita ?? 0} sem técnico`, color: "#F97316", icon: RotateCw, href: "/painel/revisitas" },
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

            {/* RIGHT — 4 KPI cards 2×2 */}
            <div style={{ width: 460, padding: 16, display: "flex", alignItems: "center", position: "relative", zIndex: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}>
                {([
                  { k: kpis[0], color: "#00ff88" },
                  { k: kpis[1], color: "#4A9EFF" },
                  { k: kpis[2], color: "#00ff88" },
                  { k: kpis[3], color: "#f59e0b" },
                ]).map(({ k, color }, i) => {
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
                  } else {
                    chip = { icon: <Clock style={{ width: 11, height: 11 }} strokeWidth={2.2} />, text: `${semTec} sem técnico`, active: semTec > 0 };
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
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 14,
                        padding: 16,
                        backdropFilter: "blur(8px)",
                        cursor: k.href ? "pointer" : "default",
                        overflow: "hidden",
                      }}
                    >
                      {/* faixa de cor lateral sutil */}
                      <div style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: 999, background: color, opacity: 0.9 }} />
                      {/* header: ícone tint + label */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, background: `${color}22`, border: `1px solid ${color}33` }}>
                          <Icon style={{ width: 13, height: 13, color }} strokeWidth={2} />
                        </span>
                        <span style={{ fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,255,255,0.55)" }}>{k.label.toUpperCase()}</span>
                      </div>
                      {/* número */}
                      <div style={{ fontSize: "2.9rem", fontWeight: 800, color: "#fff", lineHeight: 1, marginBottom: 12, letterSpacing: "-0.02em" }}>
                        {k.raw != null ? <CountUp value={k.raw} /> : "—"}
                      </div>
                      {/* chip de contexto */}
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
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

      {/* ════════════ INSTALAÇÃO — resumo unificado na mesma Operação ════════════
          Cards da Instalação juntos com os da Vistoria nesta mesma tela (não é
          uma tela separada) — dado vem de src/services/painel-instalacoes.ts,
          isolado da Vistoria; só a apresentação fica junta aqui. Mesmas imagens
          de fundo do app de campo (card_*.png, fundo_tudo.png), pra bater com o
          visual que o instalador já vê no celular. */}
      <div
        className="vm-rise rounded-2xl p-4"
        style={{
          animationDelay: "0.04s",
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

      {/* ════════════ LINHA 1: Velocity | Heatmap SP | Equipe ════════════ */}
      <div className="vm-rise grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" style={{ animationDelay: "0.08s" }}>

        {/* Widget 01 — Vistorias Finalizadas · 14 dias */}
        <Card>
          <div className="flex items-start justify-between px-5 pt-5">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#059669]" strokeWidth={2} />
                <span className="text-[13px] font-semibold text-[var(--vm-text)]">Vistorias Finalizadas · 14 dias</span>
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
        </Card>

        {/* Widget 02 — Padrão Diário: SP fill heatmap */}
        {historico ? (
          <HeatmapMapWidget
            // O fill do mapa é "atividade concluída", não "tem algo atribuído
            // lá" — senão município com só backlog intocado aparecia colorido
            // como se já tivesse sido vistoriado.
            topMunicipios={historico.topMunicipios.map((m) => ({ municipio: m.municipio, total: m.concluidas }))}
            totais={historico.totais}
            mediaSemanal={historico.medias.semanalVistorias}
          />
        ) : (
          <Card><div className="flex-1 p-5"><Skeleton h={280} /></div></Card>
        )}

        {/* Widget 04 — Equipe ao Vivo */}
        <TeamMapWidget
          mapaTeam={mapaTeam}
          tecnicosAtivos={tecnicos.filter(t => t.status === "em-campo" || t.status === "base")}
          taxaAprov={taxaAprov}
          taxaRevisita={taxaRevisita}
        />
      </div>

      {/* ════════════ LINHA 2: Municípios | Técnicos | Atividade | Revisitas ════════════ */}
      <div className="vm-rise grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" style={{ animationDelay: "0.16s" }}>

        {/* Widget 03 — Top Municípios: map IS the chart */}
        <MunicipiosMapWidget topMunicipios={topMunis} tecnicos={tecnicos} />

        {/* Widget 05 — Top Técnicos: performance cockpit */}
        <Card>
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#059669]" strokeWidth={2} />
              <span className="text-[13px] font-semibold text-[var(--vm-text)]">Top Técnicos · 30d</span>
            </div>
            <Link href="/painel/tecnicos" className="text-[10.5px] font-semibold text-[#059669] hover:underline">ver todos</Link>
          </div>
          <div className="flex flex-col gap-0 px-3 pb-3">
            {topTecs.length > 0 ? (
              topTecs.map((t, i) => {
                const maxTotal = topTecs[0]?.total ?? 1;
                const pct = (t.total / maxTotal) * 100;
                const aprovPct = t.total > 0 ? Math.round((t.aprovadas / t.total) * 100) : 0;
                const badgeColors = ["#F59E0B", "var(--vm-faint)", "#B45309", "var(--vm-muted)", "var(--vm-muted)"];
                const badgeBg    = ["var(--vm-amber-100)", "var(--vm-tile-2)", "var(--vm-amber-100)", "var(--vm-tile)", "var(--vm-tile)"];
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * i, duration: 0.35, ease: "easeOut" }}
                    className="rounded-xl px-2 py-2.5 transition hover:bg-[var(--vm-tile)]"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
                        style={{ background: badgeBg[i], color: badgeColors[i] }}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="truncate text-[12px] font-semibold text-[var(--vm-text)]">{t.nome.split(" ")[0]}</span>
                          <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-[var(--vm-text)]">{t.total}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--vm-tile-2)]">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: "linear-gradient(90deg,#059669,#34D399)" }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, delay: 0.06 * i + 0.1, ease: [0.22, 0.7, 0.2, 1] }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[34px]">
                      {/* Amostra pequena (< 3 vistorias) distorce %: 1/1 mostraria
                          "100% aprov." lado a lado com técnicos de 40+ vistorias,
                          como se fossem comparáveis. Mostra a contagem crua. */}
                      {t.total >= 3 ? (
                        <span className="rounded-full bg-emerald-50 px-1.5 py-[2px] text-[9px] font-semibold text-emerald-700">
                          {aprovPct}% aprov.
                        </span>
                      ) : (
                        <span
                          className="rounded-full px-1.5 py-[2px] text-[9px] font-semibold"
                          style={{ background: "var(--vm-tile-2)", color: "var(--vm-faint)" }}
                          title="Amostra pequena demais pra calcular percentual"
                        >
                          {t.aprovadas}/{t.total} aprov.
                        </span>
                      )}
                      {t.cidades > 0 && (
                        <span className="rounded-full bg-[var(--vm-tile-purple)] px-1.5 py-[2px] text-[9px] font-semibold text-[#7C3AED]">
                          {t.cidades} cidade{t.cidades !== 1 ? "s" : ""}
                        </span>
                      )}
                      {t.revisitas > 0 && (
                        <span className="rounded-full bg-amber-50 px-1.5 py-[2px] text-[9px] font-semibold text-amber-700">
                          {t.revisitas} rev.
                        </span>
                      )}
                      {t.slaExecucaoMedioMin != null && (
                        <span
                          className="rounded-full px-1.5 py-[2px] text-[9px] font-semibold"
                          style={{ background: "rgba(59,130,246,0.10)", color: "#2563EB" }}
                          title="SLA médio de execução (Iniciada → Finalizada)"
                        >
                          SLA {fmtMin(t.slaExecucaoMedioMin)}
                        </span>
                      )}
                      {t.tempoDeslocamentoMedioMin != null && (
                        <span
                          className="rounded-full px-1.5 py-[2px] text-[9px] font-semibold"
                          style={{ background: "rgba(14,165,233,0.10)", color: "#0891B2" }}
                          title="Tempo médio de deslocamento (Em Deslocamento → Iniciada)"
                        >
                          desloc {fmtMin(t.tempoDeslocamentoMedioMin)}
                        </span>
                      )}
                      {t.kmPercorrido != null && t.kmPercorrido > 0 && (
                        <span
                          className="rounded-full px-1.5 py-[2px] text-[9px] font-semibold"
                          style={{ background: "rgba(100,116,139,0.12)", color: "var(--vm-text-soft)" }}
                          title="Distância percorrida no período"
                        >
                          {t.kmPercorrido.toFixed(1).replace(".", ",")} km
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <Skeleton h={200} />
            )}
          </div>
        </Card>

        {/* Widget 06 — Atividade ao Vivo: operational timeline */}
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

        {/* Widget 07 — Revisitas: SP map + problem areas */}
        <RevisitasMapWidget revisitas={revisitas} />
      </div>

      {/* ════════════ LINHA 3: Distribuição do pipeline ════════════ */}
      <div className="vm-rise" style={{ animationDelay: "0.22s" }}>
        <PipelineWidget stats={stats} />
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
