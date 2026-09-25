"use client";

/**
 * EquipeAoVivo — super-dashboard consolidado (2026-09-25), pedido de campo
 * com foto de referência anexada. Substitui só 2 widgets antigos que
 * repetiam número/ranking/motivo em vários lugares: "Padrão Diário"
 * (HeatmapMapWidget) e "Equipe ao Vivo" (EquipeAoVivoWidget). NÃO mexe na
 * "Análise Operacional dos Técnicos" (seletor individual de técnico,
 * AnaliseOperacionalTecnicos.tsx) — esse componente continua separado e
 * intocado (ver [[feedback-nao-inferir-escopo-widget]] na memória: já
 * causou um revert de emergência confundir esse escopo uma vez).
 *
 * Layout (2026-09-25, 2ª correção): cada análise é o seu PRÓPRIO card com
 * altura fixa, lado a lado numa grade — não uma faixa horizontal única
 * dividida por cor de fundo. A primeira versão desenhava tudo dentro de UM
 * card gigante com grid-rows, o que achatava cada seção numa faixa larga e
 * baixa; pedido de campo foi explícito pra reverter pra cards individuais
 * bem proporcionados, do jeito que a foto de referência mostra.
 *
 * Nota de implementação: os primitivos visuais (Card/MiniKpiCard/MiniDonut/
 * RankedBarList/STATUS_DOT etc.) são cópias locais dos mesmos componentes
 * que já existem em page.tsx — page.tsx não pode ter exports extras (regra
 * do Next pra arquivos page.tsx) e os widgets que os usavam lá foram
 * removidos, então em vez de arriscar uma refatoração grande do arquivo
 * principal (que ainda tem outros widgets funcionando, ex.: Vistorias
 * Finalizadas/Aprovações) pra extrair um módulo compartilhado, preferi
 * duplicar esses ~150 linhas de primitivos aqui. Troca deliberada:
 * segurança (zero risco pros widgets que continuam) por um pouco de
 * duplicação.
 */

import mapboxgl from "mapbox-gl";
import { novoMapa } from "@/lib/mapaSeguro";
import "mapbox-gl/dist/mapbox-gl.css";
import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ANEL_SEM_TECNICO,
  FAMILIA_COR,
  FAMILIA_LABEL,
  FAMILIA_ORDEM,
  iconeDe,
  registrarSpritesSinal,
} from "./mapa/sinal";
import {
  ArrowRight,
  ArrowUp,
  Ban,
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  Maximize,
  Minimize,
  RefreshCw,
  Route,
  ShieldAlert,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { getMapboxToken } from "@/services/maps";
import type { AuditEntry, PainelStats, RevisitaPendente, TecnicoAtivo } from "@/types";
import type { HistoricoAnalytics, RankingTecnicoItem, TopTecnicosDashboard } from "@/services/painel";
import type { PainelMapaTecnico, PainelMapaVistoria } from "@/types/painel-mapa";

/* ── primitivos locais (ver nota no topo do arquivo) ─────────────────────── */

function injectStyle(id: string, css: string) {
  if (typeof document === "undefined" || document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

function fmtNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",") + "k";
  return String(n);
}

function initials(nome: string): string {
  const p = nome.trim().split(/[\s._-]+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

function dashDark(): boolean {
  return typeof window !== "undefined" && localStorage.getItem("vm_painel_theme") === "dark";
}
function dashMapStyle(lightStyle: string): string {
  return dashDark() ? "mapbox://styles/mapbox/dark-v11" : lightStyle;
}

const STATUS_DOT: Record<TecnicoAtivo["status"], string> = {
  "em-campo": "#10B981",
  base: "#6366F1",
  "off-shift": "#F59E0B",
  offline: "var(--vm-faint)",
};
const STATUS_LABEL: Record<TecnicoAtivo["status"], string> = {
  "em-campo": "Em campo",
  base: "Na base",
  "off-shift": "Off-shift",
  offline: "Offline",
};

/** Paleta fixa (não semântica) só pro donut "Principais motivos de reprovação" — cada motivo precisa de uma cor própria pra distinguir fatia, sem repetir o vermelho já usado no resto da tela pra "reprovado" no geral. */
const DONUT_MOTIVOS_CORES = ["#DC2626", "#F97316", "#EAB308", "#8B5CF6", "#0EA5E9", "#EC4899", "#64748B", "#94A3B8"];

function Card({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`vm-card flex flex-col overflow-hidden rounded-2xl bg-white ${className}`}
      style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", ...style }}
    >
      {children}
    </div>
  );
}

function MiniKpiCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
  caption,
  delta,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  color: string;
  bg: string;
  caption?: string;
  delta?: { value: number; up: boolean } | null;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: bg, color }}>
          <Icon className="h-4 w-4" strokeWidth={2.1} />
        </span>
        <span className="text-[11px] font-semibold text-[var(--vm-muted)]">{label}</span>
        {href && <ArrowRight className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" style={{ color }} />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-[24px] font-bold leading-none tabular-nums text-[var(--vm-text)]">{value}</p>
        {delta && (
          <span
            className="inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums"
            style={{ color: delta.up ? "#059669" : "#DC2626" }}
          >
            <ArrowUp className={`h-2.5 w-2.5 ${delta.up ? "" : "rotate-180"}`} strokeWidth={2.8} />
            {delta.up ? "+" : "-"}{delta.value.toFixed(1)}%
          </span>
        )}
      </div>
      {caption && <p className="mt-1.5 text-[10.5px] text-[var(--vm-faint)]">{caption}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="group block">
        <Card className="cursor-pointer p-4 transition hover:shadow-md">{body}</Card>
      </Link>
    );
  }
  return <Card className="p-4">{body}</Card>;
}

