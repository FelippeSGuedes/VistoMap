"use client";

/**
 * /historico — Histórico operacional enterprise.
 * KPIs agregados, timeline cronológica, municípios atendidos.
 * Mock por enquanto; backend real virá em PR futuro (endpoint
 * /api/historico que agrega audit table + GLPI).
 */

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Filter,
  FileText,
  History,
  MapPin,
  Route,
  RotateCw,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  TimerReset,
  XCircle,
} from "lucide-react";
import { BottomNav } from "@/components/layout/BottomNav";
import { useAuthStore } from "@/store/auth";
import { MOCK_HISTORICO } from "@/utils/mock";
import type { HistoricoEntry, HistoricoSummary } from "@/types";

/* ── helpers ───────────────────────────────────────────────────────── */

function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " · " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

function relativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diffMs / 3_600_000);
  if (h < 1) return "agora";
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

/* ── timeline icon mapping ─────────────────────────────────────────── */

const TIPO_ICON: Record<HistoricoEntry["tipo"], typeof CheckCircle2> = {
  "vistoria-finalizada": CheckCircle2,
  "vistoria-iniciada": ClipboardCheck,
  "mudanca-poste": MapPin,
  revisita: RotateCw,
  "pdf-gerado": FileText,
  sincronizacao: RefreshCcw,
  "rota-iniciada": Route,
  aprovacao: ShieldCheck,
  reprovacao: XCircle,
};

const TIPO_COLOR: Record<HistoricoEntry["tipo"], { bg: string; fg: string }> = {
  "vistoria-finalizada": { bg: "rgba(0,179,136,0.14)", fg: "#00B388" },
  "vistoria-iniciada": { bg: "rgba(99,102,241,0.14)", fg: "#6366F1" },
  "mudanca-poste": { bg: "rgba(245,158,11,0.14)", fg: "#F59E0B" },
  revisita: { bg: "rgba(245,158,11,0.18)", fg: "#D97706" },
  "pdf-gerado": { bg: "rgba(6,59,59,0.10)", fg: "#063B3B" },
  sincronizacao: { bg: "rgba(14,165,233,0.14)", fg: "#0EA5E9" },
  "rota-iniciada": { bg: "rgba(99,102,241,0.14)", fg: "#6366F1" },
  aprovacao: { bg: "rgba(0,179,136,0.14)", fg: "#00B388" },
  reprovacao: { bg: "rgba(239,68,68,0.14)", fg: "#EF4444" },
};

const TIPO_LABEL: Record<HistoricoEntry["tipo"], string> = {
  "vistoria-finalizada": "Vistoria finalizada",
  "vistoria-iniciada": "Iniciada",
  "mudanca-poste": "Mudança PSPOSTE",
  revisita: "Revisita",
  "pdf-gerado": "PDF gerado",
  sincronizacao: "Sincronização",
  "rota-iniciada": "Rota",
  aprovacao: "Aprovada",
  reprovacao: "Reprovada",
};

/* ── KPI card ──────────────────────────────────────────────────────── */

const KPIS: Array<{
  key: keyof Pick<
    HistoricoSummary,
    | "vistoriasEnviadas"
    | "vistoriasEntregues"
    | "aprovadas"
    | "reprovadas"
    | "revisitas"
    | "pdfsGerados"
    | "rotasExecutadas"
    | "sincronizacoes"
  >;
  label: string;
  icon: typeof CheckCircle2;
  hex: string;
  pill: string;
}> = [
  { key: "vistoriasEnviadas", label: "Enviadas", icon: ClipboardCheck, hex: "#6366F1", pill: "#EEF2FF" },
  { key: "vistoriasEntregues", label: "Entregues", icon: CheckCircle2, hex: "#00B388", pill: "#ECFDF5" },
  { key: "aprovadas", label: "Aprovadas", icon: ShieldCheck, hex: "#00B388", pill: "#ECFDF5" },
  { key: "reprovadas", label: "Revisitas", icon: RotateCw, hex: "#F59E0B", pill: "#FEF3C7" },
  { key: "pdfsGerados", label: "PDFs", icon: FileText, hex: "#063B3B", pill: "rgba(6,59,59,0.06)" },
  { key: "rotasExecutadas", label: "Rotas", icon: Route, hex: "#6366F1", pill: "#EEF2FF" },
];

const PERIODOS = [
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
  { id: "all", label: "Tudo" },
];

/* ── page ──────────────────────────────────────────────────────────── */

