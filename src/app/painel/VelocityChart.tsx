"use client";

/**
 * Extraído de page.tsx (2026-09-24) — Next.js não permite named exports
 * extras num arquivo page.tsx (só default/metadata/etc.), e a Análise
 * Operacional dos Técnicos (AnaliseOperacionalTecnicos.tsx) precisa
 * reaproveitar este gráfico pro "Aproveitamento ao longo do período".
 *
 * SVG próprio para não tocar no AreaChart compartilhado (usado no
 * histórico). Linha verde 2px, área gradiente, linha de média tracejada
 * laranja, ponto de pico destacado e eixo X com datas.
 */
export function VelocityChart({
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
