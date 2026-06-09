"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  Map as MapIcon,
  RotateCw,
  ShieldAlert,
  Sparkles,
  Timer,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { painelService } from "@/services/painel";
import type { AuditEntry, PainelStats, RevisitaPendente, TecnicoAtivo } from "@/types";
import type { HistoricoAnalytics } from "@/services/painel";
import {
  AreaChart,
  BarRanking,
  CalendarHeatmap,
  GaugeRate,
} from "@/components/painel/Charts";

/* ── helpers ──────────────────────────────────────────────────────── */

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

function diaCurto(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function initials(nome: string): string {
  const p = nome.trim().split(/[\s._-]+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

const STATUS_DOT: Record<TecnicoAtivo["status"], string> = {
  "em-campo":  "#10B981",
  "base":      "#6366F1",
  "off-shift": "#F59E0B",
  "offline":   "#9CA3AF",
};
const STATUS_LABEL: Record<TecnicoAtivo["status"], string> = {
  "em-campo":  "Em campo",
  "base":      "Na base",
  "off-shift": "Off-shift",
  "offline":   "Offline",
};

/* ── page ─────────────────────────────────────────────────────────── */

export default function PainelOverviewPage() {
  const [stats,     setStats]     = useState<PainelStats | null>(null);
  const [tecnicos,  setTecnicos]  = useState<TecnicoAtivo[]>([]);
  const [revisitas, setRevisitas] = useState<RevisitaPendente[]>([]);
  const [audit,     setAudit]     = useState<AuditEntry[]>([]);
  const [historico, setHistorico] = useState<HistoricoAnalytics | null>(null);
  const [now,       setNow]       = useState(() => new Date());

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
      setStats(s); setTecnicos(t); setRevisitas(r); setAudit(a); setHistorico(h);
      setNow(new Date());
    };
    load();
    const id   = window.setInterval(load, 20_000);
    const tick = window.setInterval(() => setNow(new Date()), 1_000);
    return () => { alive = false; clearInterval(id); clearInterval(tick); };
  }, []);

  /* derived */
  const emCampo      = useMemo(() => tecnicos.filter(t => t.status === "em-campo").length, [tecnicos]);
  const taxaAprov    = historico?.taxas.aprovacaoPct ?? 0;
  const taxaRevisita = historico?.taxas.revisitaPct  ?? 0;
  const topMunis     = (historico?.topMunicipios  ?? []).slice(0, 5);
  const topTecs      = (historico?.rankingTecnicos ?? []).slice(0, 5);
  const equipe       = useMemo(() =>
    tecnicos.filter(t => t.status === "em-campo" || t.status === "base").slice(0, 6),
    [tecnicos]
  );

  const velocity = useMemo(() => {
    if (!historico) return { values: [] as number[], labels: [] as string[], avg: 0, peak: 0 };
    const last = historico.serieDiaria.slice(-14);
    const values = last.map(d => d.finalizadas);
    const labels = last.map(d => diaCurto(d.dia));
    const avg  = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const peak = Math.max(...values, 0);
    return { values, labels, avg, peak };
  }, [historico]);

  const heatmap = useMemo(() =>
    (historico?.serieDiaria ?? []).map(d => ({ date: d.dia, value: d.finalizadas })),
    [historico]
  );

  const alertaRevisitas = revisitas.filter(r => r.prioridade === "CRITICA" || r.prioridade === "ALTA");

  /* ── KPI cards ── */
  const kpis = [
    {
      label: "Backlog",
      value: stats ? fmtNum(stats.pendentes) : "—",
      sub: "aguardando atribuição",
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.08)",
      icon: ClipboardList,
      href: "/painel/vistorias",
    },
    {
      label: "Em vistoria",
      value: stats ? fmtNum(stats.emVistoria) : "—",
      sub: `${emCampo} técnico${emCampo !== 1 ? "s" : ""} em campo`,
      color: "#3B82F6",
      bg: "rgba(59,130,246,0.08)",
      icon: Activity,
      href: "/painel/mapa",
    },
    {
      label: "Concluídas",
      value: stats ? fmtNum(stats.vistoriadas) : "—",
      sub: "aguardando aprovação",
      color: "#10B981",
      bg: "rgba(16,185,129,0.08)",
      icon: CheckCircle2,
      href: "/painel/historico",
    },
    {
      label: "Revisitas",
      value: stats ? fmtNum((stats.aguardandoRevisita ?? 0) + (stats.emRevisita ?? 0)) : "—",
      sub: `${stats?.aguardandoRevisita ?? 0} sem técnico`,
      color: "#F97316",
      bg: "rgba(249,115,22,0.08)",
      icon: RotateCw,
      href: "/painel/revisitas",
    },
    {
      label: "Municípios",
      value: stats ? fmtNum(stats.municipiosAtivos) : "—",
      sub: "com equipamentos ativos",
      color: "#8B5CF6",
      bg: "rgba(139,92,246,0.08)",
      icon: Building2,
    },
    {
      label: "Equipe",
      value: stats ? fmtNum(stats.tecnicosAtivos) : "—",
      sub: `${emCampo} em campo agora`,
      color: "#00B388",
      bg: "rgba(0,179,136,0.08)",
      icon: Users,
      href: "/painel/tecnicos",
    },
  ];

  return (
    <div className="space-y-4 pb-4">

      {/* ── CABEÇALHO DA PÁGINA ─────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[#111827]">
            Central de Operações
          </h1>
          <p className="mt-0.5 text-[12.5px] text-[#6B7280]">
            {stats ? (
              <>
                <span className="font-semibold text-[#111827]">{stats.pendentes + stats.emVistoria}</span>{" "}
                vistorias na fila ·{" "}
                <span className="font-semibold text-[#111827]">{emCampo}</span> técnico{emCampo !== 1 ? "s" : ""} em campo ·{" "}
                <span className="font-semibold text-[#111827]">{stats.municipiosAtivos}</span> municípios ativos
              </>
            ) : (
              "Carregando…"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {alertaRevisitas.length > 0 && (
            <Link
              href="/painel/revisitas"
              className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-amber-700 transition hover:bg-amber-100"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {alertaRevisitas.length} alerta{alertaRevisitas.length !== 1 ? "s" : ""}
            </Link>
          )}
          <div className="flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-[11px] font-semibold tabular-nums text-[#6B7280]">
              {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
          <Link
            href="/painel/vistorias"
            className="flex items-center gap-1.5 rounded-lg bg-[#059669] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#047857]"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Atribuir
          </Link>
        </div>
      </div>

      {/* ── KPI STRIP (hero verde) ──────────────────────────────── */}
      <div
        className="rounded-2xl p-[18px]"
        style={{
          background: "linear-gradient(135deg, #00C896 0%, #009E78 50%, #007A5C 100%)",
          boxShadow: "0 6px 32px rgba(0,179,136,0.32), 0 1px 0 rgba(255,255,255,0.18) inset",
        }}
      >
        <div className="grid grid-cols-6 gap-3">
          {kpis.map((k) => {
            const Icon = k.icon;

            /* Card especial Equipe: imagem vis.png com overlay */
            if (k.label === "Equipe") {
              const imgCard = (
                <div className="relative overflow-hidden rounded-xl" style={{ minHeight: 116 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/vis.png"
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover object-center"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(to top, rgba(0,40,30,0.80) 0%, rgba(0,60,40,0.30) 55%, transparent 100%)" }}
                  />
                  <div className="absolute inset-0 flex flex-col justify-end gap-0.5 p-4">
                    <div className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-white drop-shadow">
                      {k.value}
                    </div>
                    <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/70">{k.label}</div>
                    <div className="text-[10px] text-white/50">{k.sub}</div>
                  </div>
                </div>
              );
              return k.href ? (
                <Link key={k.label} href={k.href} className="group">{imgCard}</Link>
              ) : (
                <div key={k.label}>{imgCard}</div>
              );
            }

            const inner = (
              <div
                key={k.label}
                className="flex flex-col gap-2 rounded-xl p-4 transition"
                style={{ background: "rgba(255,255,255,0.96)", border: "1px solid rgba(255,255,255,0.60)", boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-lg p-1.5" style={{ background: k.bg }}>
                    <Icon className="h-3.5 w-3.5" style={{ color: k.color }} strokeWidth={2.2} />
                  </span>
                  {k.href && (
                    <ArrowUpRight className="h-3 w-3 text-[#D1D5DB] transition group-hover:text-[#9CA3AF]" strokeWidth={2} />
                  )}
                </div>
                <div>
                  <div className="text-[26px] font-semibold leading-none tabular-nums tracking-tight text-[#111827]">
                    {k.value}
                  </div>
                  <div className="mt-1 text-[10.5px] font-medium leading-tight text-[#9CA3AF]">{k.label}</div>
                </div>
                <div className="text-[10px] text-[#6B7280]">{k.sub}</div>
              </div>
            );
            return k.href ? (
              <Link key={k.label} href={k.href} className="group">{inner}</Link>
            ) : (
              <div key={k.label}>{inner}</div>
            );
          })}
        </div>
      </div>

      {/* ── LINHA 1: VELOCITY + EQUIPE ──────────────────────────── */}
      <div className="grid grid-cols-12 gap-3">

        {/* Velocity 14d */}
        <div
          className="col-span-8 rounded-xl p-5"
          style={{ background: "#fff", border: "1px solid #E8EAED", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#059669]" strokeWidth={2} />
                <span className="text-[13px] font-semibold text-[#111827]">Vistorias finalizadas · 14 dias</span>
              </div>
              <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
                Média/dia:{" "}
                <span className="font-semibold text-[#374151]">{velocity.avg.toFixed(1).replace(".", ",")}</span>
                {" "}· Pico:{" "}
                <span className="font-semibold text-[#059669]">{velocity.peak}</span>
              </p>
            </div>
            <Link href="/painel/historico" className="flex items-center gap-1 text-[11px] font-semibold text-[#059669] hover:underline">
              Ver histórico <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="relative mt-3 h-[180px]">
            {velocity.values.length > 0 ? (
              <>
                <AreaChart
                  data={velocity.values}
                  labels={velocity.labels}
                  color="#059669"
                  height={180}
                  showAxis
                />
                {velocity.avg > 0 && (
                  <div
                    className="pointer-events-none absolute left-2 right-2 border-t border-dashed border-amber-400/60"
                    style={{ top: `${12 + (1 - velocity.avg / Math.max(velocity.peak, 1)) * (180 - 24)}px` }}
                  >
                    <span className="absolute -top-[11px] right-0 rounded bg-amber-50 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-700">
                      Média
                    </span>
                  </div>
                )}
              </>
            ) : (
              <Skeleton h={180} />
            )}
          </div>
        </div>

        {/* Equipe ao vivo */}
        <div
          className="col-span-4 overflow-hidden rounded-xl"
          style={{ background: "#fff", border: "1px solid #E8EAED", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
          <div className="flex items-center justify-between border-b border-[#F3F4F6] px-4 py-3">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-[#059669]" strokeWidth={2.2} />
              <span className="text-[13px] font-semibold text-[#111827]">Equipe · ao vivo</span>
            </div>
            <Link href="/painel/mapa" className="flex items-center gap-1 text-[11px] font-semibold text-[#059669] hover:underline">
              Mapa <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="divide-y divide-[#F9FAFB]">
            {equipe.length === 0 && (
              <li className="px-4 py-8 text-center text-[11.5px] text-[#D1D5DB]">
                Nenhum técnico ativo.
              </li>
            )}
            {equipe.map(t => (
              <li key={t.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <div className="relative shrink-0">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                    style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}
                  >
                    {initials(t.nome)}
                  </span>
                  <span
                    className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full ring-2 ring-white"
                    style={{ background: STATUS_DOT[t.status] }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-[#111827]">{t.nome.split(" ")[0]}</p>
                  <p className="truncate text-[10px] text-[#9CA3AF]">
                    {t.municipio ?? "—"} · {t.concluidasHoje} hoje
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-wide"
                  style={{
                    background: `${STATUS_DOT[t.status]}18`,
                    color: STATUS_DOT[t.status],
                  }}
                >
                  {STATUS_LABEL[t.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── LINHA 2: HEATMAP + GAUGES ───────────────────────────── */}
      <div className="grid grid-cols-12 gap-3">

        {/* Heatmap */}
        <div
          className="col-span-8 rounded-xl p-5"
          style={{ background: "#fff", border: "1px solid #E8EAED", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#059669]" strokeWidth={2} />
              <span className="text-[13px] font-semibold text-[#111827]">Padrão diário · 30 dias</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-[#9CA3AF]">
              <span>menos</span>
              {[0.18, 0.36, 0.55, 0.74, 0.92].map(o => (
                <span key={o} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "#059669", opacity: o }} />
              ))}
              <span>mais</span>
            </div>
          </div>
          <div className="mt-3 h-[100px]">
            {heatmap.length > 0 ? <CalendarHeatmap data={heatmap} color="#059669" /> : <Skeleton h={100} />}
          </div>
          <div className="mt-2 flex gap-5 text-[10.5px] text-[#6B7280]">
            <span>
              Total no período:{" "}
              <span className="font-semibold text-[#111827]">{historico?.totais.vistoriasFinalizadas ?? 0}</span>
            </span>
            <span>
              Média semanal:{" "}
              <span className="font-semibold text-[#111827]">
                {(historico?.medias.semanalVistorias ?? 0).toFixed(1).replace(".", ",")}
              </span>
            </span>
            <span>
              PDFs gerados:{" "}
              <span className="font-semibold text-[#111827]">{historico?.totais.pdfsGerados ?? 0}</span>
            </span>
          </div>
        </div>

        {/* Gauges */}
        <div className="col-span-4 grid grid-rows-2 gap-3">
          <div
            className="flex items-center gap-4 rounded-xl px-5 py-4"
            style={{ background: "#fff", border: "1px solid #E8EAED", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
          >
            <div className="h-[80px] w-[80px] shrink-0">
              <GaugeRate value={taxaAprov} label="aprov." color="#059669" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#059669]">Aprovação</p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#111827]">
                {taxaAprov.toFixed(0)}%
              </p>
              <p className="text-[10px] text-[#9CA3AF]">
                {historico?.totais.aprovadas ?? 0} de {historico?.totais.vistoriasFinalizadas ?? 0}
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-4 rounded-xl px-5 py-4"
            style={{ background: "#fff", border: "1px solid #E8EAED", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
          >
            <div className="h-[80px] w-[80px] shrink-0">
              <GaugeRate value={taxaRevisita} label="revis." color="#F59E0B" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-600">Revisitas</p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#111827]">
                {taxaRevisita.toFixed(0)}%
              </p>
              <p className="text-[10px] text-[#9CA3AF]">
                {historico?.totais.reprovadas ?? 0} reprovadas (30d)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── LINHA 3: RANKINGS + ATIVIDADE + REVISITAS ───────────── */}
      <div className="grid grid-cols-12 gap-3">

        {/* Top municípios */}
        <div
          className="col-span-3 rounded-xl p-4"
          style={{ background: "#fff", border: "1px solid #E8EAED", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-[#8B5CF6]" strokeWidth={2} />
            <span className="text-[12.5px] font-semibold text-[#111827]">Top municípios</span>
          </div>
          {topMunis.length > 0 ? (
            <BarRanking
              items={topMunis.map((m, i) => ({
                label: m.municipio,
                value: m.total,
                color: ["#8B5CF6","#6366F1","#3B82F6","#0EA5E9","#94A3B8"][i] ?? "#94A3B8",
              }))}
              height={200}
            />
          ) : <Skeleton h={200} />}
        </div>

        {/* Top técnicos */}
        <div
          className="col-span-3 rounded-xl p-4"
          style={{ background: "#fff", border: "1px solid #E8EAED", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-[#059669]" strokeWidth={2} />
              <span className="text-[12.5px] font-semibold text-[#111827]">Top técnicos · 30d</span>
            </div>
            <Link href="/painel/tecnicos" className="text-[10.5px] font-semibold text-[#059669]">ver todos</Link>
          </div>
          {topTecs.length > 0 ? (
            <BarRanking
              items={topTecs.map((t, i) => ({
                label: t.nome.split(" ")[0],
                value: t.total,
                color: ["#059669","#10B981","#34D399","#6EE7B7","#A7F3D0"][i] ?? "#A7F3D0",
              }))}
              formatValue={(v) => `${v} v.`}
              height={200}
            />
          ) : <Skeleton h={200} />}
        </div>

        {/* Atividade ao vivo */}
        <div
          className="col-span-3 overflow-hidden rounded-xl"
          style={{ background: "#fff", border: "1px solid #E8EAED", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
          <div className="flex items-center justify-between border-b border-[#F3F4F6] px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-[#3B82F6]" strokeWidth={2} />
              <span className="text-[12.5px] font-semibold text-[#111827]">Atividade ao vivo</span>
            </div>
            <Link href="/painel/auditoria" className="flex items-center gap-1 text-[10.5px] font-semibold text-[#3B82F6]">
              Auditoria <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="divide-y divide-[#F9FAFB]">
            {audit.length === 0 && (
              <li className="px-4 py-6 text-center text-[11px] text-[#D1D5DB]">
                Sem eventos recentes.
              </li>
            )}
            {audit.slice(0, 5).map(e => (
              <li key={e.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: e.ator.role === "admin" ? "rgba(99,102,241,0.10)" : "rgba(16,185,129,0.10)",
                    color:      e.ator.role === "admin" ? "#6366F1" : "#059669",
                  }}
                >
                  <Activity className="h-3 w-3" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] leading-snug text-[#374151]">
                    <span className="font-semibold">{e.ator.nome.split(" ")[0]}</span>{" "}
                    <span className="text-[#9CA3AF]">{e.acao.replace(/[-_]/g, " ")}</span>
                    {e.alvo && <span className="ml-1 font-semibold text-[#059669]">{e.alvo.label}</span>}
                  </p>
                  <p className="text-[9.5px] text-[#9CA3AF]">{relativo(e.timestamp)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Revisitas pendentes */}
        <div
          className="col-span-3 overflow-hidden rounded-xl"
          style={{
            background: "#fff",
            border: "1px solid rgba(249,115,22,0.22)",
            boxShadow: "0 1px 3px rgba(249,115,22,0.06)",
          }}
        >
          <div className="flex items-center justify-between border-b border-orange-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <RotateCw className="h-3.5 w-3.5 text-orange-500" strokeWidth={2} />
              <span className="text-[12.5px] font-semibold text-[#111827]">
                Revisitas
                {revisitas.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 py-px text-[10px] font-bold text-orange-600">
                    {revisitas.length}
                  </span>
                )}
              </span>
            </div>
            <Link href="/painel/revisitas" className="flex items-center gap-1 text-[10.5px] font-semibold text-orange-500">
              Central <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {revisitas.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-10">
              <Sparkles className="h-6 w-6 text-emerald-400" strokeWidth={1.5} />
              <p className="text-[11.5px] font-semibold text-[#374151]">Operação em dia</p>
              <p className="text-[10.5px] text-[#9CA3AF]">Sem revisitas pendentes.</p>
            </div>
          ) : (
            <ul className="divide-y divide-orange-50">
              {revisitas.slice(0, 4).map(r => (
                <li key={r.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-500">
                    <ShieldAlert className="h-3 w-3" strokeWidth={2.4} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-semibold text-[#374151]">
                      {r.equipamento}
                    </p>
                    <p className="line-clamp-1 text-[10px] text-[#9CA3AF]">
                      {r.municipio} · {relativo(r.reprovadoEm)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* rodapé */}
      <p className="pb-1 text-center text-[10px] text-[#D1D5DB]">
        Dados via GIOC · atualiza a cada 20s · {historico?.periodo.dias ?? 30} dias de histórico
      </p>
    </div>
  );
}

/* ── skeleton placeholder ─────────────────────────────────────────── */
function Skeleton({ h }: { h: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-xl bg-[#F3F4F6]"
      style={{ height: h }}
    />
  );
}
