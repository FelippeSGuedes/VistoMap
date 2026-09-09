"use client";

import { useEffect, useRef, useState } from "react";

/** 1234 → "1,2k" (formato compacto usado nos KPIs do painel). */
function fmtCompacto(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",") + "k";
  return String(n);
}

/**
 * Contador animado (ease-out cúbico) — extraído de painel/page.tsx pra
 * ser reutilizável em qualquer tela com KPI numérico (ex.: vistorias/page.tsx).
 */
export function CountUp({ value, duration = 850 }: { value: number; duration?: number }) {
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
  return <>{fmtCompacto(display)}</>;
}
