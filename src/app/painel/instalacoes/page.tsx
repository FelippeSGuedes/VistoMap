"use client";

/**
 * Dashboard operacional do módulo de Instalação — Fase 1 da observabilidade
 * (ver plano). Espelha a UX dos 4 cards hero de /painel/page.tsx (Vistoria),
 * reconstruído do zero: não importa nada de lá, só o mesmo padrão visual
 * (--vm-* CSS vars, Card/CountUp duplicados aqui).
 */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Activity, Ban, CheckCircle2, LayoutDashboard, Wrench } from "lucide-react";
import { fetchInstalacoesStats } from "@/services/painel-instalacoes";
import type { PainelInstalacoesStats } from "@/types/painel-instalacoes";

const POLL_MS = 20_000;

function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR");
}

function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl bg-white ${className}`}
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
    if (from === to) {
      setDisplay(to);
      return;
    }
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

export default function InstalacoesPainelDashboard() {
  const [stats, setStats] = useState<PainelInstalacoesStats | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchInstalacoesStats()
        .then((s) => {
          if (alive) {
            setStats(s);
            setErro(null);
          }
        })
        .catch(() => {
          if (alive) setErro("Falha ao carregar os indicadores.");
        });
    };
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const kpis = [
    {
      label: "Liberados",
      value: stats?.liberados ?? null,
      sub: "aguardando instalador assumir",
      color: "#F59E0B",
      icon: Wrench,
      href: "/painel/instalacoes",
    },
    {
      label: "Em Instalação",
      value: stats?.emInstalacao ?? null,
      sub: `${stats?.instaladores24h ?? 0} instalador${(stats?.instaladores24h ?? 0) === 1 ? "" : "es"} em campo`,
      color: "#3B82F6",
      icon: Activity,
      href: "/painel/instalacoes/mapa",
    },
    {
      label: "Instaladas (30d)",
      value: stats?.instaladas30d ?? null,
      sub: "últimos 30 dias",
      color: "#10B981",
      icon: CheckCircle2,
      href: null,
    },
    {
      label: "Rejeitadas",
      value: stats?.rejeitadasPendentes ?? null,
      sub: "aguardando decisão",
      color: "#DC2626",
      icon: Ban,
      href: "/painel/instalacoes/rejeitadas",
    },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <header className="mb-5 flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: "rgba(0,179,136,0.12)", color: "#00B388" }}
        >
          <LayoutDashboard className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[17px] font-bold" style={{ color: "var(--vm-text)" }}>
            Operação — Instalação
          </h1>
          <p className="text-[12.5px]" style={{ color: "var(--vm-text-muted)" }}>
            Visão geral dos postes liberados, em instalação e finalizados
          </p>
        </div>
      </header>

      {erro && (
        <p className="mb-4 rounded-xl px-3 py-2 text-[12.5px] font-medium" style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626" }}>
          {erro}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          const content = (
            <Card className="p-4 transition hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ background: `${k.color}1F`, color: k.color }}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--vm-text-muted)" }}>
                {k.label}
              </p>
              <div className="mt-0.5 text-[26px] font-bold tabular-nums" style={{ color: "var(--vm-text)" }}>
                {k.value != null ? <CountUp value={k.value} /> : "—"}
              </div>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--vm-text-muted)" }}>
                {k.sub}
              </p>
            </Card>
          );
          return k.href ? (
            <Link key={k.label} href={k.href}>
              {content}
            </Link>
          ) : (
            <div key={k.label}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}
