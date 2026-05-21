"use client";

/**
 * Chart components premium pro /painel.
 * SVG puro + Framer Motion. Sem libs externas (sem recharts/d3).
 *
 * - AreaChart   : série temporal com fill gradient
 * - StackedArea : duas séries empilhadas (ex: finalizadas vs reprovadas)
 * - DonutChart  : donut com label central
 * - BarRanking  : barras horizontais ordenadas
 * - GaugeRate   : meio-arco indicando % (taxa)
 */

import { motion } from "framer-motion";
import { useMemo } from "react";

/* ── AreaChart ────────────────────────────────────────────────────── */

export interface AreaChartProps {
  data: number[];
  labels?: string[];
  color: string;
  height?: number;
  showAxis?: boolean;
}

export function AreaChart({
  data,
  labels,
  color,
  height = 120,
  showAxis = false,
}: AreaChartProps) {
  if (!data.length) return null;
  const w = 600;
  const h = height;
  const padX = 8;
  const padY = 12;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);

  const pts = data.map((v, i) => {
    const x = padX + (i / (data.length - 1)) * (w - padX * 2);
    const y = padY + (1 - (v - min) / range) * (h - padY * 2);
    return [x, y] as const;
  });

  const d = pts
    .map(([x, y], i) => {
      if (i === 0) return `M${x.toFixed(1)},${y.toFixed(1)}`;
      const [px, py] = pts[i - 1];
      const mx = (px + x) / 2;
      return `Q${px.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${((py + y) / 2).toFixed(1)} T${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const dFill = `${d} L${w - padX},${h - padY} L${padX},${h - padY} Z`;
  const gid = `area-${color.replace("#", "")}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.34" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* grid horizontal */}
      {showAxis && (
        <>
          {[0.25, 0.5, 0.75].map((t) => (
            <line
              key={t}
              x1={padX}
              x2={w - padX}
              y1={padY + (h - padY * 2) * t}
              y2={padY + (h - padY * 2) * t}
              stroke="rgba(6,59,59,0.06)"
              strokeDasharray="3 3"
              strokeWidth="0.6"
            />
          ))}
        </>
      )}

      <motion.path
        d={dFill}
        fill={`url(#${gid})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />

      {/* pontos finais */}
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={color} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="6" fill={color} fillOpacity="0.22" />

      {/* labels eixo X — primeiro/meio/ultimo */}
      {showAxis && labels && (
        <>
          {[0, Math.floor(labels.length / 2), labels.length - 1].map((i) => (
            <text
              key={i}
              x={padX + (i / (data.length - 1)) * (w - padX * 2)}
              y={h - 1}
              textAnchor="middle"
              fontSize="8"
              fill="rgba(6,59,59,0.45)"
              style={{ fontFamily: "ui-sans-serif" }}
            >
              {labels[i]}
            </text>
          ))}
        </>
      )}
    </svg>
  );
}

/* ── StackedArea ──────────────────────────────────────────────────── */

export interface StackedAreaProps {
  series: Array<{ name: string; color: string; data: number[] }>;
  labels?: string[];
  height?: number;
}

export function StackedArea({ series, labels, height = 220 }: StackedAreaProps) {
  if (!series.length || !series[0].data.length) return null;
  const n = series[0].data.length;
  const w = 600;
  const h = height;
  const padX = 24;
  const padY = 22;

  // soma máxima
  const stackedTotals = Array(n)
    .fill(0)
    .map((_, i) => series.reduce((s, sr) => s + (sr.data[i] ?? 0), 0));
  const max = Math.max(...stackedTotals, 1);

  // Constrói "bandas" empilhadas — cumulative top.
  const cumulative = Array(n).fill(0);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        {series.map((s) => {
          const gid = `stk-${s.color.replace("#", "")}`;
          return (
            <linearGradient key={gid} id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.05" />
            </linearGradient>
          );
        })}
      </defs>

      {/* grid */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={padX}
          x2={w - padX}
          y1={padY + (h - padY * 2) * t}
          y2={padY + (h - padY * 2) * t}
          stroke="rgba(6,59,59,0.06)"
          strokeDasharray="3 3"
          strokeWidth="0.6"
        />
      ))}

      {/* Bandas (de baixo pra cima) */}
      {series.map((s, sIdx) => {
        const ptsTop = s.data.map((v, i) => {
          const acc = cumulative[i] + v;
          const x = padX + (i / (n - 1)) * (w - padX * 2);
          const y = padY + (1 - acc / max) * (h - padY * 2);
          return [x, y] as const;
        });
        const ptsBottom = s.data.map((_v, i) => {
          const acc = cumulative[i];
          const x = padX + (i / (n - 1)) * (w - padX * 2);
          const y = padY + (1 - acc / max) * (h - padY * 2);
          return [x, y] as const;
        });
        // atualiza cumulative pra próxima banda
        s.data.forEach((v, i) => (cumulative[i] += v));

        const dTop = ptsTop
          .map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`))
          .join(" ");
        const dBottomRev = [...ptsBottom]
          .reverse()
          .map(([x, y]) => `L${x},${y}`)
          .join(" ");
        const dFill = `${dTop} ${dBottomRev} Z`;
        const dLine = dTop;
        const gid = `stk-${s.color.replace("#", "")}`;

        return (
          <g key={s.name}>
            <motion.path
              d={dFill}
              fill={`url(#${gid})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.1 * sIdx }}
            />
            <motion.path
              d={dLine}
              fill="none"
              stroke={s.color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.0, ease: "easeOut", delay: 0.1 * sIdx }}
            />
          </g>
        );
      })}

      {/* labels eixo X */}
      {labels && (
        <>
          {[0, Math.floor(labels.length / 2), labels.length - 1].map((i) => (
            <text
              key={i}
              x={padX + (i / (n - 1)) * (w - padX * 2)}
              y={h - 4}
              textAnchor="middle"
              fontSize="9"
              fill="rgba(6,59,59,0.45)"
              style={{ fontFamily: "ui-sans-serif" }}
            >
              {labels[i]}
            </text>
          ))}
        </>
      )}
    </svg>
  );
}

/* ── DonutChart ────────────────────────────────────────────────────── */

export interface DonutChartProps {
  segments: Array<{ label: string; value: number; color: string }>;
  centerLabel?: string;
  centerValue?: string | number;
  size?: number;
}

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  size = 180,
}: DonutChartProps) {
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const circ = 2 * Math.PI * r;

  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(6,59,59,0.05)" strokeWidth="14" />
      {segments.map((s, i) => {
        const len = (s.value / total) * circ;
        const offset = -acc;
        acc += len;
        return (
          <motion.circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${len} ${circ}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            initial={{ strokeDasharray: `0 ${circ}` }}
            animate={{ strokeDasharray: `${len} ${circ}` }}
            transition={{ duration: 0.9, delay: 0.06 * i, ease: "easeOut" }}
          />
        );
      })}
      {centerLabel && (
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontSize="9"
          fontWeight="700"
          letterSpacing="2"
          fill="#7A8896"
          style={{ fontFamily: "ui-sans-serif" }}
        >
          {centerLabel.toUpperCase()}
        </text>
      )}
      {centerValue != null && (
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill="#063B3B"
          style={{ fontFamily: "ui-sans-serif" }}
        >
          {centerValue}
        </text>
      )}
    </svg>
  );
}

/* ── BarRanking ────────────────────────────────────────────────────── */

export interface BarRankingProps {
  items: Array<{ label: string; value: number; color?: string }>;
  formatValue?: (v: number) => string;
  height?: number;
}

export function BarRanking({
  items,
  formatValue,
  height = 280,
}: BarRankingProps) {
  const max = useMemo(() => Math.max(...items.map((i) => i.value), 1), [items]);
  return (
    <div className="flex flex-col gap-2.5" style={{ height }}>
      {items.map((it, i) => {
        const pct = (it.value / max) * 100;
        const color = it.color ?? "#00B388";
        return (
          <div key={it.label + i} className="flex items-center gap-3">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums"
              style={{
                background: i < 3 ? `${color}22` : "rgba(6,59,59,0.06)",
                color: i < 3 ? color : "#7A8896",
              }}
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] font-semibold tracking-tight" style={{ color: "#063B3B" }}>
                  {it.label}
                </span>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: "#063B3B" }}>
                  {formatValue ? formatValue(it.value) : it.value}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(6,59,59,0.05)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, delay: 0.04 * i, ease: [0.22, 0.7, 0.2, 1] }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── GaugeRate (meio-arco) ─────────────────────────────────────────── */

export interface GaugeRateProps {
  value: number; // 0..100
  label: string;
  color: string;
  size?: number;
}

export function GaugeRate({ value, label, color, size = 160 }: GaugeRateProps) {
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const circ = Math.PI * r; // meio círculo
  const clamped = Math.min(100, Math.max(0, value));
  const dash = (clamped / 100) * circ;

  return (
    <svg viewBox={`0 0 ${size} ${size * 0.65}`} className="h-full w-full">
      {/* trilho */}
      <path
        d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
        fill="none"
        stroke="rgba(6,59,59,0.06)"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {/* preenchimento */}
      <motion.path
        d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        initial={{ strokeDasharray: `0 ${circ}` }}
        animate={{ strokeDasharray: `${dash} ${circ}` }}
        transition={{ duration: 1.0, ease: "easeOut" }}
      />
      {/* valor central */}
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        fontSize="26"
        fontWeight="700"
        fill="#063B3B"
        style={{ fontFamily: "ui-sans-serif" }}
      >
        {Math.round(clamped)}%
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        fontSize="9"
        fontWeight="600"
        letterSpacing="2"
        fill="#7A8896"
        style={{ fontFamily: "ui-sans-serif" }}
      >
        {label.toUpperCase()}
      </text>
    </svg>
  );
}

/* ── FunnelChart ───────────────────────────────────────────────────── */

export interface FunnelChartProps {
  stages: Array<{ label: string; value: number; color: string }>;
  height?: number;
}

/**
 * Funil vertical clássico estilo enterprise: cada estágio é uma "tira"
 * com largura proporcional ao valor relativo (vs estágio anterior, não
 * vs total). Curvas suaves Bezier conectam as transições.
 *
 * Mostra simultaneamente:
 *  • silhueta visual do drop-off
 *  • valor absoluto + % do estágio anterior na lateral
 */
export function FunnelChart({ stages, height = 260 }: FunnelChartProps) {
  if (!stages.length) return null;
  const w = 720;
  const h = height;
  const padX = 32;
  const padY = 8;

  // largura do estágio relativa ao MAIOR valor da série (escala visual).
  const max = Math.max(...stages.map((s) => Math.max(s.value, 0.0001)));
  const stageH = (h - padY * 2) / stages.length;
  const cx = w / 2;
  const minW = 80; // largura mínima pra não desaparecer com valor 0

  // calcula geometria de cada estágio (top width / bottom width)
  const geom = stages.map((s, i) => {
    const cur = Math.max(s.value, 0);
    const nxt = i < stages.length - 1 ? Math.max(stages[i + 1].value, 0) : cur * 0.6;
    const wTop = Math.max((cur / max) * (w - padX * 2) * 0.86, minW);
    const wBot = Math.max((nxt / max) * (w - padX * 2) * 0.86, minW * 0.6);
    const yTop = padY + stageH * i;
    const yBot = padY + stageH * (i + 1);
    return { wTop, wBot, yTop, yBot, value: s.value };
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        {stages.map((s) => {
          const gid = `fnl-${s.color.replace("#", "")}`;
          return (
            <linearGradient key={gid} id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="1" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.78" />
            </linearGradient>
          );
        })}
        {/* drop shadow inset */}
        <filter id="fnl-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>

      {stages.map((s, i) => {
        const g = geom[i];
        const xLT = cx - g.wTop / 2;
        const xRT = cx + g.wTop / 2;
        const xLB = cx - g.wBot / 2;
        const xRB = cx + g.wBot / 2;
        // Curva Bezier nas laterais — controle horizontal pra "fluir"
        const cyMid = (g.yTop + g.yBot) / 2;
        const dx = (xLT - xLB) * 0.35;
        const path = [
          `M ${xLT},${g.yTop}`,
          `L ${xRT},${g.yTop}`,
          `C ${xRT + dx},${cyMid} ${xRB - dx},${cyMid} ${xRB},${g.yBot}`,
          `L ${xLB},${g.yBot}`,
          `C ${xLB + dx},${cyMid} ${xLT - dx},${cyMid} ${xLT},${g.yTop}`,
          "Z",
        ].join(" ");
        const gid = `fnl-${s.color.replace("#", "")}`;
        const sombra = i === stages.length - 1 ? "" : g.value;

        // label inline lateral (direita)
        const labelX = cx + g.wTop / 2 + 18;
        const labelY = g.yTop + 16;

        // % vs anterior
        let pct: string | null = null;
        if (i > 0) {
          const prev = stages[i - 1].value;
          pct = prev > 0 ? `${Math.round((s.value / prev) * 100)}%` : null;
        }

        return (
          <g key={s.label}>
            {/* sombra suave abaixo da forma */}
            <motion.path
              d={path}
              fill={s.color}
              fillOpacity="0.16"
              transform="translate(0,5)"
              filter="url(#fnl-shadow)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.08 * i + 0.05 }}
            />
            {/* corpo */}
            <motion.path
              d={path}
              fill={`url(#${gid})`}
              stroke={s.color}
              strokeOpacity="0.5"
              strokeWidth="0.8"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.08 * i, ease: [0.22, 0.7, 0.2, 1] }}
            />
            {/* highlight superior */}
            <motion.line
              x1={xLT + 2}
              x2={xRT - 2}
              y1={g.yTop + 0.6}
              y2={g.yTop + 0.6}
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1"
              strokeLinecap="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.08 * i + 0.18 }}
            />
            {/* label dentro do estágio (centro) */}
            <text
              x={cx}
              y={cyMid + 6}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              letterSpacing="1.3"
              fill="#fff"
              fillOpacity="0.95"
              style={{ fontFamily: "ui-sans-serif" }}
            >
              {s.label.toUpperCase()}
            </text>
            {/* badge externo à direita: valor + % */}
            <g>
              <rect
                x={labelX}
                y={labelY - 14}
                rx="6"
                width={pct ? 90 : 60}
                height="28"
                fill="#fff"
                stroke={s.color}
                strokeOpacity="0.22"
              />
              <text
                x={labelX + 10}
                y={labelY + 5}
                fontSize="14"
                fontWeight="700"
                fill="#063B3B"
                style={{ fontFamily: "ui-sans-serif" }}
              >
                {s.value.toLocaleString("pt-BR")}
              </text>
              {pct && (
                <text
                  x={labelX + (pct.length >= 4 ? 50 : 56)}
                  y={labelY + 5}
                  fontSize="10"
                  fontWeight="600"
                  fill={s.color}
                  style={{ fontFamily: "ui-sans-serif" }}
                >
                  · {pct}
                </text>
              )}
            </g>
            {/* dot indicador no início do label */}
            <circle cx={labelX - 4} cy={labelY} r="2.4" fill={s.color} />
          </g>
        );
      })}
    </svg>
  );
}

