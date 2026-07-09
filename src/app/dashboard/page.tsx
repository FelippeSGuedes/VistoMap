"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Map as MapIcon,
  RotateCw,
  Signal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { BottomNav } from "@/components/layout/BottomNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { MunicipioField } from "@/components/dashboard/MunicipioField";
import { SyncFilterPill } from "@/components/dashboard/SyncFilterPill";
import { SyncFilterSheet } from "@/components/dashboard/SyncFilterSheet";
import { NotificationPermissionCard } from "@/components/feedback/NotificationPermissionCard";
import { ExpedienteCard } from "@/components/expediente/ExpedienteCard";
import { useVistoriasAccessGuard } from "@/hooks/useVistoriasAccessGuard";
import { useAuthStore } from "@/store/auth";
import { vistoriasService } from "@/services/vistorias";
import { MOCK_SYNC_SNAPSHOTS } from "@/utils/mock";
import type { DashboardStats, SyncSnapshot } from "@/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
function initials(nome: string) {
  const p = nome.trim().split(" ");
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase();
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const dd = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hh = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dd} às ${hh}`;
}
/**
 * Extrai só o primeiro nome do usuário GLPI, capitalizado.
 * Aceita "Felippe Andrade" → "Felippe", "felippe.gustavo" → "Felippe",
 * "felippegustavo1" → "Felippegustavo1" (fallback quando não há separador).
 */
function firstNameOf(nome: string): string {
  const first = nome.trim().split(/[\s._-]+/)[0] ?? nome;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function useCountUp(target: number | null, duration = 700) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === null) return;
    if (target === 0) { setCount(0); return; }
    const startTime = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return count;
}

type StatKey = "pendentes" | "concluidas" | "reprovadas";

const STATS: Array<{
  key: StatKey;
  label: string;
  icon: typeof Activity;
  hex: string;
  pill: string;
  grad: string;
}> = [
  { key: "pendentes",  label: "Pendentes",  icon: Activity,     hex: "#F59E0B", pill: "#FEF3C7", grad: "from-amber-500 to-orange-500" },
  { key: "concluidas", label: "Concluídas", icon: CheckCircle2, hex: "#00B388", pill: "#ECFDF5", grad: "from-emerald-500 to-teal-500" },
  // "Reprovada" no GLPI = revisita pendente pelo técnico (ação operacional).
  { key: "reprovadas", label: "Revisitas",  icon: RotateCw,     hex: "#F59E0B", pill: "#FEF3C7", grad: "from-amber-500 to-orange-500" },
];

/**
 * Sparkline SVG estilizado — curva suavizada (Catmull-Rom-ish) com fill
 * em gradiente. Animação stroke draw via Framer.
 */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y] as const;
  });
  // Suaviza com Bézier quadrática.
  const d = pts
    .map(([x, y], i) => {
      if (i === 0) return `M${x.toFixed(1)},${y.toFixed(1)}`;
      const [px, py] = pts[i - 1];
      const mx = (px + x) / 2;
      return `Q${px.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${((py + y) / 2).toFixed(1)} T${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const dFill = `${d} L${w},${h} L0,${h} Z`;
  const gid = `sg-${color.replace("#", "")}`;
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
        transition={{ duration: 1.1, ease: "easeOut" }}
      />
    </svg>
  );
}

/** Delta percentual entre últimos 2 pontos da série. */
function deltaPct(series?: number[]): { value: number; up: boolean } | null {
  if (!series || series.length < 2) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  if (prev === 0) return last > 0 ? { value: 100, up: true } : null;
  const pct = ((last - prev) / prev) * 100;
  return { value: Math.abs(Math.round(pct)), up: pct >= 0 };
}

