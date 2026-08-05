"use client";

/**
 * Home do módulo de Instalação — espelha 1:1 a estrutura da tela inicial
 * da vistoria (saudação, hero card, município em destaque, resumo
 * operacional com sparklines, acesso rápido, nav inferior). Reconstruída
 * do zero pro módulo de Instalação: não importa src/app/dashboard/page.tsx
 * nem seus componentes exclusivos (MunicipioField, ExpedienteCard etc. são
 * amarrados a rotas/hooks de vistoria) — só primitivos genéricos (Skeleton)
 * e dados reais deste módulo.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  ClipboardList,
  Map as MapIcon,
  Wrench,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { InstalacaoBottomNav } from "@/components/instalacoes/InstalacaoBottomNav";
import { InstalacaoMunicipioField, type MunicipioInstalacao } from "@/components/instalacoes/InstalacaoMunicipioField";
import { useInstalacoesStore } from "@/store/instalacoes";
import { useAuthStore } from "@/store/auth";
import { instalacoesService, type InstalacaoStats } from "@/services/instalacoes";

const STATE_LIBERADO = 3;
const STATE_EM_INSTALACAO = 4;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
function firstNameOf(nome: string): string {
  const first = nome.trim().split(/[\s._-]+/)[0] ?? nome;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function useCountUp(target: number | null, duration = 900) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === null) return;
    if (target === 0) {
      setCount(0);
      return;
    }
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

/**
 * Série de 7 pontos terminando no valor real — não temos histórico
 * diário do módulo de Instalação ainda (é novo), então a tendência é só
 * decorativa (mesma ideia do trend7d mockado que o dashboard da vistoria
 * já usa hoje). Determinística por valor, não aleatória a cada render.
 */
function mockTrend(current: number): number[] {
  if (current === 0) return [0, 0, 0, 0, 0, 0, 0];
  const factors = [0.55, 0.62, 0.7, 0.78, 0.85, 0.92, 1];
  return factors.map((f) => Math.max(0, Math.round(current * f)));
}

