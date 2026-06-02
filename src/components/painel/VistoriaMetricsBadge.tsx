"use client";

import { useEffect, useState } from "react";
import { api } from "@/services/api";

interface Metrics {
  tempo_min: number | null;
  km_percorridos: number | null;
  inicio_at: string | null;
  fim_at: string | null;
  tecnico: { id: number; nome: string } | null;
}

interface Props {
  vistoriaId: string | number;
}

export function VistoriaMetricsBadge({ vistoriaId }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Lazy fetch — only loads once on mount
  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    setLoading(true);
    api
      .get<Metrics>(`/painel/vistoria-metrics?vistoria_id=${vistoriaId}`)
      .then((r) => setMetrics(r.data))
      .catch(() => setMetrics(null))
      .finally(() => setLoading(false));
  }, [vistoriaId, loaded]);

  if (loading) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-[2px] text-[10px]"
        style={{
          background: "rgba(255,255,255,0.7)",
          border: "1px solid rgba(6,59,59,0.08)",
          color: "#94A3B8",
          gap: 6,
        }}
      >
        carregando…
      </span>
    );
  }

  if (!metrics || (metrics.tempo_min == null && metrics.km_percorridos == null)) {
    return null;
  }

  const parts: string[] = [];
  if (metrics.tempo_min != null) parts.push(`⏱ ${metrics.tempo_min}min`);
  if (metrics.km_percorridos != null) parts.push(`📍 ${metrics.km_percorridos.toFixed(1)} km`);

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium"
      style={{
        background: "rgba(255,255,255,0.72)",
        border: "1px solid rgba(6,59,59,0.08)",
        color: "#475569",
        gap: 8,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </span>
  );
}