const ACTIONS = [
  {
    href: "/vistorias",
    label: "Mapa operacional",
    sub: "Ordens em tempo real",
    icon: MapIcon,
    iconBg: "rgba(0,179,136,0.14)",
    iconColor: "#00B388",
  },
  {
    href: "/vistorias",
    label: "Lista de vistorias",
    sub: "Filtrar e buscar ordens",
    icon: ClipboardList,
    iconBg: "#EEF2FF",
    iconColor: "#6366F1",
  },
  {
    href: "/dashboard",
    label: "Cobertura de sinal",
    sub: "Mapa de infraestrutura",
    icon: Signal,
    iconBg: "#ECFDF5",
    iconColor: "#00B388",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const openVistorias = useVistoriasAccessGuard();
  const { hydrated, session } = useAuthStore();
  const [stats, setStats]     = useState<DashboardStats | null>(null);
  const [online, setOnline]   = useState(true);
  // Calculado só no client: no export estático, new Date().getHours() no
  // corpo do render baka a hora do BUILD no HTML, que quase nunca bate com a
  // hora real do celular no primeiro paint — isso disparava erro de
  // hidratação (React descarta o HTML e re-renderiza tudo, visível como um
  // flash na abertura do app).
  const [saudacao, setSaudacao] = useState("Olá");
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const heroParallax = useTransform(scrollY, [0, 200], [0, -30]);

  useEffect(() => { if (hydrated && !session) router.replace("/login"); }, [hydrated, session, router]);
  useEffect(() => { setSaudacao(greeting()); }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Combina stats (mock) + lista REAL de vistorias do GLPI para extrair
  // municípios atendidos pelo técnico + recalcular totals operacionais.
  useEffect(() => {
    let alive = true;
    const ZERO_STATS: DashboardStats = {
      total: 0, pendentes: 0, concluidas: 0, reprovadas: 0,
      municipios: [], ultimaSincronizacao: new Date().toISOString(),
    };

    Promise.all([
      vistoriasService.fetchDashboardStats(),
      vistoriasService.fetchVistorias(),
    ]).then(([s, vistorias]) => {
      if (!alive) return;
      // SELECT DISTINCT cidade + COUNT(*) FROM vistorias do técnico
      const counts = new Map<string, number>();
      for (const v of vistorias) {
        const nome = v.cidade?.trim();
        if (!nome) continue;
        counts.set(nome, (counts.get(nome) ?? 0) + 1);
      }
      const municipios = Array.from(counts.entries())
        .map(([nome, totalVistorias]) => ({ nome, totalVistorias }))
        .sort((a, b) => b.totalVistorias - a.totalVistorias);

      // KPIs reais agregados do GLPI.
      const pendentes = vistorias.filter((v) => v.status === "PENDENTE").length;
      const concluidas = vistorias.filter(
        (v) => v.status === "FINALIZADA" || v.status === "APROVADA"
      ).length;
      const reprovadas = vistorias.filter(
        (v) => v.status === "REPROVADA" || v.isRepeat
      ).length;

      setStats({
        ...s,
        total: vistorias.length,
        pendentes,
        concluidas,
        reprovadas,
        municipios,
        ultimaSincronizacao: new Date().toISOString(),
      });
    }).catch(() => {
      // fetchVistorias falhou (403 sem expediente, sem rede, etc.) → mostra zeros reais
      // em vez de cair no MOCK_SYNC_SNAPSHOTS que exibe "24 vistorias" falso.
      if (alive) setStats(ZERO_STATS);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── Filtro de sincronização ─────────────────────────────────────
  // Default: snapshot mais recente (id "sync-now"). Quando o stats real
  // chega, criamos um snapshot "Última" no topo da lista; histórico mock fica.
  const [syncSheetOpen, setSyncSheetOpen] = useState(false);
  const [selectedSyncId, setSelectedSyncId] = useState<string>("sync-now");

  const snapshots: SyncSnapshot[] = useMemo(() => {
    if (!stats) return MOCK_SYNC_SNAPSHOTS;
    const live: SyncSnapshot = {
      id: "sync-now",
      timestamp: stats.ultimaSincronizacao,
      stats,
      label: "Última",
    };
    return [live, ...MOCK_SYNC_SNAPSHOTS.filter((s) => s.id !== "sync-now")];
  }, [stats]);

  const selectedSnapshot =
    snapshots.find((s) => s.id === selectedSyncId) ?? snapshots[0];
  const displayStats: DashboardStats | null = selectedSnapshot?.stats ?? null;
  const isLatestSelected = selectedSyncId === "sync-now";

  const nome      = session?.tecnico.nome ?? "Tecnico";
  const firstName = firstNameOf(nome);
  const animatedTotal = useCountUp(displayStats !== null ? displayStats.total : null, 1400);

  const handleActionClick =
    (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (href !== "/vistorias") return;
      event.preventDefault();
      void openVistorias(href);
    };

  return (
    <div className="relative flex min-h-[100dvh] flex-col" style={{ background: "#F7F9FB" }}>

      {/* HEADER */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-50 flex items-center justify-between px-5"
        style={{
          paddingTop:    "max(env(safe-area-inset-top), 18px)",
          paddingBottom: "14px",
          background:    "rgba(247,249,251,0.82)",
          backdropFilter: "saturate(180%) blur(24px)",
          WebkitBackdropFilter: "saturate(180%) blur(24px)",
          borderBottom: "1px solid rgba(6,59,59,0.055)",
        }}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo_favicon.PNG`} alt="VistoMap" className="h-8 w-8 rounded-xl" style={{ objectFit: "contain" }} />
          <div className="flex flex-col">
            <span className="text-[21px] font-semibold leading-none tracking-[-0.4px]">
              <span style={{ color: "#00B388" }}>{saudacao},&nbsp;</span>
              <span style={{ color: "#063B3B" }}>{firstName}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
            style={{
              background: online ? "rgba(0,179,136,0.1)" : "rgba(156,163,175,0.12)",
              color:      online ? "#00B388" : "#9CA3AF",
              border:     `1px solid ${online ? "rgba(0,179,136,0.22)" : "rgba(156,163,175,0.2)"}`,
            }}
          >
            <span
              className="h-[5px] w-[5px] rounded-full"
              style={{ background: online ? "#00B388" : "#9CA3AF", boxShadow: online ? "0 0 0 2px rgba(0,179,136,0.3)" : "none" }}
            />
            {online ? "Online" : "Offline"}
          </div>

          <Link
            href="/perfil"
            title="Abrir perfil"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-[12px] font-bold text-white"
            style={{
              background:    "linear-gradient(145deg,#063B3B 0%,#0A5252 100%)",
              boxShadow:     "0 2px 10px rgba(6,59,59,0.3), 0 0 0 2px rgba(0,179,136,0.15)",
              letterSpacing: "0.04em",
            }}
          >
            {initials(nome)}
          </Link>
        </div>
      </motion.header>

      {/* SCROLL CONTENT */}
      <main
        className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-5 overflow-y-auto px-4 pb-32 pt-5"
        style={{ scrollbarWidth: "none" }}
      >

        {/* Banner permissão de notificações — some quando concedida/negada */}
        <NotificationPermissionCard />

        {/* Card de expediente — sempre visivel, gate de inicio de vistorias */}
        <ExpedienteCard />

        {/* HERO CARD */}
        <motion.div
          ref={heroRef}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.52, ease: [0.22, 0.7, 0.2, 1] }}
          className="relative overflow-hidden"
          style={{
            height: 252,
            borderRadius: 28,
            background: "linear-gradient(135deg, #021818 0%, #031E1E 35%, #052E2E 65%, #073838 100%)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.06) inset, " +
              "0 -1px 0 rgba(0,0,0,0.28) inset, " +
              "0 0 0 1px rgba(0,200,150,0.08), " +
              "0 12px 32px rgba(2,18,18,0.22), " +
              "0 4px 10px rgba(2,18,18,0.12)",
          }}
        >
          {/* BACKGROUND IMAGE -- full card, brightened */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/banner.png`}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            style={{
              objectFit: "cover",
              objectPosition: "center top",
              filter: "brightness(1.08) contrast(1.04) saturate(0.88)",
              zIndex: 0,
            }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />

          {/* MAIN OVERLAY: smooth horizontal dissolve, no hard vertical line */}
          <div
            className="absolute inset-0"
            style={{
              zIndex: 1,
              background:
                "linear-gradient(to right, " +
                "rgba(3,22,22,0.97) 0%, " +
                "rgba(3,22,22,0.93) 20%, " +
                "rgba(3,22,22,0.75) 36%, " +
                "rgba(3,22,22,0.38) 52%, " +
                "rgba(3,22,22,0.1) 66%, " +
                "transparent 80%)",
            }}
          />

          {/* TOP EDGE */}
          <div
            className="absolute inset-x-0 top-0"
            style={{
              height: "30%",
              zIndex: 2,
              background: "linear-gradient(to bottom, rgba(3,22,22,0.52) 0%, transparent 100%)",
            }}
          />

          {/* BOTTOM EDGE */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              height: "36%",
              zIndex: 2,
              background: "linear-gradient(to top, rgba(3,22,22,0.6) 0%, transparent 100%)",
            }}
          />

          {/* RIGHT EDGE */}
          <div
            className="absolute inset-y-0 right-0"
            style={{
              width: "12%",
              zIndex: 2,
              background: "linear-gradient(to left, rgba(3,22,22,0.45) 0%, transparent 100%)",
            }}
          />

          {/* TEAL GLOW -- bottom left */}
          <div
            className="pointer-events-none absolute"
            style={{
              left: -24,
              bottom: -24,
              width: 200,
              height: 200,
              zIndex: 3,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(0,200,150,0.18) 0%, rgba(0,200,150,0.05) 48%, transparent 68%)",
            }}
          />

          {/* TEAL GLOW -- top left accent */}
          <div
            className="pointer-events-none absolute"
            style={{
              left: -8,
              top: -8,
              width: 160,
              height: 160,
              zIndex: 3,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(0,200,150,0.1) 0%, transparent 65%)",
            }}
          />

          {/* CONTENT */}
          <div className="absolute inset-0 flex flex-col justify-between p-6" style={{ zIndex: 10 }}>
            <div
              className="w-fit rounded-full px-2.5 py-[5px] text-[8.5px] font-semibold uppercase"
              style={{
                background:      "rgba(0,200,150,0.1)",
                color:           "#5EFFD9",
                border:          "1px solid rgba(0,200,150,0.2)",
                letterSpacing:   "0.2em",
                backdropFilter:  "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              Vistorias
            </div>

            <div className="flex flex-col">
              <div
                className="leading-none font-bold text-white"
                style={{
                  fontSize: 62,
                  letterSpacing: "-3.5px",
                  textShadow: "0 0 40px rgba(0,200,150,0.24), 0 2px 24px rgba(0,200,150,0.14)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {displayStats !== null ? animatedTotal : <Skeleton className="h-14 w-20 rounded-xl bg-white/10" />}
              </div>
              <p className="mt-1 text-[13.5px] font-medium" style={{ color: "rgba(255,255,255,0.52)", letterSpacing: "0.005em" }}>
                Vistorias Sincronizadas
              </p>
              {displayStats && (
                <p className="mt-[3px] text-[10.5px] font-medium" style={{ color: "rgba(255,255,255,0.4)", letterSpacing: "0.04em" }}>
                  {fmtDateTime(displayStats.ultimaSincronizacao)}
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* MUNICÍPIO FIELD — card horizontal premium dos municípios ativos */}
        <MunicipioField
          municipios={displayStats?.municipios}
          ultimaSincronizacao={displayStats?.ultimaSincronizacao}
          loading={displayStats === null}
        />

        {/* STATS GRID — Enterprise KPI cards com sparkline + delta */}
        <section>
          <div className="mb-3 flex items-end justify-between px-0.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#B0BAC5" }}>
              Resumo operacional
            </p>
            {/* Filtro de sincronização — sutil, no lugar de "últimos 7 dias" */}
            <button
              type="button"
              onClick={() => setSyncSheetOpen(true)}
              className="group inline-flex items-center gap-1 text-[10px] font-medium transition-colors"
              style={{ color: "#B0BAC5" }}
            >
              {isLatestSelected
                ? "última sync"
                : selectedSnapshot?.label ??
                  fmtDateTime(
                    selectedSnapshot?.timestamp ?? new Date().toISOString()
                  )}
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-brand-emerald transition-opacity group-hover:opacity-80">
                editar
              </span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {STATS.map(({ key, label, icon: Icon, hex, pill, grad }, i) => {
              const value = displayStats ? displayStats[key] : null;
              const series = displayStats?.trend7d?.[key];
              const delta = deltaPct(series);
              const max = Math.max(displayStats?.total ?? 1, 1);
              const pct = value != null ? Math.min(100, (value / max) * 100) : 0;
              // 3º card (Revisitas) ocupa linha inteira pra destacar
              const isRevisita = key === "reprovadas";
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 * i + 0.1, ease: [0.22, 0.7, 0.2, 1] }}
                  whileHover={{ y: -2, transition: { duration: 0.2 } }}
                  className={`group relative overflow-hidden rounded-[22px] p-[15px] ${isRevisita ? "col-span-2" : ""}`}
                  style={{
                    background: isRevisita
                      ? "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 60%, #FDE68A 100%)"
                      : "#fff",
                    boxShadow: isRevisita
                      ? "0 1px 3px rgba(245,158,11,0.08), 0 8px 24px rgba(245,158,11,0.18), 0 0 0 1px rgba(245,158,11,0.22)"
                      : "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.07), 0 0 0 1px rgba(6,59,59,0.04)",
                  }}
                >
                  {/* glow superior */}
                  <div
                    className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full blur-[24px] transition-opacity group-hover:opacity-100"
                    style={{ background: pill, opacity: 0.85 }}
                  />

                  {/* topo: ícone + delta */}
                  <div className="relative flex items-center justify-between">
                    <div
                      className={`flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-gradient-to-br ${grad} shadow-sm`}
                      style={{ boxShadow: `0 4px 12px ${hex}33` }}
                    >
                      <Icon className="h-[15px] w-[15px] text-white" strokeWidth={2.2} />
                    </div>
                    {delta && (
                      <span
                        className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                        style={{
                          background: delta.up ? "rgba(0,179,136,0.12)" : "rgba(239,68,68,0.10)",
                          color: delta.up ? "#00B388" : "#EF4444",
                        }}
                      >
                        {delta.up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                        {delta.value}%
                      </span>
                    )}
                  </div>

                  {/* label + valor */}
                  <p
                    className="relative mt-[11px] text-[10.5px] font-semibold uppercase tracking-[0.13em]"
                    style={{ color: "#A0ACBA" }}
                  >
                    {label}
                  </p>
                  <div
                    className="relative mt-[2px] text-[28px] font-semibold leading-none tracking-[-0.5px] tabular-nums"
                    style={{ color: "#063B3B" }}
                  >
                    {value !== null ? value : <Skeleton className="mt-1 h-7 w-10 rounded-lg" />}
                  </div>

                  {/* sparkline */}
                  {series && (
                    <div className="relative mt-2 h-7 w-full opacity-90">
                      <Sparkline data={series} color={hex} />
                    </div>
                  )}

                  {/* barra de progresso suave */}
                  {value !== null && (
                    <div className="relative mt-2 h-[3px] overflow-hidden rounded-full bg-black/[0.04]">
                      <motion.span
                        className={`block h-full rounded-full bg-gradient-to-r ${grad}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 0.18 + i * 0.05, duration: 0.9, ease: [0.22, 0.7, 0.2, 1] }}
                      />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

        </section>

        {/* QUICK ACTIONS */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38, ease: [0.22, 0.7, 0.2, 1] }}
        >
          <p className="mb-3 px-0.5 text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#B0BAC5" }}>
            Acesso rapido
          </p>

          <Link href={ACTIONS[0].href} className="block" onClick={handleActionClick(ACTIONS[0].href)}>
            <div
              className="flex items-center justify-between gap-3 rounded-[22px] p-4 transition active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg,#042828 0%,#063B3B 45%,#0A5252 100%)", boxShadow: "0 6px 24px rgba(6,59,59,0.28), 0 1px 0 rgba(255,255,255,0.06) inset" }}
            >
              <div className="flex items-center gap-3.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-[14px]" style={{ background: "rgba(0,179,136,0.16)", border: "1px solid rgba(0,179,136,0.25)" }}>
                  <MapIcon className="h-5 w-5" style={{ color: "#5EFFD9" }} strokeWidth={1.8} />
                </span>
                <div>
                  <p className="text-[15px] font-semibold tracking-[-0.2px] text-white">{ACTIONS[0].label}</p>
                  <p className="text-[11.5px]" style={{ color: "rgba(255,255,255,0.42)" }}>{ACTIONS[0].sub}</p>
                </div>
              </div>
              <ArrowUpRight className="h-5 w-5 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} strokeWidth={1.8} />
            </div>
          </Link>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            {ACTIONS.slice(1).map((a) => (
              <Link key={a.label} href={a.href} onClick={handleActionClick(a.href)}>
                <div
                  className="flex flex-col gap-3 rounded-[22px] p-4 transition active:scale-[0.98]"
                  style={{ background: "#fff", boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.07)", border: "1px solid rgba(6,59,59,0.055)" }}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-[12px]" style={{ background: a.iconBg }}>
                    <a.icon className="h-[18px] w-[18px]" style={{ color: a.iconColor }} strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-semibold tracking-[-0.1px]" style={{ color: "#063B3B" }}>{a.label}</p>
                    <p className="mt-[2px] text-[11px]" style={{ color: "#A0ACBA" }}>{a.sub}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.section>

      </main>

      <BottomNav />

      <SyncFilterSheet
        open={syncSheetOpen}
        snapshots={snapshots}
        selectedId={selectedSyncId}
        onSelect={(s) => setSelectedSyncId(s.id)}
        onClose={() => setSyncSheetOpen(false)}
      />
    </div>
  );
}