/** Sparkline SVG — mesmo traçado do dashboard da vistoria. */
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
  const d = pts
    .map(([x, y], i) => {
      if (i === 0) return `M${x.toFixed(1)},${y.toFixed(1)}`;
      const [px, py] = pts[i - 1];
      const mx = (px + x) / 2;
      return `Q${px.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${((py + y) / 2).toFixed(1)} T${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const dFill = `${d} L${w},${h} L0,${h} Z`;
  const gid = `vminst-sg-${color.replace("#", "")}`;
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

type StatKey = "disponiveis" | "andamento" | "instaladas" | "rejeitadas";

const STAT_META: Record<StatKey, { label: string; icon: typeof Activity; hex: string; pill: string; grad: string }> = {
  disponiveis: { label: "Disponíveis", icon: Wrench, hex: "#F59E0B", pill: "#FEF3C7", grad: "from-amber-500 to-orange-500" },
  andamento: { label: "Em Andamento", icon: Activity, hex: "#2563EB", pill: "#EFF6FF", grad: "from-blue-500 to-indigo-500" },
  instaladas: { label: "Instaladas (30d)", icon: CheckCircle2, hex: "#00B388", pill: "#ECFDF5", grad: "from-emerald-500 to-teal-500" },
  rejeitadas: { label: "Rejeitadas", icon: Ban, hex: "#DC2626", pill: "#FEE2E2", grad: "from-red-500 to-rose-600" },
};

export default function InstalacaoHomePage() {
  const router = useRouter();
  const { hydrated, session } = useAuthStore();
  const { items, loading, fetchAll } = useInstalacoesStore();
  const [stats, setStats] = useState<InstalacaoStats | null>(null);
  const [saudacao, setSaudacao] = useState("Olá");
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (hydrated && !session) router.replace("/login");
  }, [hydrated, session, router]);

  useEffect(() => {
    setSaudacao(greeting());
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    void fetchAll();
    instalacoesService
      .fetchInstalacaoStats()
      .then(setStats)
      .catch(() => setStats({ instaladas30d: 0, rejeitadasPendentes: 0 }));
  }, [session, fetchAll]);

  const meuUserId = Number(session?.tecnico.id ?? 0);
  const carregado = !loading && session != null;

  const disponiveis = carregado ? items.filter((i) => i.statusGeralId === STATE_LIBERADO).length : null;
  const andamento = carregado
    ? items.filter((i) => i.statusGeralId === STATE_EM_INSTALACAO && i.instalador?.id === meuUserId).length
    : null;
  const instaladas = stats?.instaladas30d ?? null;
  const rejeitadas = stats?.rejeitadasPendentes ?? null;

  const valores: Record<StatKey, number | null> = { disponiveis, andamento, instaladas, rejeitadas };
  const animatedDisponiveis = useCountUp(disponiveis, 1200);

  const municipios: MunicipioInstalacao[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      const nome = i.contexto.municipio?.trim();
      if (!nome) continue;
      counts.set(nome, (counts.get(nome) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
  }, [items]);

  if (!hydrated || !session) return null;

  const nome = session.tecnico.nome;
  const firstName = firstNameOf(nome);

  return (
    <div className="relative flex min-h-[100dvh] flex-col" style={{ background: "#F7F9FB" }}>
      {/* HEADER */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-40 flex items-center justify-between px-5"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 18px)",
          paddingBottom: "14px",
          background: "rgba(247,249,251,0.82)",
          backdropFilter: "saturate(180%) blur(24px)",
          WebkitBackdropFilter: "saturate(180%) blur(24px)",
          borderBottom: "1px solid rgba(6,59,59,0.055)",
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-emerald/14 text-brand-emerald">
            <Wrench className="h-4 w-4" />
          </span>
          <span className="text-[21px] font-semibold leading-none tracking-[-0.4px]">
            <span style={{ color: "#00B388" }}>{saudacao},&nbsp;</span>
            <span style={{ color: "#063B3B" }}>{firstName}</span>
          </span>
        </div>

        <div
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
          style={{
            background: online ? "rgba(0,179,136,0.1)" : "rgba(156,163,175,0.12)",
            color: online ? "#00B388" : "#9CA3AF",
            border: `1px solid ${online ? "rgba(0,179,136,0.22)" : "rgba(156,163,175,0.2)"}`,
          }}
        >
          <span
            className="h-[5px] w-[5px] rounded-full"
            style={{ background: online ? "#00B388" : "#9CA3AF", boxShadow: online ? "0 0 0 2px rgba(0,179,136,0.3)" : "none" }}
          />
          {online ? "Online" : "Offline"}
        </div>
      </motion.header>

      {/* SCROLL CONTENT */}
      <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-5 overflow-y-auto px-4 pb-32 pt-5">
        {/* HERO CARD */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.52, ease: [0.22, 0.7, 0.2, 1] }}
          className="relative overflow-hidden p-6"
          style={{
            height: 252,
            borderRadius: 28,
            background: "linear-gradient(135deg, #021818 0%, #031E1E 35%, #052E2E 65%, #073838 100%)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.06) inset, 0 -1px 0 rgba(0,0,0,0.28) inset, " +
              "0 0 0 1px rgba(0,200,150,0.08), 0 12px 32px rgba(2,18,18,0.22), 0 4px 10px rgba(2,18,18,0.12)",
          }}
        >
          {/* Foto de fundo — mesmo arquivo do hero da vistoria (banner.png):
              técnico Nansen instalando equipamento no poste, sem nenhum
              texto/rótulo de "vistoria" embutido na imagem — cabe igual
              aqui, tema de instalação até combina mais. */}
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
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              zIndex: 1,
              background:
                "linear-gradient(to right, rgba(3,22,22,0.97) 0%, rgba(3,22,22,0.93) 20%, " +
                "rgba(3,22,22,0.75) 36%, rgba(3,22,22,0.38) 52%, rgba(3,22,22,0.1) 66%, transparent 80%)",
            }}
          />
          <div
            className="absolute inset-x-0 top-0"
            style={{ height: "30%", zIndex: 2, background: "linear-gradient(to bottom, rgba(3,22,22,0.52) 0%, transparent 100%)" }}
          />
          <div
            className="absolute inset-x-0 bottom-0"
            style={{ height: "36%", zIndex: 2, background: "linear-gradient(to top, rgba(3,22,22,0.6) 0%, transparent 100%)" }}
          />
          <div
            className="pointer-events-none absolute"
            style={{
              right: -30,
              bottom: -30,
              width: 220,
              height: 220,
              zIndex: 3,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(0,200,150,0.16) 0%, rgba(0,200,150,0.05) 48%, transparent 68%)",
            }}
          />
          <div className="relative flex h-full flex-col justify-between" style={{ zIndex: 10 }}>
            <div
              className="w-fit rounded-full px-2.5 py-[5px] text-[8.5px] font-semibold uppercase"
              style={{
                background: "rgba(0,200,150,0.1)",
                color: "#5EFFD9",
                border: "1px solid rgba(0,200,150,0.2)",
                letterSpacing: "0.2em",
              }}
            >
              Instalação
            </div>
            <div>
              <div
                className="leading-none font-bold text-white"
                style={{ fontSize: 56, letterSpacing: "-3px", fontVariantNumeric: "tabular-nums" }}
              >
                {disponiveis !== null ? animatedDisponiveis : <Skeleton className="h-14 w-20 rounded-xl bg-white/10" />}
              </div>
              <p className="mt-1 text-[13.5px] font-medium" style={{ color: "rgba(255,255,255,0.52)" }}>
                Postes liberados pra instalação
              </p>
            </div>
          </div>
        </motion.div>

        {/* MUNICÍPIOS */}
        <InstalacaoMunicipioField municipios={municipios} loading={!carregado} />

        {/* STATS GRID — Resumo operacional */}
        <section>
          <p className="mb-3 px-0.5 text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#B0BAC5" }}>
            Resumo operacional
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {(Object.keys(STAT_META) as StatKey[]).map((key, i) => {
              const meta = STAT_META[key];
              const Icon = meta.icon;
              const value = valores[key];
              const series = value !== null ? mockTrend(value) : null;
              const max = Math.max(disponiveis ?? 1, andamento ?? 1, instaladas ?? 1, rejeitadas ?? 1, 1);
              const pct = value != null ? Math.min(100, (value / max) * 100) : 0;
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 * i + 0.1, ease: [0.22, 0.7, 0.2, 1] }}
                  whileHover={{ y: -2, transition: { duration: 0.2 } }}
                  className="group relative overflow-hidden rounded-[22px] p-[15px]"
                  style={{ background: "#fff", boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.07), 0 0 0 1px rgba(6,59,59,0.04)" }}
                >
                  <div
                    className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full blur-[24px] transition-opacity group-hover:opacity-100"
                    style={{ background: meta.pill, opacity: 0.85 }}
                  />

                  <div className="relative flex items-center justify-between">
                    <div
                      className={`flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-gradient-to-br ${meta.grad} shadow-sm`}
                      style={{ boxShadow: `0 4px 12px ${meta.hex}33` }}
                    >
                      <Icon className="h-[15px] w-[15px] text-white" strokeWidth={2.2} />
                    </div>
                  </div>

                  <p className="relative mt-[11px] text-[10.5px] font-semibold uppercase tracking-[0.13em]" style={{ color: "#A0ACBA" }}>
                    {meta.label}
                  </p>
                  <div className="relative mt-[2px] text-[28px] font-semibold leading-none tracking-[-0.5px] tabular-nums" style={{ color: "#063B3B" }}>
                    {value !== null ? value : <Skeleton className="mt-1 h-7 w-10 rounded-lg" />}
                  </div>

                  {series && (
                    <div className="relative mt-2 h-7 w-full opacity-90">
                      <Sparkline data={series} color={meta.hex} />
                    </div>
                  )}

                  {value !== null && (
                    <div className="relative mt-2 h-[3px] overflow-hidden rounded-full bg-black/[0.04]">
                      <motion.span
                        className={`block h-full rounded-full bg-gradient-to-r ${meta.grad}`}
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
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38, ease: [0.22, 0.7, 0.2, 1] }}>
          <p className="mb-3 px-0.5 text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#B0BAC5" }}>
            Acesso rápido
          </p>

          <Link href="/instalacao/mapa" className="block">
            <div
              className="flex items-center justify-between gap-3 rounded-[22px] p-4 transition active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg,#042828 0%,#063B3B 45%,#0A5252 100%)",
                boxShadow: "0 6px 24px rgba(6,59,59,0.28), 0 1px 0 rgba(255,255,255,0.06) inset",
              }}
            >
              <div className="flex items-center gap-3.5">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-[14px]"
                  style={{ background: "rgba(0,179,136,0.16)", border: "1px solid rgba(0,179,136,0.25)" }}
                >
                  <MapIcon className="h-5 w-5" style={{ color: "#5EFFD9" }} strokeWidth={1.8} />
                </span>
                <div>
                  <p className="text-[15px] font-semibold tracking-[-0.2px] text-white">Mapa operacional</p>
                  <p className="text-[11.5px]" style={{ color: "rgba(255,255,255,0.42)" }}>
                    Postes liberados em tempo real
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-5 w-5 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} strokeWidth={1.8} />
            </div>
          </Link>

          <Link href="/instalacao/mapa?view=list" className="mt-2.5 block">
            <div
              className="flex items-center gap-3.5 rounded-[22px] p-4 transition active:scale-[0.98]"
              style={{ background: "#fff", boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.07)", border: "1px solid rgba(6,59,59,0.055)" }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px]" style={{ background: "#EEF2FF" }}>
                <ClipboardList className="h-[18px] w-[18px]" style={{ color: "#6366F1" }} strokeWidth={1.8} />
              </span>
              <div>
                <p className="text-[13.5px] font-semibold tracking-[-0.1px]" style={{ color: "#063B3B" }}>
                  Lista de instalações
                </p>
                <p className="mt-[2px] text-[11px]" style={{ color: "#A0ACBA" }}>
                  Filtrar e buscar
                </p>
              </div>
            </div>
          </Link>
        </motion.section>
      </main>

      <InstalacaoBottomNav />
    </div>
  );
}