function MiniDonut({ value, color, caption }: { value: number; color: string; caption: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const size = 84, stroke = 9;
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
            cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`} transform={`rotate(-90 ${cx} ${cx})`}
            style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.22,.7,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[1.6rem] font-bold tabular-nums" style={{ color: "var(--vm-text)" }}>
          {Math.round(clamped)}%
        </div>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-[var(--vm-faint)]">{caption}</p>
    </div>
  );
}

function RankedBarList<T>({
  items, keyFn, labelFn, valueFn, pctFn, colorFn, emptyLabel,
}: {
  items: T[];
  keyFn: (item: T, i: number) => string;
  labelFn: (item: T) => string;
  valueFn: (item: T) => string;
  pctFn: (item: T, i: number) => number;
  colorFn: (item: T, i: number) => string;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="px-2 py-8 text-center text-[11.5px] font-medium text-[var(--vm-faint)]">{emptyLabel}</p>;
  }
  return (
    <ol className="flex flex-col px-3 pb-3 pt-1" style={{ gap: 2 }}>
      {items.map((item, i) => {
        const pct = Math.max(0, Math.min(100, pctFn(item, i)));
        const color = colorFn(item, i);
        return (
          <li key={keyFn(item, i)} className="flex items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-[var(--vm-tile)]">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[9px] font-bold" style={{ background: `${color}22`, color }}>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between gap-1">
                <span className="truncate text-[10.5px] font-semibold text-[var(--vm-text-soft)]">{labelFn(item)}</span>
                <span className="shrink-0 tabular-nums text-[11px] font-bold text-[var(--vm-text)]">{valueFn(item)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--vm-tile-2)]">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ── novos componentes de gráfico ─────────────────────────────────────────── */

/** Barras agrupadas — Atribuídas x Realizadas por técnico. */
function GroupedBarChart({ items }: { items: RankingTecnicoItem[] }) {
  if (items.length === 0) return <p className="px-2 py-8 text-center text-[11.5px] text-[var(--vm-faint)]">Sem dados no período.</p>;
  const max = Math.max(...items.map((t) => t.total), 1);
  return (
    <div className="flex flex-col gap-2.5 px-1 py-1">
      {items.map((t) => (
        <div key={t.id} className="flex items-center gap-2.5">
          <span className="w-[74px] shrink-0 truncate text-[11px] font-semibold text-[var(--vm-text-soft)]">{t.nome.split(" ")[0]}</span>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-[var(--vm-tile-2)]">
                <div className="h-full rounded-full" style={{ width: `${(t.total / max) * 100}%`, background: "#94A3B8" }} />
              </div>
              <span className="w-7 shrink-0 text-right text-[10px] font-bold tabular-nums text-[var(--vm-text-soft)]">{t.total}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-[var(--vm-tile-2)]">
                <div className="h-full rounded-full" style={{ width: `${(t.aprovadas / max) * 100}%`, background: "#059669" }} />
              </div>
              <span className="w-7 shrink-0 text-right text-[10px] font-bold tabular-nums text-[#059669]">{t.aprovadas}</span>
            </div>
          </div>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-3 pl-[82px] text-[9.5px] font-semibold text-[var(--vm-muted)]">
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#94A3B8" }} />Atribuídas</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#059669" }} />Realizadas</span>
      </div>
    </div>
  );
}

/** Donut multi-categoria — "Distribuição das vistorias" (genérico, N segmentos). */
function MultiDonut({
  segments,
  centerLabel,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  /** Rótulo pequeno embaixo do número central (ex.: "Reprovações"). Sem isso, só o número. */
  centerLabel?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const size = 112, stroke = 15;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  let acc = 0;
  return (
    <div className="flex w-full items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--vm-tile-2)" strokeWidth={stroke} />
        {total > 0 && segments.filter((s) => s.value > 0).map((s, i) => {
          const len = (s.value / total) * c;
          const dashoffset = -acc;
          acc += len;
          return (
            <circle key={i} cx={cx} cy={cx} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={dashoffset} transform={`rotate(-90 ${cx} ${cx})`} />
          );
        })}
        <text x={cx} y={centerLabel ? cx - 6 : cx} textAnchor="middle" dominantBaseline="central" className="fill-[var(--vm-text)]" style={{ fontSize: 20, fontWeight: 700 }}>
          {total}
        </text>
        {centerLabel && (
          <text x={cx} y={cx + 14} textAnchor="middle" dominantBaseline="central" className="fill-[var(--vm-faint)]" style={{ fontSize: 8, fontWeight: 600, textTransform: "uppercase" }}>
            {centerLabel}
          </text>
        )}
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5 overflow-y-auto">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-[10.5px]">
            <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-[var(--vm-text-soft)]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="font-bold tabular-nums text-[var(--vm-text)]">{s.value}</span>
              {total > 0 && <span className="w-8 text-right text-[9px] text-[var(--vm-faint)]">{Math.round((s.value / total) * 100)}%</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Linha de 3 séries (Atribuídas/Realizadas/Reprovadas) com toggle de período — clone do padrão já usado no dashboard (VelocityChart/AprovacoesChart), generalizado pra 3 séries. */
function EvolucaoTresSeriesChart({
  labels, atribuidas, realizadas, reprovadas, compact = false,
}: {
  labels: string[];
  atribuidas: number[];
  realizadas: number[];
  reprovadas: number[];
  /** Card mais baixo (empilhado ao lado do mapa) — reduz a altura do SVG. */
  compact?: boolean;
}) {
  if (labels.length === 0) return <p className="px-2 py-8 text-center text-[11.5px] text-[var(--vm-faint)]">Dados insuficientes no período.</p>;
  const VB_W = 1000, H = compact ? 110 : 170, padX = 12, padTop = 14, padBottom = 20;
  const plotH = H - padTop - padBottom;
  const n = labels.length;
  const max = Math.max(...atribuidas, ...realizadas, ...reprovadas, 1);
  const x = (i: number) => padX + (n === 1 ? 0 : (i / (n - 1)) * (VB_W - padX * 2));
  const y = (v: number) => padTop + (1 - v / max) * plotH;
  const lineOf = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const series: Array<{ vals: number[]; color: string; label: string }> = [
    { vals: atribuidas, color: "#94A3B8", label: "Atribuídas" },
    { vals: realizadas, color: "#059669", label: "Realizadas" },
    { vals: reprovadas, color: "#DC2626", label: "Reprovadas" },
  ];
  const tickIdx = Array.from({ length: Math.min(5, n) }, (_, k) => Math.round((k / (Math.min(5, n) - 1 || 1)) * (n - 1)));
  return (
    <div>
      <div className="relative" style={{ height: H }}>
        <svg viewBox={`0 0 ${VB_W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
          {[0.25, 0.5, 0.75].map((t) => (
            <line key={t} x1={padX} x2={VB_W - padX} y1={padTop + plotH * t} y2={padTop + plotH * t} stroke="var(--vm-border-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {series.map((s) => (
            <path key={s.label} d={lineOf(s.vals)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-[9px] text-[var(--vm-faint)]">
          {tickIdx.map((i) => <span key={i}>{labels[i]}</span>)}
        </div>
      </div>
      <div className="mt-1 flex items-center gap-3 text-[9.5px] font-semibold text-[var(--vm-muted)]">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
    </div>
  );
}

/** Barras verticais simples com rótulo de valor — "Tempo médio por status". */
function TempoMedioBarChart({ items }: { items: Array<{ label: string; min: number | null; color: string }> }) {
  const comDado = items.filter((i) => i.min != null) as Array<{ label: string; min: number; color: string }>;
  const max = Math.max(...comDado.map((i) => i.min), 1);
  return (
    <div className="flex items-end justify-between gap-3 px-1 pt-2" style={{ height: 130 }}>
      {items.map((it) => (
        <div key={it.label} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[10.5px] font-bold tabular-nums text-[var(--vm-text)]">{it.min != null ? `${it.min}min` : "—"}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md"
              style={{
                height: it.min != null ? `${Math.max((it.min / max) * 100, 6)}%` : "4%",
                background: it.min != null ? it.color : "var(--vm-tile-2)",
              }}
            />
          </div>
          <span className="text-center text-[9px] font-semibold leading-tight text-[var(--vm-muted)]">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Colunas por hora/dia/semana — "Vistorias por período". */
function VistoriasPorPeriodoChart({
  historico, periodoRange,
}: {
  historico: HistoricoAnalytics | null;
  periodoRange: { inicio: string; fim: string; dias: number };
}) {
  const [modo, setModo] = useState<"hora" | "dia" | "semana">("dia");

  const dadosHora = useMemo(() => {
    const porHora = new Map((historico?.vistoriasPorHora ?? []).map((h) => [h.hora, h.total]));
    return Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, "0")}h`, total: porHora.get(h) ?? 0 }));
  }, [historico]);

  const dadosDia = useMemo(() => {
    const dias = historico?.serieDiaria.slice(-periodoRange.dias) ?? [];
    return dias.map((d) => ({ label: d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7), total: d.finalizadas }));
  }, [historico, periodoRange.dias]);

  const dadosSemana = useMemo(() => {
    const dias = historico?.serieDiaria.slice(-periodoRange.dias) ?? [];
    const porSemana = new Map<string, number>();
    for (const d of dias) {
      const dt = new Date(d.dia + "T00:00:00Z");
      // Semana ISO (segunda a domingo) — chave = segunda-feira daquela semana.
      const day = (dt.getUTCDay() + 6) % 7;
      dt.setUTCDate(dt.getUTCDate() - day);
      const key = dt.toISOString().slice(0, 10);
      porSemana.set(key, (porSemana.get(key) ?? 0) + d.finalizadas);
    }
    return [...porSemana.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, total]) => ({ label: k.slice(8, 10) + "/" + k.slice(5, 7), total }));
  }, [historico, periodoRange.dias]);

  const dados = modo === "hora" ? dadosHora : modo === "dia" ? dadosDia : dadosSemana;
  const max = Math.max(...dados.map((d) => d.total), 1);
  const semDado = dados.every((d) => d.total === 0);

  return (
    <div>
      <div className="mb-2 flex gap-1.5">
        {(["hora", "dia", "semana"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize transition"
            style={modo === m ? { background: "#3B82F6", color: "#fff" } : { background: "var(--vm-tile)", color: "var(--vm-muted)" }}
          >
            {m}
          </button>
        ))}
      </div>
      {semDado ? (
        <p className="px-2 py-8 text-center text-[11.5px] text-[var(--vm-faint)]">Sem dados nesse recorte.</p>
      ) : (
        <div className="flex items-end gap-[3px]" style={{ height: 110 }}>
          {dados.map((d, i) => (
            <div key={i} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
              <div
                className="w-full rounded-t"
                style={{ height: `${Math.max((d.total / max) * 100, d.total > 0 ? 4 : 0)}%`, background: "#3B82F6", minHeight: d.total > 0 ? 2 : 0 }}
                title={`${d.label}: ${d.total}`}
              />
            </div>
          ))}
        </div>
      )}
      <div className="mt-1 flex justify-between text-[8.5px] text-[var(--vm-faint)]">
        <span>{dados[0]?.label ?? ""}</span>
        <span>{dados[dados.length - 1]?.label ?? ""}</span>
      </div>
    </div>
  );
}

/** Ranking compacto de municípios com toggle de 3 vias. */
function MunicipioRankingCompacto({ historico }: { historico: HistoricoAnalytics | null }) {
  const [ordenar, setOrdenar] = useState<"vistorias" | "realizadas" | "reprovacoes">("vistorias");
  const linhas = useMemo(() => {
    const rows = historico?.topMunicipiosPeriodo ?? [];
    const sorted = [...rows].sort((a, b) => {
      if (ordenar === "realizadas") return b.aprovado - a.aprovado;
      if (ordenar === "reprovacoes") return b.reprovado - a.reprovado;
      return b.concluidas - a.concluidas;
    });
    return sorted.slice(0, 8);
  }, [historico, ordenar]);
  const valorDe = (m: (typeof linhas)[number]) =>
    ordenar === "realizadas" ? m.aprovado : ordenar === "reprovacoes" ? m.reprovado : m.concluidas;
  const max = Math.max(...linhas.map(valorDe), 1);

  return (
    <div>
      <div className="mb-2 flex gap-1.5">
        {([
          ["vistorias", "Vistorias"],
          ["realizadas", "Realizadas"],
          ["reprovacoes", "Reprovações"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setOrdenar(id)}
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold transition"
            style={ordenar === id ? { background: "#059669", color: "#fff" } : { background: "var(--vm-tile)", color: "var(--vm-muted)" }}
          >
            {label}
          </button>
        ))}
      </div>
      {linhas.length === 0 ? (
        <p className="px-2 py-6 text-center text-[11.5px] text-[var(--vm-faint)]">Sem dados.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {linhas.map((m) => (
            <div key={m.municipio} className="flex items-center gap-2">
              <span className="w-[92px] shrink-0 truncate text-[10.5px] font-semibold text-[var(--vm-text-soft)]">{m.municipio}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--vm-tile-2)]">
                <div className="h-full rounded-full" style={{ width: `${(valorDe(m) / max) * 100}%`, background: "#059669" }} />
              </div>
              <span className="w-7 shrink-0 text-right text-[10.5px] font-bold tabular-nums text-[var(--vm-text)]">{valorDe(m)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── componente principal ─────────────────────────────────────────────────── */

export interface EquipeAoVivoProps {
  periodoLabel: string;
  periodoRange: { inicio: string; fim: string; dias: number };
  historico: HistoricoAnalytics | null;
  topTecsDash: TopTecnicosDashboard | null;
  equipePeriodo: Array<{ ranking: RankingTecnicoItem; ativo: TecnicoAtivo | null }>;
  vistoriasMapa: PainelMapaVistoria[];
  tecnicosMapa: PainelMapaTecnico[];
  tecnicosPorReprovacao: RankingTecnicoItem[];
  kpiEmVistoria: number;
  kpiEmDeslocamento: number;
  municipio: string;
  onMunicipioChange: (m: string) => void;
  onRefresh: () => void;
}

function fmtRelativo(d: Date | null): string {
  if (!d) return "—";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "agora mesmo";
  if (min === 1) return "há 1 min";
  return `há ${min} min`;
}

export default function EquipeAoVivo({
  periodoLabel,
  periodoRange,
  historico,
  topTecsDash,
  equipePeriodo,
  vistoriasMapa,
  tecnicosMapa,
  tecnicosPorReprovacao,
  kpiEmVistoria,
  kpiEmDeslocamento,
  municipio,
  onMunicipioChange,
  onRefresh,
}: EquipeAoVivoProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => { setAtualizadoEm(new Date()); }, [historico, topTecsDash]);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen().catch(() => {});
  };

  const municipiosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    (historico?.topMunicipiosPeriodo ?? []).forEach((m) => s.add(m.municipio));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [historico]);

  /* ── KPIs (moveram de page.tsx pra cá — só esta tela os usa) ────────────── */
  const kpiAtribuidas = useMemo(() => (topTecsDash?.tecnicos ?? []).reduce((s, t) => s + t.total, 0), [topTecsDash]);
  const kpiRealizadas = useMemo(() => (topTecsDash?.tecnicos ?? []).reduce((s, t) => s + t.aprovadas, 0), [topTecsDash]);
  const kpiAproveitamento = kpiAtribuidas > 0 ? Math.round((kpiRealizadas / kpiAtribuidas) * 100) : 0;
  // Reprovadas/Impedimentos: `historico.totais`/`topMunicipiosPeriodo.impedimento`
  // são as únicas fontes que respeitam de fato o filtro de período aqui
  // (topMunicipiosPeriodo.aprovado/reprovado NÃO respeita — é inventário
  // "todo período" por decisão de projeto documentada em historico.ts).
  const kpiReprovadas = historico?.totais.reprovadas ?? 0;
  const kpiImpedimentos = useMemo(() => (historico?.topMunicipiosPeriodo ?? []).reduce((s, m) => s + m.impedimento, 0), [historico]);

  const atribDelta = useMemo(() => {
    const anterior = historico?.totais.atribuidasPeriodoAnterior ?? 0;
    if (!anterior) return null;
    const atual = historico?.totais.atribuidas ?? 0;
    const pct = ((atual - anterior) / anterior) * 100;
    return { value: Math.abs(pct), up: pct >= 0 };
  }, [historico]);
  const reprovDelta = useMemo(() => {
    const anterior = historico?.totais.reprovadasPeriodoAnterior ?? 0;
    if (!anterior) return null;
    const pct = ((kpiReprovadas - anterior) / anterior) * 100;
    return { value: Math.abs(pct), up: pct >= 0 };
  }, [historico, kpiReprovadas]);

  /* ── Distribuição das vistorias (6 categorias) — a partir dos KPIs já
     calculados, sem query nova. Pendentes = residual (nunca negativo). */
  const donutSegments = useMemo(() => {
    const pendentes = Math.max(kpiAtribuidas - kpiRealizadas - kpiEmVistoria - kpiEmDeslocamento - kpiReprovadas, 0);
    return [
      { label: "Realizadas", value: kpiRealizadas, color: "#059669" },
      { label: "Em vistoria", value: kpiEmVistoria, color: "#F97316" },
      { label: "Em deslocamento", value: kpiEmDeslocamento, color: "#0891B2" },
      { label: "Impedimentos", value: kpiImpedimentos, color: "#7C3AED" },
      { label: "Reprovadas", value: kpiReprovadas, color: "#DC2626" },
      { label: "Pendentes", value: pendentes, color: "#94A3B8" },
    ];
  }, [kpiAtribuidas, kpiRealizadas, kpiEmVistoria, kpiEmDeslocamento, kpiImpedimentos, kpiReprovadas]);

  /* ── Evolução 3 séries — mesma janela que a página já mantém em serieDiaria. */
  const evolucao = useMemo(() => {
    const dias = (historico?.serieDiaria ?? []).slice(-periodoRange.dias);
    const fmtDia = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
    return {
      labels: dias.map((d) => fmtDia(d.dia)),
      atribuidas: dias.map((d) => d.atribuidas),
      realizadas: dias.map((d) => d.finalizadas),
      reprovadas: dias.map((d) => d.reprovadas),
    };
  }, [historico, periodoRange.dias]);

  /* ── Tempo médio por status ──────────────────────────────────────────── */
  const tempoMedioItems = useMemo(() => {
    const t = historico?.tempoMedioPorStatus;
    return [
      { label: "Realizada", min: t?.realizadaMin ?? null, color: "#059669" },
      { label: "Em vistoria", min: t?.emVistoriaMin ?? null, color: "#F97316" },
      { label: "Em deslocamento", min: t?.emDeslocamentoMin ?? null, color: "#0891B2" },
      { label: "Impedimento", min: t?.impedimentoMin ?? null, color: "#7C3AED" },
      { label: "Reprovada", min: t?.reprovadaMin ?? null, color: "#DC2626" },
    ];
  }, [historico]);

  /* ── Equipe em campo filtrada por município (2026-09-25) — client-side,
     usa o município ATUAL do técnico (ativo?.municipio); só afeta a lista,
     não os totais/KPIs (esses já vêm filtrados do backend). */
  const equipeFiltrada = useMemo(() => {
    if (!municipio) return equipePeriodo;
    return equipePeriodo.filter((x) => x.ativo?.municipio === municipio);
  }, [equipePeriodo, municipio]);

  const vistoriasMapaFiltradas = useMemo(() => {
    if (!municipio) return vistoriasMapa;
    return vistoriasMapa.filter((v) => v.municipio === municipio);
  }, [vistoriasMapa, municipio]);

  /* ── mapa (mesmo padrão de sinal.ts/novoMapa já usado no resto do painel) */
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const tecMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const token = getMapboxToken();

  useEffect(() => {
    if (!mapContainerRef.current || !token) return;
    injectStyle(
      "vm-equipe-vivo-css",
      ".vm-equipe-vivo-map .mapboxgl-ctrl-logo,.vm-equipe-vivo-map .mapboxgl-ctrl-attrib{display:none!important}" +
      ".vm-equipe-vivo-map .mapboxgl-ctrl-group{box-shadow:0 1px 4px rgba(0,0,0,0.12)!important}"
    );
    mapboxgl.accessToken = token;
    const { map } = novoMapa({
      container: mapContainerRef.current,
      style: dashMapStyle("mapbox://styles/mapbox/light-v11"),
      center: [-47.0626, -22.9064],
      zoom: 9.4,
      attributionControl: false,
    }, "painel/equipe-ao-vivo");
    if (!map) return;
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");
    return () => {
      tecMarkersRef.current.forEach((mk) => mk.remove());
      tecMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const geojson = {
      type: "FeatureCollection" as const,
      features: vistoriasMapaFiltradas
        .filter((v) => v.latitude != null && v.longitude != null)
        .map((v) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [v.longitude, v.latitude] },
          properties: {
            icone: iconeDe(v.situacao, v.is_revisita, v.bloqueio, v.status_aprovacao),
            tecnico_cor: v.tecnico_cor ?? ANEL_SEM_TECNICO,
            tem_tecnico: v.tecnico_id ? 1 : 0,
            atribuido: v.situacao === "ATRIBUIDO" ? 1 : 0,
          },
        })),
    };
    const EH_ATRIBUIDO = ["==", ["get", "atribuido"], 1] as unknown as boolean;
    const place = () => {
      registrarSpritesSinal(map);
      const src = map.getSource("vm-equipe-vivo-vist") as mapboxgl.GeoJSONSource | undefined;
      if (src) { src.setData(geojson as never); return; }
      map.addSource("vm-equipe-vivo-vist", { type: "geojson", data: geojson as never });
      map.addLayer({
        id: "vm-equipe-vivo-vist-anel",
        type: "circle",
        source: "vm-equipe-vivo-vist",
        paint: {
          "circle-color": ["case", EH_ATRIBUIDO, ["get", "tecnico_cor"], "#FFFFFF"] as never,
          "circle-radius": 9,
          "circle-stroke-color": ["case", EH_ATRIBUIDO, "#FFFFFF", ["get", "tecnico_cor"]] as never,
          "circle-stroke-width": 2.2,
          "circle-stroke-opacity": ["case", EH_ATRIBUIDO, 0.95, ["==", ["get", "tem_tecnico"], 1], 1, 0.6] as never,
        },
      });
      map.addLayer({
        id: "vm-equipe-vivo-vist-icone",
        type: "symbol",
        source: "vm-equipe-vivo-vist",
        layout: { "icon-image": ["get", "icone"] as never, "icon-anchor": "center", "icon-allow-overlap": true, "icon-size": 0.55 },
      });
    };
    if (map.isStyleLoaded()) place(); else map.once("load", place);
  }, [vistoriasMapaFiltradas]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const place = () => {
      tecMarkersRef.current.forEach((mk) => mk.remove());
      tecMarkersRef.current = [];
      tecnicosMapa
        .filter((t) => t.latitude != null && t.longitude != null)
        .forEach((t) => {
          const el = document.createElement("div");
          el.style.cssText = `width:20px;height:20px;border-radius:50%;background:${t.cor};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(16,24,40,0.45);cursor:pointer;z-index:5`;
          el.title = `${t.nome} · ${t.status_operacional}`;
          const mk = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([t.longitude!, t.latitude!]).addTo(map);
          tecMarkersRef.current.push(mk);
        });
    };
    if (map.isStyleLoaded()) place(); else map.once("load", place);
  }, [tecnicosMapa]);

  return (
    <div ref={rootRef} className="flex flex-col gap-4" style={fullscreen ? { background: "var(--vm-bg)", padding: 16, overflowY: "auto", height: "100vh" } : undefined}>
      {/* ═══════ Header ═══════ */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3.5" style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--vm-accent-tint)" }}>
            <Users className="h-4.5 w-4.5 text-[#059669]" strokeWidth={2.2} />
          </span>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-[14.5px] font-bold text-[var(--vm-text)]">Equipe ao vivo</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" style={{ animation: "vmBlink 1.4s ease-in-out infinite" }} />
                Operação em andamento
              </span>
            </div>
            <p className="text-[10.5px] text-[var(--vm-faint)]">
              Acompanhamento das vistorias em campo · Última atualização {fmtRelativo(atualizadoEm)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5" style={{ background: "var(--vm-tile)" }}>
            <Building2 className="h-3.5 w-3.5 text-[var(--vm-muted)]" />
            <select
              value={municipio}
              onChange={(e) => onMunicipioChange(e.target.value)}
              className="bg-transparent text-[11.5px] font-semibold text-[var(--vm-text)] outline-none"
            >
              <option value="">Todos os municípios</option>
              {municipiosDisponiveis.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={() => { onRefresh(); }}
            className="flex h-8 w-8 items-center justify-center rounded-xl transition hover:bg-[var(--vm-tile)]"
            style={{ border: "1px solid var(--vm-border-soft)" }}
            title="Atualizar"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[var(--vm-muted)]" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-xl transition hover:bg-[var(--vm-tile)]"
            style={{ border: "1px solid var(--vm-border-soft)" }}
            title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {fullscreen ? <Minimize className="h-3.5 w-3.5 text-[var(--vm-muted)]" /> : <Maximize className="h-3.5 w-3.5 text-[var(--vm-muted)]" />}
          </button>
        </div>
      </div>

      {/* ═══════ KPIs + Aproveitamento ═══════ */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <MiniKpiCard icon={ArrowRight} label="Vistorias atribuídas" value={fmtNum(kpiAtribuidas)} color="#3B82F6" bg="var(--vm-tile-blue)" caption={periodoLabel} delta={atribDelta} href="/painel/central-vistorias?status=ATRIBUIDO" />
        <MiniKpiCard icon={CheckCircle2} label="Vistorias realizadas" value={fmtNum(kpiRealizadas)} color="#059669" bg="var(--vm-accent-tint)" caption={`${kpiAproveitamento}% de aproveitamento`} href="/painel/central-vistorias?status=APROVADO,APROVADO_PENDENCIA" />
        <MiniKpiCard icon={Clock} label="Em vistoria" value={fmtNum(kpiEmVistoria)} color="#F97316" bg="var(--vm-orange-tint)" caption="agora" href="/painel/central-vistorias?status=2" />
        <MiniKpiCard icon={Route} label="Em deslocamento" value={fmtNum(kpiEmDeslocamento)} color="#0891B2" bg="rgba(14,165,233,0.10)" caption="agora" href="/painel/central-vistorias?status=7" />
        <MiniKpiCard icon={Ban} label="Impedimentos" value={fmtNum(kpiImpedimentos)} color="#7C3AED" bg="var(--vm-tile-purple)" caption={periodoLabel} href="/painel/ocorrencias?tipo=impedimento" />
        <MiniKpiCard icon={ShieldAlert} label="Reprovadas" value={fmtNum(kpiReprovadas)} color="#DC2626" bg="var(--vm-red-tint)" caption={periodoLabel} delta={reprovDelta} href="/painel/central-vistorias?status=REPROVADO" />
        <Card className="col-span-2 p-4 md:col-span-3 xl:col-span-1">
          <div className="flex h-full w-full items-center gap-4" style={{ background: "var(--vm-accent-tint)", margin: -16, padding: 16, borderRadius: 16 }}>
            <MiniDonut value={kpiAproveitamento} color="#059669" caption="Aproveitamento do dia" />
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-[11px] font-bold text-[var(--vm-text)]">Aproveitamento</span>
              <div className="flex items-baseline justify-between text-[10.5px] text-[var(--vm-text-soft)]"><span>Atribuídas</span><span className="tabular-nums font-bold">{kpiAtribuidas}</span></div>
              <div className="flex items-baseline justify-between text-[10.5px] text-[var(--vm-text-soft)]"><span>Realizadas</span><span className="tabular-nums font-bold">{kpiRealizadas}</span></div>
              <div className="flex items-baseline justify-between text-[10.5px] text-[var(--vm-text-soft)]"><span>Reprovadas</span><span className="tabular-nums font-bold">{kpiReprovadas}</span></div>
            </div>
          </div>
        </Card>
      </div>

      {/* ═══════ Equipe + Mapa + Distribuição/Evolução — uma linha só, cada
          um seu próprio card, alturas parelhas (pedido explícito: nada de
          faixa horizontal única achatada) ═══════ */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.25fr_0.58fr_0.24fr]">
        <Card style={{ height: 420 }}>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#059669]" strokeWidth={2.2} />
              <span className="text-[12.5px] font-semibold text-[var(--vm-text)]">Equipe em campo ({equipeFiltrada.length})</span>
            </div>
            <Link href="/painel/tecnicos" className="text-[10px] font-semibold text-[#059669] hover:underline">ver todos</Link>
          </div>
          <p className="px-4 pb-2 text-[9px] text-[var(--vm-faint)]">Vistorias atribuídas · {periodoLabel}</p>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
            {equipeFiltrada.length === 0 ? (
              <p className="px-2 py-8 text-center text-[11.5px] font-medium text-[var(--vm-faint)]">Nenhum técnico em campo agora.</p>
            ) : (
              equipeFiltrada.map(({ ranking: t, ativo }) => {
                const pct = t.total > 0 ? Math.round((t.aprovadas / t.total) * 100) : 0;
                const statusCor = ativo ? STATUS_DOT[ativo.status] : "var(--vm-faint)";
                const statusLabel = ativo ? STATUS_LABEL[ativo.status] : "Desligado";
                return (
                  <div key={t.id} className="rounded-xl border border-[var(--vm-border-soft)] bg-[var(--vm-tile)] p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold text-white" style={{ background: statusCor }}>
                        {initials(t.nome)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11.5px] font-bold leading-tight text-[var(--vm-text)]">{t.nome.split(" ")[0]}</p>
                        <p className="flex items-center gap-1 truncate text-[9px] font-semibold" style={{ color: statusCor }}>
                          <span className="h-[4.5px] w-[4.5px] shrink-0 rounded-full" style={{ background: statusCor }} />
                          {statusLabel} · {ativo?.municipio ?? "—"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2.5 pl-8 text-[9.5px] text-[var(--vm-faint)]">
                      <span><b className="text-[var(--vm-text)]">{t.total}</b> atrib.</span>
                      <span><b className="text-[#059669]">{t.aprovadas}</b> real.</span>
                      <span><b className="text-[#DC2626]">{t.reprovadas}</b> reprov.</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[var(--vm-tile-2)]">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#059669" }} />
                      </div>
                      <span className="w-7 shrink-0 text-right text-[9.5px] font-bold text-[var(--vm-muted)]">{pct}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card style={{ height: 420 }}>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div>
              <span className="text-[12.5px] font-semibold text-[var(--vm-text)]">Vistorias no mapa</span>
              <p className="text-[9px] text-[var(--vm-faint)]">Equipe e vistorias do dia em tempo real</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[9px] font-semibold text-[var(--vm-muted)]">
              {FAMILIA_ORDEM.map((fam) => (
                <span key={fam} className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: FAMILIA_COR[fam] }} />
                  {FAMILIA_LABEL[fam]}
                </span>
              ))}
              <span className="flex items-center gap-1"><Compass className="h-3 w-3" />Equipe</span>
            </div>
          </div>
          <div ref={mapContainerRef} className="vm-equipe-vivo-map min-h-0 flex-1 w-full" />
        </Card>

        <div className="flex flex-col gap-4" style={{ height: 420 }}>
          <Card className="min-h-0 flex-1">
            <p className="px-4 pt-4 pb-1 text-[12px] font-semibold text-[var(--vm-text)]">Distribuição das vistorias</p>
            <div className="flex min-h-0 flex-1 items-center px-4 pb-3">
              <MultiDonut segments={donutSegments} />
            </div>
          </Card>
          <Card className="min-h-0 flex-1">
            <p className="px-4 pt-4 pb-1 text-[12px] font-semibold text-[var(--vm-text)]">Evolução no período</p>
            <div className="flex-1 px-4 pb-2">
              <EvolucaoTresSeriesChart labels={evolucao.labels} atribuidas={evolucao.atribuidas} realizadas={evolucao.realizadas} reprovadas={evolucao.reprovadas} compact />
            </div>
          </Card>
        </div>
      </div>

      {/* ═══════ Análises — 4 cards lado a lado, cada um com sua própria
          identidade visual (barra, donut, barra agrupada) ═══════ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card style={{ height: 300 }}>
          <p className="px-4 pt-4 pb-1 text-[12px] font-semibold text-[var(--vm-text)]">Vistorias por município</p>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            <MunicipioRankingCompacto historico={historico} />
          </div>
        </Card>

        <Card style={{ height: 300 }}>
          <p className="px-4 pt-4 pb-1 text-[12px] font-semibold text-[var(--vm-text)]">Técnicos com mais reprovações</p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RankedBarList
              items={tecnicosPorReprovacao}
              keyFn={(t) => String(t.id)}
              labelFn={(t) => t.nome.split(" ")[0]}
              valueFn={(t) => String(t.revisitas)}
              pctFn={(t) => (tecnicosPorReprovacao[0]?.revisitas ? (t.revisitas / tecnicosPorReprovacao[0].revisitas) * 100 : 0)}
              colorFn={() => "#DC2626"}
              emptyLabel="Nenhuma reprovação no período."
            />
          </div>
        </Card>

        <Card style={{ height: 300 }}>
          <p className="px-4 pt-4 pb-1 text-[12px] font-semibold text-[var(--vm-text)]">Principais motivos de reprovação</p>
          <div className="flex min-h-0 flex-1 items-center overflow-y-auto px-4 pb-3">
            <MultiDonut segments={(historico?.motivosReprovacao ?? []).slice(0, 7).map((m, i) => ({ label: m.label, value: m.total, color: DONUT_MOTIVOS_CORES[i % DONUT_MOTIVOS_CORES.length] }))} centerLabel="Reprovações" />
          </div>
        </Card>

        <Card style={{ height: 300 }}>
          <p className="px-4 pt-4 pb-1 text-[12px] font-semibold text-[var(--vm-text)]">Atribuídas x Realizadas por técnico</p>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <GroupedBarChart items={[...(topTecsDash?.tecnicos ?? [])].sort((a, b) => b.total - a.total).slice(0, 6)} />
          </div>
        </Card>
      </div>

      {/* ═══════ Tempo real — Últimas vistorias + 2 gráficos menores ═══════ */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.5fr_0.5fr]">
        <Card style={{ height: 320 }}>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <Wrench className="h-4 w-4 text-[#3B82F6]" strokeWidth={2} />
            <span className="text-[12.5px] font-semibold text-[var(--vm-text)]">Últimas vistorias</span>
            <span className="ml-1 flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-blue-600">
              <span className="h-1 w-1 rounded-full bg-blue-500" style={{ animation: "vmBlink 1.4s ease-in-out infinite" }} />
              tempo real
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
            <table className="w-full min-w-[640px] border-collapse text-[11px]">
              <thead>
                <tr className="text-left text-[9px] font-semibold uppercase tracking-wide text-[var(--vm-faint)]">
                  <th className="px-2 py-1.5">Horário</th>
                  <th className="px-2 py-1.5">Técnico</th>
                  <th className="px-2 py-1.5">Código</th>
                  <th className="px-2 py-1.5">Município</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5">Motivo</th>
                  <th className="px-2 py-1.5 text-right">Tempo</th>
                </tr>
              </thead>
              <tbody>
                {(historico?.atividadeRecente ?? []).length === 0 ? (
                  <tr><td colSpan={7} className="px-2 py-8 text-center text-[var(--vm-faint)]">Sem eventos recentes.</td></tr>
                ) : (
                  (historico?.atividadeRecente ?? []).slice(0, 8).map((a, i) => {
                    const cor =
                      a.status === "Aprovada" || a.status === "Aprovado com Pendência" ? "#059669"
                      : a.status === "Reprovada" ? "#DC2626"
                      : a.status === "Vistoriada" ? "#3B82F6"
                      : a.status === "Impedida" ? "#F59E0B"
                      : "#6B7280";
                    return (
                      <tr key={`${a.ts}-${i}`} className="border-t border-[var(--vm-tile-2)] hover:bg-[var(--vm-tile)]">
                        <td className="px-2 py-1.5 tabular-nums text-[var(--vm-text-soft)]">{new Date(a.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="px-2 py-1.5 font-medium text-[var(--vm-text)]">{a.tecnico ?? "—"}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px] text-[var(--vm-muted)]">{a.equipamento}</td>
                        <td className="px-2 py-1.5 text-[var(--vm-text-soft)]">{a.municipio ?? "—"}</td>
                        <td className="px-2 py-1.5">
                          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: cor }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
                            {a.status}
                          </span>
                        </td>
                        <td className="max-w-[160px] truncate px-2 py-1.5 text-[var(--vm-faint)]">{a.motivo ?? "-"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-[var(--vm-text-soft)]">{a.tempoEmCampoMin != null ? `${a.tempoEmCampoMin} min` : "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card style={{ height: 320 }}>
          <p className="px-4 pt-4 pb-1 text-[12px] font-semibold text-[var(--vm-text)]">Tempo médio por status</p>
          <div className="flex-1 px-3 pb-3">
            <TempoMedioBarChart items={tempoMedioItems} />
          </div>
        </Card>

        <Card style={{ height: 320 }}>
          <p className="px-4 pt-4 pb-1 text-[12px] font-semibold text-[var(--vm-text)]">Vistorias por período</p>
          <div className="flex-1 px-3 pb-3">
            <VistoriasPorPeriodoChart historico={historico} periodoRange={periodoRange} />
          </div>
        </Card>
      </div>
    </div>
  );
}