export default function HistoricoPage() {
  const router = useRouter();
  const { hydrated, session } = useAuthStore();
  const [periodo, setPeriodo] = useState<string>("7d");
  const [summary] = useState<HistoricoSummary>(MOCK_HISTORICO);

  useEffect(() => {
    if (hydrated && !session) router.replace("/login");
  }, [hydrated, session, router]);

  const groupedByDay = useMemo(() => {
    const map = new Map<string, HistoricoEntry[]>();
    for (const e of summary.timeline) {
      const d = new Date(e.timestamp);
      const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [summary.timeline]);

  return (
    <div className="relative flex min-h-[100dvh] flex-col" style={{ background: "#F7F9FB" }}>
      {/* HEADER */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-40 flex items-center gap-3 px-5"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 18px)",
          paddingBottom: 14,
          background: "rgba(247,249,251,0.82)",
          backdropFilter: "saturate(180%) blur(24px)",
          WebkitBackdropFilter: "saturate(180%) blur(24px)",
          borderBottom: "1px solid rgba(6,59,59,0.055)",
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-ink shadow-soft transition active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#00B388" }}>
            Operacional
          </p>
          <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "#063B3B" }}>
            Histórico
          </h1>
        </div>
        <span
          className="flex h-10 w-10 items-center justify-center rounded-2xl"
          style={{
            background: "linear-gradient(135deg, rgba(0,179,136,0.15), rgba(0,179,136,0.06))",
            color: "#00B388",
          }}
        >
          <History className="h-5 w-5" />
        </span>
      </motion.header>

      <main className="mx-auto flex w-full max-w-[600px] flex-1 flex-col gap-5 px-4 pb-32 pt-4">
        {/* PERÍODO */}
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#B0BAC5" }}>
              Período
            </p>
            <button
              type="button"
              className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-brand-emerald"
            >
              <Filter className="h-3 w-3" />
              Customizar
            </button>
          </div>
          <div
            className="flex items-center gap-1 rounded-full p-1"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(6,59,59,0.07)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset",
            }}
          >
            {PERIODOS.map((p) => {
              const active = p.id === periodo;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodo(p.id)}
                  className="flex-1 rounded-full px-3 py-1.5 text-[11.5px] font-semibold tracking-tight transition-all"
                  style={{
                    background: active
                      ? "linear-gradient(135deg, #00B388, #00875F)"
                      : "transparent",
                    color: active ? "#fff" : "#7A8896",
                    boxShadow: active ? "0 2px 8px rgba(0,179,136,0.32)" : "none",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* HERO STATS — hero card minimalista enterprise */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 0.7, 0.2, 1] }}
          className="relative overflow-hidden rounded-[26px] p-5 text-white"
          style={{
            background:
              "linear-gradient(135deg, #042F2E 0%, #054640 50%, #064E4A 100%)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.08) inset, 0 12px 32px rgba(4,47,46,0.18), 0 4px 10px rgba(4,47,46,0.10)",
          }}
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full blur-[40px]"
            style={{ background: "rgba(0,200,150,0.3)" }}
            animate={{ opacity: [0.55, 0.85, 0.55] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <p className="relative text-[9.5px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#5EFFD9" }}>
            Tempo operacional
          </p>
          <div className="relative mt-1 flex items-end gap-2">
            <span
              className="text-[42px] font-semibold leading-none tracking-[-1px] tabular-nums"
              style={{ textShadow: "0 0 24px rgba(0,200,150,0.25)" }}
            >
              {summary.tempoOperacionalHoras}
            </span>
            <span className="mb-1 text-[14px] font-medium text-white/60">horas</span>
          </div>
          <div className="relative mt-4 grid grid-cols-2 gap-3">
            <MiniMetric
              icon={<Route className="h-3 w-3" />}
              value={`${summary.distanciaPercorridaKm} km`}
              label="Distância"
            />
            <MiniMetric
              icon={<Building2 className="h-3 w-3" />}
              value={`${summary.municipiosAtendidos.length}`}
              label="Municípios"
            />
            <MiniMetric
              icon={<RefreshCcw className="h-3 w-3" />}
              value={`${summary.sincronizacoes}`}
              label="Syncs"
            />
            <MiniMetric
              icon={<TimerReset className="h-3 w-3" />}
              value={`${Math.round(summary.tempoOperacionalHoras / 7)}h/dia`}
              label="Média diária"
            />
          </div>
        </motion.section>

        {/* KPI GRID */}
        <section>
          <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#B0BAC5" }}>
            Indicadores
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {KPIS.map(({ key, label, icon: Icon, hex, pill }, i) => (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i + 0.1 }}
                className="relative overflow-hidden rounded-[20px] p-3.5"
                style={{
                  background: "#fff",
                  boxShadow:
                    "0 1px 3px rgba(6,59,59,0.04), 0 8px 22px rgba(6,59,59,0.06), 0 0 0 1px rgba(6,59,59,0.04)",
                }}
              >
                <div
                  className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full blur-[20px]"
                  style={{ background: pill, opacity: 0.9 }}
                />
                <div
                  className="relative flex h-8 w-8 items-center justify-center rounded-[10px]"
                  style={{ background: pill, color: hex }}
                >
                  <Icon className="h-[14px] w-[14px]" strokeWidth={2.2} />
                </div>
                <p
                  className="relative mt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "#A0ACBA" }}
                >
                  {label}
                </p>
                <div
                  className="relative mt-0.5 text-[24px] font-semibold leading-none tracking-[-0.5px] tabular-nums"
                  style={{ color: "#063B3B" }}
                >
                  {summary[key]}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* MUNICÍPIOS ATENDIDOS */}
        <section>
          <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#B0BAC5" }}>
            Municípios atendidos
          </p>
          <div
            className="flex flex-wrap gap-1.5 rounded-2xl p-3"
            style={{
              background: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(6,59,59,0.06)",
              boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset",
            }}
          >
            {summary.municipiosAtendidos.map((m, i) => (
              <motion.span
                key={m}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.04 * i }}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(0,179,136,0.10), rgba(0,179,136,0.04))",
                  color: "#00875F",
                  border: "1px solid rgba(0,179,136,0.18)",
                }}
              >
                <MapPin className="h-2.5 w-2.5" />
                {m}
              </motion.span>
            ))}
          </div>
        </section>

        {/* TIMELINE */}
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#B0BAC5" }}>
              Timeline operacional
            </p>
            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: "#A0ACBA" }}>
              <Sparkles className="h-3 w-3" /> {summary.timeline.length} eventos
            </span>
          </div>
          <div className="space-y-4">
            {groupedByDay.map(([dia, events]) => (
              <div key={dia}>
                <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#7A8896" }}>
                  {dia}
                </p>
                <ol className="relative space-y-2">
                  {/* linha vertical da timeline */}
                  <span
                    aria-hidden
                    className="absolute left-[14px] top-2 bottom-2 w-px"
                    style={{ background: "rgba(6,59,59,0.06)" }}
                  />
                  {events.map((e, i) => {
                    const Icon = TIPO_ICON[e.tipo];
                    const { bg, fg } = TIPO_COLOR[e.tipo];
                    return (
                      <motion.li
                        key={e.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.04 * i + 0.05 }}
                        className="relative flex gap-3 rounded-2xl p-3"
                        style={{
                          background: "rgba(255,255,255,0.9)",
                          border: "1px solid rgba(6,59,59,0.05)",
                          boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
                        }}
                      >
                        <span
                          className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px]"
                          style={{ background: bg, color: fg }}
                        >
                          <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="rounded-full px-1.5 py-[2px] text-[8.5px] font-bold uppercase tracking-[0.1em]"
                              style={{ background: bg, color: fg }}
                            >
                              {TIPO_LABEL[e.tipo]}
                            </span>
                            <span className="text-[10px] font-medium" style={{ color: "#A0ACBA" }}>
                              {relativo(e.timestamp)} · {fmtDataHora(e.timestamp).split(" · ")[1]}
                            </span>
                          </div>
                          <p
                            className="mt-1 text-[13px] font-semibold leading-tight tracking-tight"
                            style={{ color: "#063B3B" }}
                          >
                            {e.titulo}
                          </p>
                          {(e.equipamento || e.municipio) && (
                            <p className="mt-0.5 text-[10.5px] font-medium" style={{ color: "#7A8896" }}>
                              {e.equipamento ? <span>{e.equipamento}</span> : null}
                              {e.equipamento && e.municipio ? " · " : null}
                              {e.municipio ? <span>{e.municipio}</span> : null}
                              {e.glpiId ? <span> · {e.glpiId}</span> : null}
                            </p>
                          )}
                          {e.descricao && (
                            <p className="mt-1 text-[11px] leading-snug" style={{ color: "#566773" }}>
                              {e.descricao}
                            </p>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </section>

        {/* nota: dados mock */}
        <p className="mt-2 flex items-center gap-1.5 text-center text-[10.5px] font-medium" style={{ color: "#A0ACBA" }}>
          <Clock className="h-3 w-3" />
          Histórico atual baseado em dados mock — endpoint real em breve.
        </p>
      </main>

      <BottomNav />
    </div>
  );
}

/* ── sub-componente ─────────────────────────────────────────────────── */

function MiniMetric({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-[14px] p-2.5"
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-[9px]"
        style={{ background: "rgba(0,200,150,0.18)", color: "#5EFFD9" }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[8.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.5)" }}>
          {label}
        </p>
        <p className="text-[13px] font-semibold tracking-tight tabular-nums text-white leading-none">
          {value}
        </p>
      </div>
    </div>
  );
}