/* ── CalendarHeatmap ───────────────────────────────────────────────── */

export interface CalendarHeatmapProps {
  data: Array<{ date: string; value: number }>;
  color?: string;
  cellSize?: number;
  cellGap?: number;
}

/**
 * Heatmap calendário estilo GitHub. 7 linhas (dom→sáb) × N semanas.
 * Cor escala log-like 5 níveis. Mostra padrão de atividade temporal.
 */
export function CalendarHeatmap({
  data,
  color = "#00B388",
  cellSize = 12,
  cellGap = 3,
}: CalendarHeatmapProps) {
  if (!data.length) return null;
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const first = new Date(sorted[0].date + "T00:00:00");
  const last = new Date(sorted[sorted.length - 1].date + "T00:00:00");
  // alinha primeira coluna no domingo anterior
  const startCol = new Date(first);
  startCol.setDate(first.getDate() - first.getDay());

  const map = new Map(sorted.map((d) => [d.date, d.value]));
  const max = Math.max(...sorted.map((d) => d.value), 1);

  const cells: Array<{ x: number; y: number; date: string; value: number }> = [];
  const cur = new Date(startCol);
  let col = 0;
  while (cur <= last) {
    const dow = cur.getDay();
    if (dow === 0 && cur > startCol) col++;
    const iso = cur.toISOString().slice(0, 10);
    const v = map.get(iso) ?? 0;
    cells.push({ x: col, y: dow, date: iso, value: v });
    cur.setDate(cur.getDate() + 1);
  }
  const totalCols = col + 1;
  const w = totalCols * (cellSize + cellGap) + 28;
  const h = 7 * (cellSize + cellGap) + 18;

  const intensity = (v: number): { fill: string; opacity: number } => {
    if (v <= 0) return { fill: "rgba(6,59,59,0.06)", opacity: 1 };
    const t = Math.min(1, v / max);
    const op = 0.22 + t * 0.78;
    return { fill: color, opacity: op };
  };

  const dayLabels = ["", "S", "", "Q", "", "S", ""];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full">
      {dayLabels.map((d, i) =>
        d ? (
          <text
            key={i}
            x="0"
            y={i * (cellSize + cellGap) + cellSize - 1}
            fontSize="8"
            fontWeight="600"
            fill="#A0ACBA"
            style={{ fontFamily: "ui-sans-serif" }}
          >
            {d}
          </text>
        ) : null
      )}
      {cells.map((c, i) => {
        const { fill, opacity } = intensity(c.value);
        return (
          <motion.rect
            key={c.date}
            x={20 + c.x * (cellSize + cellGap)}
            y={c.y * (cellSize + cellGap)}
            width={cellSize}
            height={cellSize}
            rx="2.6"
            fill={fill}
            fillOpacity={opacity}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.35,
              delay: 0.004 * i,
              ease: "easeOut",
            }}
          >
            <title>{`${c.date}: ${c.value}`}</title>
          </motion.rect>
        );
      })}
    </svg>
  );
}
