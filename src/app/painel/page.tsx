"use client";

/**
 * /painel — overview da central operacional admin.
 *
 * Identidade visual ALINHADA ao app mobile: branco gelo, esmeralda,
 * cards refinados, glassmorphism suave. Sem dark/cyber.
 *
 * Dados reais via /api/painel/* (com fallback mock em dev).
 * Auto-refresh a cada 15s — sensação de "sistema vivo".
 */

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  RotateCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { painelService } from "@/services/painel";
import { MOCK_ATRIBUICOES_RECENTES, MOCK_AUDIT } from "@/utils/painelMock";
import type {
  PainelStats,
  RevisitaPendente,
  TecnicoAtivo,
} from "@/types";
import {
  AreaChart,
  BarRanking,
  DonutChart,
  GaugeRate,
} from "@/components/painel/Charts";

function relativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const w = 100;
  const h = 26;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
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
  const dFill = `${d} L${w},${h} L0,${h} Z`;
  const gid = `pgrad-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={dFill} fill={`url(#${gid})`} />
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.0, ease: "easeOut" }}
      />
    </svg>
  );
}

const KPIS: Array<{
  key: keyof Pick<
    PainelStats,
    | "pendentes"
    | "emVistoria"
    | "vistoriadas"
    | "aguardandoRevisita"
    | "tecnicosAtivos"
    | "municipiosAtivos"
  >;
  label: string;
  icon: typeof Activity;
  hex: string;
  pill: string;
  grad: string;
  trendKey?: "pendentes" | "vistoriadas" | "revisitas";
}> = [
  { key: "pendentes",          label: "Pendentes",            icon: ClipboardList, hex: "#F59E0B", pill: "#FEF3C7", grad: "from-amber-500 to-orange-500", trendKey: "pendentes" },
  { key: "emVistoria",         label: "Em Vistoria",          icon: Activity,      hex: "#3B82F6", pill: "#EFF6FF", grad: "from-blue-500 to-indigo-500" },
  { key: "vistoriadas",        label: "Vistoriadas",          icon: CheckCircle2,  hex: "#00B388", pill: "#ECFDF5", grad: "from-emerald-500 to-teal-500", trendKey: "vistoriadas" },
  { key: "aguardandoRevisita", label: "Aguardando Revisita",  icon: RotateCw,      hex: "#F97316", pill: "#FFF7ED", grad: "from-amber-500 to-orange-600", trendKey: "revisitas" },
  { key: "tecnicosAtivos",     label: "Técnicos Ativos",      icon: Users,         hex: "#6366F1", pill: "#EEF2FF", grad: "from-indigo-500 to-violet-500" },
  { key: "municipiosAtivos",   label: "Municípios",           icon: Building2,     hex: "#0EA5E9", pill: "#E0F2FE", grad: "from-sky-500 to-cyan-500" },
];

