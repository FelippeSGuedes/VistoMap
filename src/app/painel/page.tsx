"use client";

/**
 * /painel — overview da central operacional.
 *
 * Dados 100% reais via /api/painel/*: stats, tecnicos, revisitas, audit,
 * historico (30d), fila. Sem mocks.
 *
 * Auto-refresh 20s — sistema vivo.
 */

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Map as MapIcon,
  RotateCw,
  ShieldAlert,
  Sparkle,
  Timer,
  UserPlus,
} from "lucide-react";
import { painelService } from "@/services/painel";
import type {
  AuditEntry,
  PainelStats,
  RevisitaPendente,
  TecnicoAtivo,
} from "@/types";
import type { HistoricoAnalytics } from "@/services/painel";
import {
  AreaChart,
  BarRanking,
  CalendarHeatmap,
  ConversionFunnel,
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

function fmtNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",") + "k";
  return String(n);
}

function diaCurto(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function initials(nome: string): string {
  const p = nome.trim().split(/[\s._-]+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

export default function PainelOverviewPage() {
  const [stats, setStats] = useState<PainelStats | null>(null);
  const [tecnicos, setTecnicos] = useState<TecnicoAtivo[]>([]);
  const [revisitas, setRevisitas] = useState<RevisitaPendente[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [historico, setHistorico] = useState<HistoricoAnalytics | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [s, t, r, a, h] = await Promise.all([
        painelService.fetchStats(),
        painelService.fetchTecnicos(),
        painelService.fetchRevisitas(),
        painelService.fetchAudit({ limit: 8 }),
        painelService.fetchHistorico(30),
      ]);
      if (!alive) return;
      setStats(s);
      setTecnicos(t);
      setRevisitas(r);
      setAudit(a);
      setHistorico(h);
      setNow(new Date());
    };
    load();
    const id = window.setInterval(load, 20000);
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, []);

  /* ── Derived data ─────────────────────────────────────────────── */

  const emCampo = useMemo(
    () => tecnicos.filter((t) => t.status === "em-campo").length,
    [tecnicos]
  );

  const funnelStages = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Pendentes",   value: stats.pendentes,          color: "#F59E0B" },
      { label: "Em Vistoria", value: stats.emVistoria,         color: "#3B82F6" },
      { label: "Vistoriadas", value: stats.vistoriadas,        color: "#00B388" },
      { label: "Revisitas",   value: stats.aguardandoRevisita + stats.emRevisita, color: "#F97316" },
    ];
  }, [stats]);

  const heatmapData = useMemo(() => {
    if (!historico) return [];
    return historico.serieDiaria.map((d) => ({
      date: d.dia,
      value: d.finalizadas,
    }));
  }, [historico]);

  const velocity14d = useMemo(() => {
    if (!historico) return { values: [], labels: [], avg: 0, peak: 0 };
    const last14 = historico.serieDiaria.slice(-14);
    const values = last14.map((d) => d.finalizadas);
    const labels = last14.map((d) => diaCurto(d.dia));
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const peak = Math.max(...values, 0);
    return { values, labels, avg, peak };
  }, [historico]);

  const taxaAprovacao = historico?.taxas.aprovacaoPct ?? 0;
  const taxaRevisita = historico?.taxas.revisitaPct ?? 0;

  const topMunicipios = (historico?.topMunicipios ?? []).slice(0, 5);
  const topTecnicos = (historico?.rankingTecnicos ?? []).slice(0, 5);

  const tecnicosEmCampo = useMemo(
    () => tecnicos.filter((t) => t.status === "em-campo" || t.status === "base").slice(0, 6),
    [tecnicos]
  );

  const total = stats
    ? stats.pendentes + stats.emVistoria + stats.vistoriadas + stats.aguardandoRevisita + stats.emRevisita
    : 0;

  return (
    <div className="space-y-5">
      {/* ─────────── HERO BANNER ─────────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-[24px]"
        style={{
          background:
            "linear-gradient(135deg, #053a32 0%, #075744 36%, #00875F 70%, #00B388 100%)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.16) inset, 0 24px 60px -16px rgba(0,135,95,0.4), 0 8px 24px rgba(6,59,59,0.18)",
        }}
      >
        {/* ambient glow + grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-20 h-80 w-80 rounded-full blur-[80px]"
          style={{ background: "rgba(0,255,200,0.25)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full blur-[80px]"
          style={{ background: "rgba(0,180,140,0.18)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative grid grid-cols-12 gap-6 px-6 py-7">
          <div className="col-span-7 flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                </span>
                <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-white">
                  Sistema em operação · atualiza 20s
                </span>
              </span>
              <span className="text-[10.5px] font-semibold tabular-nums text-white/60">
                {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>

            <div className="mt-5">
              <h1 className="text-[36px] font-semibold leading-[1.05] tracking-[-0.8px] text-white">
                Operação em<br />
                <span style={{ color: "#9EF8DC" }}>movimento.</span>
              </h1>
              <p className="mt-2.5 max-w-md text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>
                {stats ? (
                  <>
                    <span className="font-semibold text-white">{stats.pendentes + stats.emVistoria}</span>{" "}
                    vistorias na fila ·{" "}
                    <span className="font-semibold text-white">{emCampo}</span> técnico
                    {emCampo === 1 ? "" : "s"} em campo agora ·{" "}
                    <span className="font-semibold text-white">{stats.municipiosAtivos}</span> município
                    {stats.municipiosAtivos === 1 ? "" : "s"} ativos.
                  </>
                ) : (
                  "Carregando estado da rede…"
                )}
              </p>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <Link
                href="/painel/vistorias"
                className="inline-flex h-10 items-center gap-2 rounded-[12px] px-4 text-[13px] font-semibold tracking-[-0.1px] transition active:scale-[0.985]"
                style={{
                  background: "#fff",
                  color: "#053a32",
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 22px rgba(0,0,0,0.18)",
                }}
              >
                <UserPlus className="h-3.5 w-3.5" strokeWidth={2.4} />
                Atribuir vistorias
              </Link>
              <Link
                href="/painel/mapa"
                className="inline-flex h-10 items-center gap-2 rounded-[12px] px-4 text-[13px] font-semibold text-white transition hover:bg-white/[0.12]"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                <MapIcon className="h-3.5 w-3.5" strokeWidth={2.2} />
                Mapa em tempo real
              </Link>
            </div>
          </div>

          {/* Big metric stack à direita */}
          <div className="col-span-5">
            <div className="grid grid-cols-2 gap-3">
              <HeroMetric
                label="Backlog total"
                value={stats ? fmtNum(stats.pendentes) : "—"}
                hint="aguardando atribuição"
                icon={ClipboardList}
              />
              <HeroMetric
                label="Em vistoria"
                value={stats ? fmtNum(stats.emVistoria) : "—"}
                hint="em execução agora"
                icon={Activity}
                accent
              />
              <HeroMetric
                label="Concluídas"
                value={stats ? fmtNum(stats.vistoriadas) : "—"}
                hint="aguardando aprovação"
                icon={CheckCircle2}
              />
              <HeroMetric
                label="Revisitas"
                value={stats ? fmtNum(stats.aguardandoRevisita + stats.emRevisita) : "—"}
                hint={`${stats?.aguardandoRevisita ?? 0} sem técnico`}
                icon={RotateCw}
              />
            </div>
          </div>
        </div>

        {revisitas.some((r) => r.prioridade === "CRITICA" || r.prioridade === "ALTA") && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mx-6 mb-5 flex items-center gap-2.5 rounded-[12px] px-3.5 py-2.5"
            style={{
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.18)",
              backdropFilter: "blur(10px)",
            }}
          >
            <ShieldAlert className="h-4 w-4 text-amber-200" strokeWidth={2.2} />
            <p className="text-[11.5px] font-semibold text-white">
              {revisitas.filter((r) => r.prioridade === "CRITICA").length} crítica(s) +{" "}
              {revisitas.filter((r) => r.prioridade === "ALTA").length} alta(s) aguardando atribuição
            </p>
            <Link
              href="/painel/revisitas"
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] transition hover:opacity-90"
              style={{ background: "#FBBF24", color: "#78350F" }}
            >
              Tratar agora
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.6} />
            </Link>
          </motion.div>
        )}
      </motion.section>

      {/* ─────────── FUNIL OPERACIONAL ─────────── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-[20px] p-5"
        style={{
          background: "#fff",
          border: "1px solid rgba(6,59,59,0.05)",
          boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 12px 28px rgba(6,59,59,0.06)",
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: "#00B388" }}>
              Funil operacional
            </p>
            <h3 className="mt-0.5 text-[16px] font-semibold tracking-[-0.3px]" style={{ color: "#063B3B" }}>
              Distribuição da rede · {total.toLocaleString("pt-BR")} equipamentos
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[10.5px]" style={{ color: "#566773" }}>
            <span className="flex items-center gap-1.5">
              <Timer className="h-3 w-3" style={{ color: "#00B388" }} strokeWidth={2.2} />
              Lead time médio:{" "}
              <span className="font-semibold tabular-nums" style={{ color: "#063B3B" }}>
                {historico ? Math.round((historico.medias.semanalVistorias > 0 ? 7 / Math.max(historico.medias.diariaVistorias, 0.1) : 0) * 10) / 10 : 0}d
              </span>
            </span>
          </div>
        </div>
        <div className="mt-4">
          {stats && funnelStages.length > 0 && (
            <ConversionFunnel
              stages={funnelStages.map((s) => ({
                label: s.label,
                value: s.value,
                color: s.color,
              }))}
            />
          )}
        </div>
      </motion.section>

      {/* ─────────── VELOCITY + HEATMAP + GAUGES ─────────── */}
      <section className="grid grid-cols-12 gap-3">
        {/* Velocity 14d */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="col-span-7 overflow-hidden rounded-[20px] p-5"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.05)",
            boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 12px 28px rgba(6,59,59,0.06)",
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: "#00B388" }}>
                Velocity · 14 dias
              </p>
              <h3 className="mt-0.5 text-[16px] font-semibold tracking-[-0.3px]" style={{ color: "#063B3B" }}>
                Vistorias finalizadas por dia
              </h3>
            </div>
            <div className="flex items-center gap-4 text-[10.5px]" style={{ color: "#566773" }}>
              <span>
                Média/dia:{" "}
                <span className="font-semibold tabular-nums" style={{ color: "#063B3B" }}>
                  {velocity14d.avg.toFixed(1).replace(".", ",")}
                </span>
              </span>
              <span>
                Pico:{" "}
                <span className="font-semibold tabular-nums" style={{ color: "#00B388" }}>
                  {velocity14d.peak}
                </span>
              </span>
            </div>
          </div>
          <div className="relative mt-3 h-[210px]">
            {velocity14d.values.length > 0 && (
              <AreaChart
                data={velocity14d.values}
                labels={velocity14d.labels}
                color="#00B388"
                height={210}
                showAxis
              />
            )}
            {/* avg line overlay */}
            {velocity14d.values.length > 0 && velocity14d.avg > 0 && (
              <div
                className="pointer-events-none absolute left-2 right-2 border-t border-dashed"
                style={{
                  borderColor: "rgba(245,158,11,0.5)",
                  top: `${12 + (1 - velocity14d.avg / Math.max(velocity14d.peak, 1)) * (210 - 24)}px`,
                }}
              >
                <span
                  className="absolute -top-3 right-0 rounded-md px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-[0.1em]"
                  style={{ background: "#FEF3C7", color: "#92400E" }}
                >
                  Média
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Gauges quality */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
          className="col-span-5 grid grid-cols-2 gap-3"
        >
          <div
            className="overflow-hidden rounded-[20px] p-4"
            style={{
              background:
                "linear-gradient(140deg, rgba(0,179,136,0.12), rgba(0,179,136,0.02))",
              border: "1px solid rgba(0,179,136,0.20)",
              boxShadow: "0 1px 3px rgba(0,179,136,0.04), 0 8px 22px rgba(0,179,136,0.08)",
            }}
          >
            <p className="text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: "#00875F" }}>
              Taxa de aprovação
            </p>
            <div className="mt-1 h-[130px]">
              <GaugeRate value={taxaAprovacao} label="aprovação" color="#00B388" />
            </div>
            <p className="mt-1 text-center text-[10px]" style={{ color: "#566773" }}>
              {historico?.totais.aprovadas ?? 0} aprovadas em {historico?.totais.vistoriasFinalizadas ?? 0}
            </p>
          </div>

          <div
            className="overflow-hidden rounded-[20px] p-4"
            style={{
              background: "linear-gradient(140deg, rgba(245,158,11,0.10), rgba(245,158,11,0.02))",
              border: "1px solid rgba(245,158,11,0.22)",
              boxShadow: "0 1px 3px rgba(245,158,11,0.04), 0 8px 22px rgba(245,158,11,0.08)",
            }}
          >
            <p className="text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: "#92400E" }}>
              Taxa de revisita
            </p>
            <div className="mt-1 h-[130px]">
              <GaugeRate value={taxaRevisita} label="revisita" color="#F59E0B" />
            </div>
            <p className="mt-1 text-center text-[10px]" style={{ color: "#854D0E" }}>
              {historico?.totais.reprovadas ?? 0} reprovadas em 30 dias
            </p>
          </div>
        </motion.div>
      </section>

      {/* ─────────── HEATMAP CALENDÁRIO ─────────── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
        className="rounded-[20px] p-5"
        style={{
          background: "#fff",
          border: "1px solid rgba(6,59,59,0.05)",
          boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 12px 28px rgba(6,59,59,0.06)",
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: "#00B388" }}>
              Atividade · 30 dias
            </p>
            <h3 className="mt-0.5 text-[16px] font-semibold tracking-[-0.3px]" style={{ color: "#063B3B" }}>
              Padrão diário da operação
            </h3>
          </div>
          <div className="flex items-center gap-2 text-[10px]" style={{ color: "#7A8896" }}>
            <span>menos</span>
            {[0.18, 0.36, 0.55, 0.74, 0.92].map((o) => (
              <span
                key={o}
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ background: "#00B388", opacity: o }}
              />
            ))}
            <span>mais</span>
          </div>
        </div>
        <div className="mt-3 h-[120px]">
          {heatmapData.length > 0 && <CalendarHeatmap data={heatmapData} color="#00B388" />}
        </div>
        <div className="mt-2 flex items-center gap-5 text-[11px]" style={{ color: "#566773" }}>
          <span>
            Finalizadas no período:{" "}
            <span className="font-semibold tabular-nums" style={{ color: "#063B3B" }}>
              {historico?.totais.vistoriasFinalizadas ?? 0}
            </span>
          </span>
          <span>
            Média semanal:{" "}
            <span className="font-semibold tabular-nums" style={{ color: "#063B3B" }}>
              {(historico?.medias.semanalVistorias ?? 0).toFixed(1).replace(".", ",")}
            </span>
          </span>
          <span>
            Km percorridos:{" "}
            <span className="font-semibold tabular-nums" style={{ color: "#063B3B" }}>
              {(historico?.kmOperacional ?? 0).toFixed(0)}
            </span>
          </span>
        </div>
      </motion.section>

      {/* ─────────── RANKINGS + ATIVIDADES ─────────── */}
      <section className="grid grid-cols-12 gap-3">
        {/* Top municípios */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
          className="col-span-4 overflow-hidden rounded-[20px] p-5"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.05)",
            boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 12px 28px rgba(6,59,59,0.06)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: "#00B388" }}>
                Top municípios
              </p>
              <h3 className="mt-0.5 text-[14px] font-semibold tracking-[-0.2px]" style={{ color: "#063B3B" }}>
                Maior volume operacional
              </h3>
            </div>
            <Building2 className="h-4 w-4" style={{ color: "#A0ACBA" }} strokeWidth={1.8} />
          </div>
          <div className="mt-4">
            {topMunicipios.length > 0 ? (
              <BarRanking
                items={topMunicipios.map((m, i) => ({
                  label: m.municipio,
                  value: m.total,
                  color: i === 0 ? "#00B388" : i === 1 ? "#0EA5E9" : i === 2 ? "#6366F1" : "#94A3B8",
                }))}
                height={210}
              />
            ) : (
              <EmptyState text="Sem dados de municípios no período." />
            )}
          </div>
        </motion.div>

        {/* Top técnicos */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36 }}
          className="col-span-4 overflow-hidden rounded-[20px] p-5"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.05)",
            boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 12px 28px rgba(6,59,59,0.06)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: "#00B388" }}>
                Top técnicos
              </p>
              <h3 className="mt-0.5 text-[14px] font-semibold tracking-[-0.2px]" style={{ color: "#063B3B" }}>
                Produtividade · 30 dias
              </h3>
            </div>
            <Link href="/painel/tecnicos" className="text-[10.5px] font-semibold" style={{ color: "#00B388" }}>
              Equipe
            </Link>
          </div>
          <div className="mt-4">
            {topTecnicos.length > 0 ? (
              <BarRanking
                items={topTecnicos.map((t, i) => ({
                  label: t.nome,
                  value: t.total,
                  color: i === 0 ? "#00B388" : i === 1 ? "#0EA5E9" : i === 2 ? "#6366F1" : "#94A3B8",
                }))}
                formatValue={(v) => `${v} v.`}
                height={210}
              />
            ) : (
              <EmptyState text="Sem técnicos com finalizadas no período." />
            )}
          </div>
        </motion.div>

        {/* Equipe em campo */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="col-span-4 overflow-hidden rounded-[20px]"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.05)",
            boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 12px 28px rgba(6,59,59,0.06)",
          }}
        >
          <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "rgba(6,59,59,0.05)" }}>
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: "#00B388" }}>
                Equipe · ao vivo
              </p>
              <h3 className="mt-0.5 text-[14px] font-semibold tracking-[-0.2px]" style={{ color: "#063B3B" }}>
                Técnicos em operação
              </h3>
            </div>
            <Link href="/painel/mapa" className="inline-flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: "#00B388" }}>
              Mapa
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
            </Link>
          </div>
          <ul>
            {tecnicosEmCampo.length === 0 && (
              <li className="px-5 py-6 text-center text-[12px]" style={{ color: "#A0ACBA" }}>
                Nenhum técnico ativo agora.
              </li>
            )}
            {tecnicosEmCampo.map((t) => {
              const dot = t.status === "em-campo" ? "#00B388" : "#6366F1";
              return (
                <li key={t.id} className="flex items-center gap-3 border-b px-5 py-2.5 last:border-0" style={{ borderColor: "rgba(6,59,59,0.04)" }}>
                  <div className="relative">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                      style={{
                        background: "linear-gradient(145deg, #00B388 0%, #00875F 100%)",
                        boxShadow: "0 4px 10px rgba(0,179,136,0.24)",
                      }}
                    >
                      {initials(t.nome)}
                    </span>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full"
                      style={{
                        background: dot,
                        boxShadow: `0 0 0 2px #fff, 0 0 6px ${dot}88`,
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold tracking-tight" style={{ color: "#063B3B" }}>
                      {t.nome}
                    </p>
                    <p className="truncate text-[10.5px]" style={{ color: "#7A8896" }}>
                      {t.municipio ?? "—"} · {t.atribuidas} ativ · {t.concluidasHoje} hoje
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2 py-[2px] text-[8.5px] font-bold uppercase tracking-[0.1em]"
                    style={{
                      background: t.status === "em-campo" ? "rgba(0,179,136,0.12)" : "rgba(99,102,241,0.12)",
                      color: t.status === "em-campo" ? "#00875F" : "#4338CA",
                    }}
                  >
                    {t.status === "em-campo" ? "Em campo" : "Base"}
                  </span>
                </li>
              );
            })}
          </ul>
        </motion.div>
      </section>

      {/* ─────────── ATIVIDADES + REVISITAS ─────────── */}
      <section className="grid grid-cols-12 gap-3">
        {/* Live activity */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.44 }}
          className="col-span-7 overflow-hidden rounded-[20px]"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.05)",
            boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 12px 28px rgba(6,59,59,0.06)",
          }}
        >
          <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "rgba(6,59,59,0.05)" }}>
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: "#00B388" }}>
                Atividade ao vivo
              </p>
              <h3 className="mt-0.5 text-[14px] font-semibold tracking-[-0.2px]" style={{ color: "#063B3B" }}>
                Eventos operacionais
              </h3>
            </div>
            <Link href="/painel/auditoria" className="inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: "#00B388" }}>
              Auditoria completa
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
            </Link>
          </div>
          <ul className="divide-y" style={{ borderColor: "rgba(6,59,59,0.04)" }}>
            {audit.length === 0 && (
              <li className="px-5 py-8 text-center text-[12px]" style={{ color: "#A0ACBA" }}>
                Sem eventos recentes.
              </li>
            )}
            {audit.slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
                  style={{
                    background:
                      e.ator.role === "admin" ? "rgba(99,102,241,0.10)" : "rgba(0,179,136,0.10)",
                    color: e.ator.role === "admin" ? "#4338CA" : "#00875F",
                  }}
                >
                  <Activity className="h-3.5 w-3.5" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] tracking-tight" style={{ color: "#063B3B" }}>
                    <span className="font-semibold">{e.ator.nome}</span>{" "}
                    <span style={{ color: "#A0ACBA" }}>·</span>{" "}
                    <span style={{ color: "#566773" }}>{e.acao.replace(/[-_]/g, " ")}</span>
                    {e.alvo && (
                      <>
                        {" "}
                        <span style={{ color: "#A0ACBA" }}>·</span>{" "}
                        <span style={{ color: "#00B388", fontWeight: 600 }}>{e.alvo.label}</span>
                      </>
                    )}
                  </p>
                  {e.descricao && (
                    <p className="mt-0.5 line-clamp-1 text-[10.5px]" style={{ color: "#7A8896" }}>
                      {e.descricao}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[10px] font-medium tabular-nums" style={{ color: "#A0ACBA" }}>
                  {relativo(e.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Revisitas pendentes */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.48 }}
          className="col-span-5 overflow-hidden rounded-[20px]"
          style={{
            background: "linear-gradient(135deg, #FFFBEB, #FEF3C7)",
            border: "1px solid rgba(245,158,11,0.22)",
            boxShadow: "0 1px 3px rgba(245,158,11,0.06), 0 12px 28px rgba(245,158,11,0.10)",
          }}
        >
          <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "rgba(245,158,11,0.18)" }}>
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-[10px] text-white"
                style={{ background: "linear-gradient(145deg, #F59E0B 0%, #D97706 100%)" }}
              >
                <RotateCw className="h-3.5 w-3.5" strokeWidth={2.4} />
              </span>
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: "#92400E" }}>
                  Aguardando revisita
                </p>
                <h3 className="text-[14px] font-semibold tracking-[-0.2px]" style={{ color: "#7C2D12" }}>
                  {revisitas.length} caso(s) pendente(s)
                </h3>
              </div>
            </div>
            <Link href="/painel/revisitas" className="inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: "#C2410C" }}>
              Central
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
            </Link>
          </div>
          <ul className="divide-y" style={{ borderColor: "rgba(245,158,11,0.16)" }}>
            {revisitas.length === 0 ? (
              <li className="px-5 py-8 text-center text-[12px]" style={{ color: "#A16207" }}>
                Sem revisitas pendentes. Operação em dia.
              </li>
            ) : (
              revisitas.slice(0, 4).map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
                    style={{ background: "rgba(245,158,11,0.18)", color: "#C2410C" }}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold tracking-tight" style={{ color: "#7C2D12" }}>
                      {r.equipamento}{" "}
                      <span className="font-normal" style={{ color: "#A16207" }}>· {r.municipio}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug" style={{ color: "#854D0E" }}>
                      {r.motivoReprovacao}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-medium tabular-nums" style={{ color: "#C2410C" }}>
                    {relativo(r.reprovadoEm)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </motion.div>
      </section>

      {/* footer */}
      <div className="flex items-center justify-center gap-1.5 pb-2 text-[10.5px]" style={{ color: "#A0ACBA" }}>
        <Sparkle className="h-3 w-3" style={{ color: "#00B388" }} />
        <span>
          Dados via GLPI · {historico?.totais.pdfsGerados ?? 0} PDFs gerados nos últimos {historico?.periodo.dias ?? 30} dias.
        </span>
      </div>
    </div>
  );
}

/* ─────────── Sub-componentes ─────────── */

function HeroMetric({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Activity;
  accent?: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[14px] p-3"
      style={{
        background: accent
          ? "rgba(255,255,255,0.18)"
          : "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.16)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[8.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "rgba(255,255,255,0.65)" }}>
          {label}
        </span>
        <Icon className="h-3 w-3" style={{ color: "rgba(255,255,255,0.5)" }} strokeWidth={2.2} />
      </div>
      <div className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.5px] tabular-nums text-white">
        {value}
      </div>
      <p className="mt-0.5 text-[9.5px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
        {hint}
      </p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      className="flex h-[210px] items-center justify-center rounded-xl"
      style={{ background: "rgba(6,59,59,0.025)", color: "#A0ACBA" }}
    >
      <p className="text-[11.5px]">{text}</p>
    </div>
  );
}
