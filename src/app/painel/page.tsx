"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  Map as MapIcon,
  RotateCw,
  ShieldAlert,
  Sparkles,
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

/* ── helpers ── */
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

const ACCENT = "#00D084";

/* ══════════════════════════════════════════════════════════════════ */

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
  const emCampo    = useMemo(() => tecnicos.filter(t => t.status === "em-campo").length, [tecnicos]);
  const expediente = useMemo(
    () => tecnicos.filter(t => t.status === "em-campo" || t.status === "base").length,
    [tecnicos],
  );
  const taxaAprov    = historico?.taxas.aprovacaoPct ?? 0;
  const taxaRevisita = historico?.taxas.revisitaPct  ?? 0;
  const topMunis     = (historico?.topMunicipios  ?? []).slice(0, 5);
  const topTecs      = (historico?.rankingTecnicos ?? []).slice(0, 5);
  const equipe       = useMemo(
    () => tecnicos.filter(t => t.status === "em-campo" || t.status === "base").slice(0, 6),
    [tecnicos],
  );

  const velocity = useMemo(() => {
    if (!historico) return { values: [] as number[], labels: [] as string[], avg: 0, peak: 0 };
    const last   = historico.serieDiaria.slice(-14);
    const values = last.map(d => d.finalizadas);
    const labels = last.map(d => diaCurto(d.dia));
    const avg    = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const peak   = Math.max(...values, 0);
    return { values, labels, avg, peak };
  }, [historico]);

  const heatmap = useMemo(
    () => (historico?.serieDiaria ?? []).map(d => ({ date: d.dia, value: d.finalizadas })),
    [historico],
  );

  const alertaRevisitas = revisitas.filter(
    r => r.prioridade === "CRITICA" || r.prioridade === "ALTA",
  );

  const heroStats = stats
    ? [
        { val: fmtNum(stats.pendentes + stats.emVistoria), label: "vistorias na fila" },
        { val: String(expediente),                         label: "em expediente"     },
        { val: String(emCampo),                            label: "técnico em campo"  },
        { val: fmtNum(stats.municipiosAtivos),             label: "municípios ativos" },
      ]
    : null;

  const kpis = [
    {
      label: "Backlog",
      value: stats ? fmtNum(stats.pendentes) : "—",
      sub: "aguardando atribuição",
      color: "#F59E0B",
      icon: ClipboardList,
      href: "/painel/vistorias",
    },
    {
      label: "Em vistoria",
      value: stats ? fmtNum(stats.emVistoria) : "—",
      sub: `${emCampo} técnico${emCampo !== 1 ? "s" : ""} em campo`,
      color: "#3B82F6",
      icon: Activity,
      href: "/painel/mapa",
    },
    {
      label: "Concluídas",
      value: stats ? fmtNum(stats.vistoriadas) : "—",
      sub: "aguardando aprovação",
      color: "#10B981",
      icon: CheckCircle2,
      href: "/painel/historico",
    },
    {
      label: "Revisitas",
      value: stats
        ? fmtNum((stats.aguardandoRevisita ?? 0) + (stats.emRevisita ?? 0))
        : "—",
      sub: `${stats?.aguardandoRevisita ?? 0} sem técnico`,
      color: "#F97316",
      icon: RotateCw,
      href: "/painel/revisitas",
    },
    {
      label: "Municípios",
      value: stats ? fmtNum(stats.municipiosAtivos) : "—",
      sub: "com equipamentos ativos",
      color: "#8B5CF6",
      icon: Building2,
      href: undefined as string | undefined,
    },
    {
      label: "Equipe",
      value: stats ? fmtNum(stats.tecnicosAtivos) : "—",
      sub: `${emCampo} em campo agora`,
      color: ACCENT,
      icon: Users,
      href: "/painel/tecnicos",
    },
  ];

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-4 pb-4">

      {/* ══════════════════════════════════════════════════════
          HERO — vis.png + stats + KPIs
          ══════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl" style={{ height: 480 }}>

        {/* background: vis.png */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vis.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />

        {/* dark overlay with green tint */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(110deg, rgba(2,10,7,0.90) 0%, rgba(0,20,13,0.82) 38%, rgba(0,12,8,0.62) 65%, rgba(0,8,5,0.78) 100%)",
          }}
        />

        {/* subtle grid */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: [
              "linear-gradient(rgba(0,208,132,0.04) 1px,transparent 1px)",
              "linear-gradient(90deg,rgba(0,208,132,0.04) 1px,transparent 1px)",
            ].join(","),
            backgroundSize: "40px 40px",
          }}
        />

        {/* ── header bar ── */}
        <div
          className="absolute inset-x-0 top-0 z-10 flex h-11 items-center gap-4 px-6"
          style={{ borderBottom: "1px solid rgba(0,208,132,0.13)" }}
        >
          <span
            className="h-2 w-2 shrink-0 animate-pulse rounded-full"
            style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-[0.26em]"
            style={{ color: ACCENT }}
          >
            SISTEMA EM OPERAÇÃO
          </span>
          <span className="h-3 w-px" style={{ background: "rgba(255,255,255,0.09)" }} />
          <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.22)" }}>
            atualiza a cada 20s
          </span>

          <div className="ml-auto flex items-center gap-2.5">
            {alertaRevisitas.length > 0 && (
              <Link
                href="/painel/revisitas"
                className="flex items-center gap-1.5 rounded-lg border border-amber-800/40 bg-amber-900/30 px-2.5 py-1 text-[10.5px] font-semibold text-amber-400 transition hover:bg-amber-900/50"
              >
                <ShieldAlert className="h-3 w-3" />
                {alertaRevisitas.length} alerta{alertaRevisitas.length !== 1 ? "s" : ""}
              </Link>
            )}
            <div
              className="rounded-lg px-3 py-[5px]"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.09)",
              }}
            >
              <span className="text-[12px] font-mono font-semibold tabular-nums" style={{ color: "#C8D8E0" }}>
                {now.toLocaleTimeString("pt-BR", {
                  hour: "2-digit", minute: "2-digit", second: "2-digit",
                })}
              </span>
            </div>
            <Link
              href="/painel/vistorias"
              className="flex items-center gap-1.5 rounded-lg px-3 py-[6px] text-[11.5px] font-bold tracking-wide transition-all hover:brightness-110 hover:scale-105 active:scale-[.97]"
              style={{ background: ACCENT, color: "#050505", boxShadow: `0 0 18px ${ACCENT}55` }}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Atribuir
            </Link>
          </div>
        </div>

        {/* ── content: left | right ── */}
        <div className="absolute inset-x-0 bottom-0 top-11 flex items-stretch">

          {/* LEFT: title + stats + buttons */}
          <div className="flex w-[340px] shrink-0 flex-col justify-between p-8">
            <div>
              {/* eyebrow */}
              <div className="mb-5 flex items-center gap-2">
                <span className="h-px w-6" style={{ background: "rgba(0,208,132,0.35)" }} />
                <span
                  className="text-[8.5px] font-bold uppercase tracking-[0.30em]"
                  style={{ color: "rgba(0,208,132,0.55)" }}
                >
                  CENTRAL GIOC
                </span>
              </div>

              {/* main title */}
              <h1
                className="text-[38px] font-bold leading-[1.12] tracking-tight"
                style={{ color: "#DDF2EC" }}
              >
                Operação em
                <br />
                <span style={{ color: ACCENT, textShadow: `0 0 32px ${ACCENT}55` }}>
                  movimento.
                </span>
              </h1>

              {/* stat counters */}
              <div className="mt-6 space-y-2.5">
                {heroStats ? (
                  heroStats.map((s, i) => (
                    <motion.div
                      key={s.label}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 + i * 0.07, ease: "easeOut", duration: 0.35 }}
                      className="flex items-baseline gap-2"
                    >
                      <span
                        className="text-[26px] font-bold tabular-nums leading-none"
                        style={{ color: ACCENT }}
                      >
                        {s.val}
                      </span>
                      <span
                        className="text-[11.5px] font-medium"
                        style={{ color: "rgba(255,255,255,0.50)" }}
                      >
                        {s.label}
                      </span>
                    </motion.div>
                  ))
                ) : (
                  [80, 72, 64, 56].map((w, i) => (
                    <div
                      key={i}
                      className="h-7 animate-pulse rounded-lg"
                      style={{ background: "rgba(255,255,255,0.07)", width: `${w}%` }}
                    />
                  ))
                )}
              </div>
            </div>

            {/* buttons */}
            <div className="flex flex-col gap-2.5">
              <Link
                href="/painel/vistorias"
                className="flex items-center justify-center gap-2 rounded-[16px] py-3 text-[13px] font-bold tracking-wide transition-all hover:brightness-110 hover:scale-[1.02] active:scale-[.98]"
                style={{ background: ACCENT, color: "#050505", boxShadow: `0 4px 22px ${ACCENT}50` }}
              >
                <UserPlus className="h-4 w-4" />
                Atribuir Vistorias
              </Link>
              <Link
                href="/painel/mapa"
                className="flex items-center justify-center gap-2 rounded-[16px] py-3 text-[13px] font-semibold tracking-wide transition-all hover:scale-[1.02] active:scale-[.98]"
                style={{
                  background: "rgba(0,208,132,0.08)",
                  color: ACCENT,
                  border: "1px solid rgba(0,208,132,0.28)",
                }}
              >
                <MapIcon className="h-4 w-4" />
                Mapa em Tempo Real
              </Link>
            </div>
          </div>

          {/* spacer so KPIs hug the right */}
          <div className="flex-1" />

          {/* RIGHT: KPI cards 2×3 */}
          <div className="flex w-[400px] shrink-0 items-center p-6">
            <div className="grid w-full grid-cols-2 gap-3">
              {kpis.map((k, i) => {
                const Icon = k.icon;
                const card = (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.065, ease: "easeOut", duration: 0.35 }}
                    whileHover={{
                      scale: 1.05,
                      y: -3,
                      transition: { type: "spring", stiffness: 320, damping: 22 },
                    }}
                    className="flex flex-col gap-2.5 rounded-[18px] p-4"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(0,208,132,0.14)",
                      backdropFilter: "blur(14px)",
                      boxShadow:
                        "0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)",
                      cursor: k.href ? "pointer" : "default",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-xl"
                        style={{
                          background: `${k.color}1A`,
                          boxShadow: `0 0 14px ${k.color}22`,
                        }}
                      >
                        <Icon className="h-4 w-4" style={{ color: k.color }} strokeWidth={2} />
                      </span>
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: k.color, boxShadow: `0 0 6px ${k.color}` }}
                      />
                    </div>
                    <div>
                      <div
                        className="text-[26px] font-bold leading-none tabular-nums"
                        style={{ color: "#DDF2EC" }}
                      >
                        {k.value}
                      </div>
                      <div
                        className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em]"
                        style={{ color: "rgba(255,255,255,0.38)" }}
                      >
                        {k.label}
                      </div>
                      <div
                        className="mt-px text-[9px] leading-tight"
                        style={{ color: "rgba(255,255,255,0.24)" }}
                      >
                        {k.sub}
                      </div>
                    </div>
                  </motion.div>
                );

                return k.href ? (
                  <Link key={k.label} href={k.href} className="block">{card}</Link>
                ) : (
                  <div key={k.label}>{card}</div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          LINHA 1: VELOCITY + EQUIPE
          ══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-12 gap-3">

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
                <AreaChart data={velocity.values} labels={velocity.labels} color="#059669" height={180} showAxis />
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
              <li className="px-4 py-8 text-center text-[11.5px] text-[#D1D5DB]">Nenhum técnico ativo.</li>
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
                  <p className="truncate text-[10px] text-[#9CA3AF]">{t.municipio ?? "—"} · {t.concluidasHoje} hoje</p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-wide"
                  style={{ background: `${STATUS_DOT[t.status]}18`, color: STATUS_DOT[t.status] }}
                >
                  {STATUS_LABEL[t.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          LINHA 2: HEATMAP + GAUGES
          ══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-12 gap-3">

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
              {[0.18,0.36,0.55,0.74,0.92].map(o => (
                <span key={o} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "#059669", opacity: o }} />
              ))}
              <span>mais</span>
            </div>
          </div>
          <div className="mt-3 h-[100px]">
            {heatmap.length > 0 ? <CalendarHeatmap data={heatmap} color="#059669" /> : <Skeleton h={100} />}
          </div>
          <div className="mt-2 flex gap-5 text-[10.5px] text-[#6B7280]">
            <span>Total no período: <span className="font-semibold text-[#111827]">{historico?.totais.vistoriasFinalizadas ?? 0}</span></span>
            <span>Média semanal: <span className="font-semibold text-[#111827]">{(historico?.medias.semanalVistorias ?? 0).toFixed(1).replace(".", ",")}</span></span>
            <span>PDFs gerados: <span className="font-semibold text-[#111827]">{historico?.totais.pdfsGerados ?? 0}</span></span>
          </div>
        </div>

        <div className="col-span-4 grid grid-rows-2 gap-3">
          {[
            { value: taxaAprov, label: "revis.", color: "#059669", title: "Aprovação", labelColor: "text-[#059669]", total: historico?.totais.aprovadas ?? 0, de: historico?.totais.vistoriasFinalizadas ?? 0, subLabel: "de" },
            { value: taxaRevisita, label: "revis.", color: "#F59E0B", title: "Revisitas", labelColor: "text-amber-600", total: historico?.totais.reprovadas ?? 0, de: 0, subLabel: "reprovadas (30d)" },
          ].map(g => (
            <div
              key={g.title}
              className="flex items-center gap-4 rounded-xl px-5 py-4"
              style={{ background: "#fff", border: "1px solid #E8EAED", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
            >
              <div className="h-[80px] w-[80px] shrink-0">
                <GaugeRate value={g.value} label={g.label} color={g.color} />
              </div>
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${g.labelColor}`}>{g.title}</p>
                <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#111827]">{g.value.toFixed(0)}%</p>
                <p className="text-[10px] text-[#9CA3AF]">
                  {g.de > 0 ? `${g.total} de ${g.de}` : `${g.total} ${g.subLabel}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          LINHA 3: RANKINGS + ATIVIDADE + REVISITAS
          ══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-12 gap-3">

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
              <li className="px-4 py-6 text-center text-[11px] text-[#D1D5DB]">Sem eventos recentes.</li>
            )}
            {audit.slice(0, 5).map(e => (
              <li key={e.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: e.ator.role === "admin" ? "rgba(99,102,241,0.10)" : "rgba(16,185,129,0.10)",
                    color:      e.ator.role === "admin" ? "#6366F1"               : "#059669",
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
                    <p className="truncate text-[11.5px] font-semibold text-[#374151]">{r.equipamento}</p>
                    <p className="line-clamp-1 text-[10px] text-[#9CA3AF]">{r.municipio} · {relativo(r.reprovadoEm)}</p>
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

function Skeleton({ h }: { h: number }) {
  return (
    <div className="w-full animate-pulse rounded-xl bg-[#F3F4F6]" style={{ height: h }} />
  );
}