export default function PainelOverviewPage() {
  const [stats, setStats] = useState<PainelStats | null>(null);
  const [tecnicos, setTecnicos] = useState<TecnicoAtivo[]>([]);
  const [revisitas, setRevisitas] = useState<RevisitaPendente[]>([]);

  // Carga inicial + polling 15s — "sistema vivo".
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [s, t, r] = await Promise.all([
        painelService.fetchStats(),
        painelService.fetchTecnicos(),
        painelService.fetchRevisitas(),
      ]);
      if (!alive) return;
      setStats(s);
      setTecnicos(t);
      setRevisitas(r);
    };
    load();
    const id = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const filaRecente = useMemo(() => MOCK_ATRIBUICOES_RECENTES, []);

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-3"
      >
        {/* Status bar — aparece apenas quando há urgência */}
        {revisitas.some((r) => r.prioridade === "CRITICA" || r.prioridade === "ALTA") && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 rounded-[14px] px-4 py-2.5"
            style={{
              background: "linear-gradient(90deg, #FEF9EE 0%, #FFF7ED 100%)",
              border: "1px solid rgba(245,158,11,0.3)",
              boxShadow: "0 0 0 3px rgba(245,158,11,0.06)",
            }}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            <p className="text-[11.5px] font-semibold" style={{ color: "#92400E" }}>
              {revisitas.filter((r) => r.prioridade === "CRITICA").length > 0
                ? `${revisitas.filter((r) => r.prioridade === "CRITICA").length} revisita(s) CRÍTICA(S) sem atribuição — ação necessária agora.`
                : `${revisitas.filter((r) => r.prioridade === "ALTA").length} revisita(s) de ALTA prioridade aguardando técnico.`}
            </p>
            <Link href="/painel/revisitas"
              className="ml-auto shrink-0 rounded-lg px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] transition hover:opacity-80"
              style={{ background: "#F59E0B", color: "#fff" }}>
              Ver agora
            </Link>
          </motion.div>
        )}

        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.18em]"
                style={{ background: "#ECFDF5", color: "#00875F", border: "1px solid rgba(0,179,136,0.22)" }}>
                <Zap className="h-2.5 w-2.5" /> Ao vivo · atualiza 15s
              </span>
              {stats && (
                <span className="text-[10px]" style={{ color: "#A0ACBA" }}>
                  {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            <h1 className="text-[28px] font-semibold tracking-[-0.5px]" style={{ color: "#063B3B" }}>
              Central Operacional
            </h1>
            <p className="mt-0.5 text-[12.5px]" style={{ color: "#566773" }}>
              Visão geral da rede VistoMap em tempo real.
            </p>
          </div>
          <Link
            href="/painel/vistorias"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold text-white transition active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #00C99B 0%, #00875F 100%)",
              boxShadow: "0 1px 0 rgba(255,255,255,0.25) inset, 0 6px 16px rgba(0,179,136,0.32)",
            }}
          >
            <UserPlus className="h-3.5 w-3.5" strokeWidth={2.2} />
            Atribuir vistorias
          </Link>
        </div>
      </motion.div>

      {/* KPI GRID */}
      <section className="grid grid-cols-6 gap-3">
        {KPIS.map(({ key, label, icon: Icon, hex, pill, grad, trendKey }, i) => {
          const value = stats ? stats[key] : null;
          const series = trendKey ? stats?.trend14d?.[trendKey] : undefined;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i + 0.1 }}
              className="group relative overflow-hidden rounded-[18px] p-3.5"
              style={{
                background: "#fff",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 3px rgba(6,59,59,0.04), 0 8px 22px rgba(6,59,59,0.07)",
                border: "1px solid rgba(6,59,59,0.05)",
              }}
            >
              <div
                className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-[24px]"
                style={{ background: pill, opacity: 0.9 }}
              />
              <div
                className={`relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br ${grad}`}
                style={{ boxShadow: `0 4px 12px ${hex}33` }}
              >
                <Icon className="h-[14px] w-[14px] text-white" strokeWidth={2.2} />
              </div>
              <p
                className="relative mt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "#A0ACBA" }}
              >
                {label}
              </p>
              <div
                className="relative mt-0.5 text-[22px] font-semibold leading-none tracking-[-0.4px] tabular-nums"
                style={{ color: "#063B3B" }}
              >
                {value ?? "—"}
              </div>
              {series && (
                <div className="relative mt-2 h-6 opacity-90">
                  <Sparkline data={series} color={hex} />
                </div>
              )}
            </motion.div>
          );
        })}
      </section>

      {/* INSIGHTS — donut + área grande + taxa */}
      <section className="grid grid-cols-12 gap-3">
        {/* Donut distribuição da operação */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="col-span-4 overflow-hidden rounded-[20px] p-5"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.05)",
            boxShadow:
              "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.06)",
          }}
        >
          <p
            className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#00B388" }}
          >
            Distribuição da operação
          </p>
          <h3
            className="mt-0.5 text-[15px] font-semibold tracking-[-0.2px]"
            style={{ color: "#063B3B" }}
          >
            Por status
          </h3>
          <div className="mt-2 h-[180px]">
            {stats && (
              <DonutChart
                centerLabel="Total"
                centerValue={
                  stats.pendentes +
                  stats.emVistoria +
                  stats.vistoriadas +
                  stats.aguardandoRevisita
                }
                segments={[
                  { label: "Pendentes",   value: stats.pendentes,          color: "#F59E0B" },
                  { label: "Em Vistoria", value: stats.emVistoria,         color: "#3B82F6" },
                  { label: "Vistoriadas", value: stats.vistoriadas,        color: "#00B388" },
                  { label: "Aguardando",  value: stats.aguardandoRevisita, color: "#F97316" },
                ]}
              />
            )}
          </div>
          {stats && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <Legend color="#F59E0B" label={`Pendentes · ${stats.pendentes}`} />
              <Legend color="#3B82F6" label={`Em Vistoria · ${stats.emVistoria}`} />
              <Legend color="#00B388" label={`Vistoriadas · ${stats.vistoriadas}`} />
              <Legend color="#F97316" label={`Aguardando · ${stats.aguardandoRevisita}`} />
            </div>
          )}
        </motion.div>

        {/* Série temporal grande */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="col-span-5 overflow-hidden rounded-[20px] p-5"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.05)",
            boxShadow:
              "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.06)",
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p
                className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
                style={{ color: "#00B388" }}
              >
                Operação · 14 dias
              </p>
              <h3
                className="mt-0.5 text-[15px] font-semibold tracking-[-0.2px]"
                style={{ color: "#063B3B" }}
              >
                Vistorias concluídas por dia
              </h3>
            </div>
            <Link
              href="/painel/historico"
              className="text-[11.5px] font-semibold transition hover:opacity-80"
              style={{ color: "#00B388" }}
            >
              Analytics
            </Link>
          </div>
          <div className="mt-3 h-[180px]">
            {stats?.trend14d?.vistoriadas && (
              <AreaChart
                data={stats.trend14d.vistoriadas}
                color="#00B388"
                height={180}
                showAxis
              />
            )}
          </div>
        </motion.div>

        {/* Taxa de aprovação gauge */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
          className="col-span-3 overflow-hidden rounded-[20px] p-5"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,179,136,0.10), rgba(0,179,136,0.02))",
            border: "1px solid rgba(0,179,136,0.22)",
            boxShadow:
              "0 1px 3px rgba(0,179,136,0.04), 0 8px 24px rgba(0,179,136,0.08)",
          }}
        >
          <p
            className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#00875F" }}
          >
            Qualidade
          </p>
          <h3
            className="mt-0.5 text-[15px] font-semibold tracking-[-0.2px]"
            style={{ color: "#063B3B" }}
          >
            Taxa de aprovação
          </h3>
          <div className="mt-2 h-[150px]">
            <GaugeRate
              value={(() => {
                if (!stats) return 0;
                const aprovadas = stats.vistoriadas - stats.aguardandoRevisita - stats.emRevisita;
                const total = stats.vistoriadas + stats.aguardandoRevisita;
                return total > 0 ? (Math.max(0, aprovadas) / total) * 100 : 0;
              })()}
              label="aprovação"
              color="#00B388"
            />
          </div>
          <p className="mt-1 text-center text-[10.5px]" style={{ color: "#566773" }}>
            Sobre {stats?.vistoriadas ?? 0} vistoriadas no período.
          </p>
        </motion.div>
      </section>

      {/* GRID PRINCIPAL */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-7 space-y-3">
          {/* FILA OPERACIONAL */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="overflow-hidden rounded-[20px]"
            style={{
              background: "#fff",
              border: "1px solid rgba(6,59,59,0.05)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.06)",
            }}
          >
            <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "rgba(6,59,59,0.05)" }}>
              <div>
                <p
                  className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: "#00B388" }}
                >
                  Fila Operacional
                </p>
                <h3 className="mt-0.5 text-[15px] font-semibold tracking-[-0.2px]" style={{ color: "#063B3B" }}>
                  Atribuições recentes
                </h3>
              </div>
              <Link
                href="/painel/vistorias"
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold transition hover:opacity-80"
                style={{ color: "#00B388" }}
              >
                Ver fila
                <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
              </Link>
            </div>
            <ul className="divide-y" style={{ borderColor: "rgba(6,59,59,0.04)" }}>
              {filaRecente.map((a) => (
                <li
                  key={a.id}
                  className="group flex items-center gap-3 px-5 py-3 transition hover:bg-brand-emerald/[0.03]"
                  style={{ borderColor: "rgba(6,59,59,0.04)" }}
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                    style={{
                      background: a.isRevisita ? "#FFF7ED" : "#ECFDF5",
                      color: a.isRevisita ? "#F97316" : "#00B388",
                    }}
                  >
                    {a.isRevisita ? (
                      <RotateCw className="h-3.5 w-3.5" strokeWidth={2.4} />
                    ) : (
                      <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={2.4} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[13.5px] font-semibold tracking-tight" style={{ color: "#063B3B" }}>
                        {a.equipamento}
                      </p>
                      {a.isRevisita && (
                        <span
                          className="rounded-full px-1.5 py-[2px] text-[8.5px] font-bold uppercase tracking-[0.1em]"
                          style={{ background: "#FFF7ED", color: "#C2410C" }}
                        >
                          Revisita
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px]" style={{ color: "#7A8896" }}>
                      {a.municipio} · {a.tecnicoNome} · {relativo(a.atribuidoEm)}
                    </p>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 transition group-hover:translate-x-0.5"
                    style={{ color: "#A0ACBA" }}
                    strokeWidth={2.2}
                  />
                </li>
              ))}
            </ul>
          </motion.div>

          {/* TIMELINE MINI */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="overflow-hidden rounded-[20px]"
            style={{
              background: "#fff",
              border: "1px solid rgba(6,59,59,0.05)",
              boxShadow:
                "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.06)",
            }}
          >
            <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "rgba(6,59,59,0.05)" }}>
              <div>
                <p
                  className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: "#00B388" }}
                >
                  Auditoria · Últimas ações
                </p>
                <h3 className="mt-0.5 text-[15px] font-semibold tracking-[-0.2px]" style={{ color: "#063B3B" }}>
                  Timeline operacional
                </h3>
              </div>
              <Link
                href="/painel/auditoria"
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold transition hover:opacity-80"
                style={{ color: "#00B388" }}
              >
                Histórico
                <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
              </Link>
            </div>
            <ul className="divide-y" style={{ borderColor: "rgba(6,59,59,0.04)" }}>
              {MOCK_AUDIT.slice(0, 5).map((e) => (
                <li key={e.id} className="flex gap-3 px-5 py-2.5">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px]"
                    style={{ background: "#ECFDF5", color: "#00B388" }}
                  >
                    <Activity className="h-3 w-3" strokeWidth={2.4} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium tracking-tight" style={{ color: "#063B3B" }}>
                      <span className="font-semibold">{e.ator.nome}</span>{" "}
                      <span style={{ color: "#A0ACBA" }}>·</span>{" "}
                      {e.acao.replace(/-/g, " ")}
                      {e.alvo && (
                        <>
                          {" "}
                          <span style={{ color: "#A0ACBA" }}>·</span>{" "}
                          <span style={{ color: "#00B388" }}>{e.alvo.label}</span>
                        </>
                      )}
                    </p>
                    {e.descricao && (
                      <p className="mt-0.5 truncate text-[10.5px]" style={{ color: "#7A8896" }}>
                        {e.descricao}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] font-medium" style={{ color: "#A0ACBA" }}>
                    {relativo(e.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        <div className="col-span-5 space-y-3">
          {/* TÉCNICOS ATIVOS */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="overflow-hidden rounded-[20px]"
            style={{
              background: "#fff",
              border: "1px solid rgba(6,59,59,0.05)",
              boxShadow:
                "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.06)",
            }}
          >
            <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "rgba(6,59,59,0.05)" }}>
              <div>
                <p
                  className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: "#00B388" }}
                >
                  Equipe · Em campo agora
                </p>
                <h3 className="mt-0.5 text-[15px] font-semibold tracking-[-0.2px]" style={{ color: "#063B3B" }}>
                  Técnicos ativos
                </h3>
              </div>
              <Link
                href="/painel/tecnicos"
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold transition hover:opacity-80"
                style={{ color: "#00B388" }}
              >
                Gestão
                <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
              </Link>
            </div>
            <ul className="divide-y" style={{ borderColor: "rgba(6,59,59,0.04)" }}>
              {tecnicos.slice(0, 5).map((t) => {
                const statusColor =
                  t.status === "em-campo"
                    ? "#00B388"
                    : t.status === "base"
                    ? "#6366F1"
                    : t.status === "off-shift"
                    ? "#9CA3AF"
                    : "#4B5563";
                return (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="relative">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                        style={{
                          background:
                            "linear-gradient(145deg, #00B388 0%, #00875F 100%)",
                          boxShadow: "0 4px 10px rgba(0,179,136,0.28)",
                        }}
                      >
                        {t.nome
                          .split(/[\s._-]+/)
                          .slice(0, 2)
                          .map((s) => s[0])
                          .join("")
                          .toUpperCase()}
                      </span>
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full"
                        style={{
                          background: statusColor,
                          boxShadow: `0 0 0 2px #fff, 0 0 6px ${statusColor}66`,
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold tracking-tight" style={{ color: "#063B3B" }}>
                        {t.nome}
                      </p>
                      <p className="text-[10.5px]" style={{ color: "#7A8896" }}>
                        {t.municipio ?? "—"} · {t.atribuidas} atrib · {t.concluidasHoje} hoje
                      </p>
                    </div>
                    {t.status === "em-campo" && (
                      <span
                        className="rounded-full px-2 py-[2px] text-[8.5px] font-bold uppercase tracking-[0.1em]"
                        style={{
                          background: "rgba(0,179,136,0.12)",
                          color: "#00875F",
                        }}
                      >
                        Em campo
                      </span>
                    )}
                  </li>
                );
              })}
              {tecnicos.length === 0 && (
                <li className="px-5 py-6 text-center text-[12px]" style={{ color: "#A0ACBA" }}>
                  Nenhum técnico ativo no momento.
                </li>
              )}
            </ul>
          </motion.div>

          {/* REVISITAS PENDENTES */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.34 }}
            className="overflow-hidden rounded-[20px]"
            style={{
              background: "linear-gradient(135deg, #FFFBEB, #FEF3C7)",
              border: "1px solid rgba(245,158,11,0.22)",
              boxShadow:
                "0 1px 3px rgba(245,158,11,0.06), 0 8px 24px rgba(245,158,11,0.12)",
            }}
          >
            <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "rgba(245,158,11,0.18)" }}>
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-[9px] text-white"
                  style={{
                    background:
                      "linear-gradient(145deg, #F59E0B 0%, #D97706 100%)",
                  }}
                >
                  <RotateCw className="h-3.5 w-3.5" strokeWidth={2.4} />
                </span>
                <div>
                  <p
                    className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: "#92400E" }}
                  >
                    Atenção
                  </p>
                  <h3 className="text-[15px] font-semibold tracking-[-0.2px]" style={{ color: "#7C2D12" }}>
                    Aguardando revisita ({revisitas.length})
                  </h3>
                </div>
              </div>
              <Link
                href="/painel/revisitas"
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold transition hover:opacity-80"
                style={{ color: "#C2410C" }}
              >
                Central
                <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
              </Link>
            </div>
            <ul className="divide-y" style={{ borderColor: "rgba(245,158,11,0.16)" }}>
              {revisitas.slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-5 py-2.5">
                  <span
                    className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-[8px]"
                    style={{ background: "rgba(245,158,11,0.18)", color: "#C2410C" }}
                  >
                    <ShieldAlert className="h-3 w-3" strokeWidth={2.4} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold tracking-tight" style={{ color: "#7C2D12" }}>
                      {r.equipamento}{" "}
                      <span style={{ color: "#A16207" }}>· {r.municipio}</span>
                    </p>
                    <p className="mt-0.5 text-[10.5px] leading-snug" style={{ color: "#854D0E" }}>
                      {r.motivoReprovacao}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-medium" style={{ color: "#C2410C" }}>
                    {relativo(r.reprovadoEm)}
                  </span>
                </li>
              ))}
              {revisitas.length === 0 && (
                <li className="px-5 py-4 text-center text-[12px]" style={{ color: "#A16207" }}>
                  Sem revisitas pendentes — operação em dia ✨
                </li>
              )}
            </ul>
          </motion.div>

          {/* PDFs HOJE */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex items-center gap-3 rounded-[18px] p-4"
            style={{
              background: "#fff",
              border: "1px solid rgba(6,59,59,0.05)",
              boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 8px 20px rgba(6,59,59,0.05)",
            }}
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-[12px]"
              style={{
                background: "linear-gradient(145deg, #00B388, #00875F)",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(0,179,136,0.32)",
              }}
            >
              <FileText className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <div className="flex-1">
              <p
                className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
                style={{ color: "#A0ACBA" }}
              >
                Worker · PDFs gerados
              </p>
              <p className="mt-0.5 text-[20px] font-semibold leading-none tracking-[-0.3px] tabular-nums" style={{ color: "#063B3B" }}>
                {stats?.pdfsGerados ?? "—"}
              </p>
            </div>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-[0.1em]"
              style={{ background: "#ECFDF5", color: "#00875F" }}
            >
              <TrendingUp className="h-2.5 w-2.5" />
              Pipeline
            </span>
          </motion.div>
        </div>
      </section>

      <p
        className="mt-2 flex items-center justify-center gap-1.5 text-[10.5px] font-medium"
        style={{ color: "#A0ACBA" }}
      >
        <Sparkles className="h-3 w-3" style={{ color: "#00B388" }} />
        Dados ao vivo · atualiza a cada 15s.
      </p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10.5px] font-medium"
      style={{ color: "#566773" }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}aa` }}
      />
      {label}
    </span>
  );
}
