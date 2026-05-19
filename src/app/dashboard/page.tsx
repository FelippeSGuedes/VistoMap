"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Map,
  Radio,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { BottomNav } from "@/components/layout/BottomNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuthStore } from "@/store/auth";
import { vistoriasService } from "@/services/vistorias";
import type { DashboardStats } from "@/types";

/* ─── helpers ──────────────────────────────────────────────────────────── */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function initials(nome: string) {
  const parts = nome.trim().split(" ");
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

/* ─── stat card config ─────────────────────────────────────────────────── */
const STAT_CARDS = [
  {
    key: "pendentes" as const,
    label: "Pendentes",
    icon: Activity,
    color: "#F59E0B",
    bg: "#FFFBEB",
    border: "#FDE68A",
  },
  {
    key: "emCampo" as const,
    label: "Em campo",
    icon: Radio,
    color: "#3B82F6",
    bg: "#EFF6FF",
    border: "#BFDBFE",
  },
  {
    key: "concluidas" as const,
    label: "Concluídas",
    icon: CheckCircle2,
    color: "#00B388",
    bg: "#ECFDF5",
    border: "#6EE7B7",
  },
  {
    key: "reprovadas" as const,
    label: "Reprovadas",
    icon: ShieldAlert,
    color: "#EF4444",
    bg: "#FEF2F2",
    border: "#FECACA",
  },
];

/* ─── page ─────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();
  const { hydrated, session, logout } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (hydrated && !session) router.replace("/login");
  }, [hydrated, session, router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const dn = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", dn);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", dn); };
  }, []);

  useEffect(() => {
    let alive = true;
    vistoriasService.fetchDashboardStats().then((d) => { if (alive) setStats(d); });
    return () => { alive = false; };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    const d = await vistoriasService.fetchDashboardStats();
    setStats(d);
    setRefreshing(false);
  };

  const tecnicoNome = session?.tecnico.nome ?? "Técnico";
  const firstName = tecnicoNome.split(" ")[0] ?? tecnicoNome;

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col pb-28"
      style={{ background: "#F7F9FB" }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="sticky top-0 z-40 flex items-center justify-between px-5 pb-3"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 16px)",
          background: "rgba(247,249,251,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(6,59,59,0.06)",
        }}
      >
        {/* greeting */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#00B388" }}>
            {greeting()}
          </p>
          <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "#063B3B" }}>
            {firstName}
          </h1>
        </div>

        {/* avatar + online badge */}
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-[7px] w-[7px] rounded-full"
            style={{ background: online ? "#00B388" : "#9CA3AF", boxShadow: online ? "0 0 0 3px rgba(0,179,136,0.2)" : "none" }}
          />
          <button
            type="button"
            onClick={logout}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-bold"
            style={{
              background: "linear-gradient(135deg,#063B3B 0%,#0D5C5C 100%)",
              color: "#fff",
              boxShadow: "0 2px 12px rgba(6,59,59,0.25)",
            }}
            title="Sair"
          >
            {initials(tecnicoNome)}
          </button>
        </div>
      </motion.header>

      <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-5 px-4 pt-4">

        {/* ── Hero Card ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 0.7, 0.2, 1] }}
          className="relative overflow-hidden"
          style={{ borderRadius: 28, boxShadow: "0 8px 32px rgba(6,59,59,0.18), 0 1px 0 rgba(255,255,255,0.6) inset" }}
        >
          {/* banner image */}
          <div className="relative h-[220px] w-full">
            <Image
              src="/banner.png"
              alt="Operação em campo"
              fill
              className="object-cover object-center"
              priority
            />
            {/* cinematic overlay */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(170deg, rgba(6,59,59,0.18) 0%, rgba(6,59,59,0.55) 55%, rgba(6,59,59,0.88) 100%)",
              }}
            />
          </div>

          {/* content over image */}
          <div className="absolute inset-0 flex flex-col justify-end p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div
                  className="mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em]"
                  style={{ background: "rgba(0,179,136,0.22)", color: "#7FFFD4", border: "1px solid rgba(0,179,136,0.3)" }}
                >
                  <Zap className="h-2.5 w-2.5" />
                  Field Operations
                </div>
                <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-white">
                  {stats ? (
                    <>{stats.total} <span className="text-[16px] font-normal text-white/70">vistorias</span></>
                  ) : (
                    <Skeleton className="h-7 w-24 bg-white/20" />
                  )}
                </h2>
                <p className="mt-0.5 text-[12px] text-white/55">
                  {stats
                    ? `Sincronizado ${new Date(stats.ultimaSincronizacao).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                    : "Carregando…"}
                </p>
              </div>

              {/* sync button */}
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[12px] font-semibold transition"
                style={{
                  background: refreshing ? "rgba(0,179,136,0.35)" : "rgba(0,179,136,0.9)",
                  color: "#fff",
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 4px 12px rgba(0,179,136,0.4)",
                  border: "1px solid rgba(0,179,136,0.5)",
                }}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Sincronizar
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── Stats grid ──────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3">
          {STAT_CARDS.map(({ key, label, icon: Icon, color, bg, border }, idx) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * idx + 0.1, ease: [0.22, 0.7, 0.2, 1] }}
              className="relative overflow-hidden rounded-3xl p-4"
              style={{
                background: "#fff",
                border: `1px solid ${border}`,
                boxShadow: "0 1px 3px rgba(6,59,59,0.05), 0 6px 20px rgba(6,59,59,0.06)",
              }}
            >
              {/* subtle glow top-right */}
              <div
                className="pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full blur-2xl"
                style={{ background: bg, opacity: 0.9 }}
              />
              <div
                className="relative flex h-9 w-9 items-center justify-center rounded-2xl"
                style={{ background: bg }}
              >
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
              <p
                className="relative mt-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "#9CA3AF" }}
              >
                {label}
              </p>
              <div
                className="relative mt-1 text-[28px] font-semibold tracking-tight"
                style={{ color: "#063B3B" }}
              >
                {stats ? stats[key] : <Skeleton className="h-7 w-10" />}
              </div>
              {/* mini trend badge */}
              {stats && (
                <div
                  className="absolute bottom-3.5 right-3.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                  style={{ background: bg, color }}
                >
                  <TrendingUp className="h-2.5 w-2.5" />
                  Hoje
                </div>
              )}
            </motion.div>
          ))}
        </section>

        {/* ── Quick actions ────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
        >
          <p
            className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "#9CA3AF" }}
          >
            Atalhos
          </p>
          <div className="flex flex-col gap-2.5">

            {/* primary action */}
            <Link href="/vistorias">
              <div
                className="flex items-center justify-between gap-3 rounded-3xl p-4 transition active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg,#063B3B 0%,#0D5C5C 100%)",
                  boxShadow: "0 4px 20px rgba(6,59,59,0.22)",
                }}
              >
                <div className="flex items-center gap-3.5">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ background: "rgba(0,179,136,0.18)", border: "1px solid rgba(0,179,136,0.3)" }}
                  >
                    <Map className="h-5 w-5" style={{ color: "#7FFFD4" }} />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold tracking-tight text-white">
                      Mapa operacional
                    </p>
                    <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Todas as ordens em tempo real
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="h-5 w-5 shrink-0" style={{ color: "rgba(255,255,255,0.4)" }} />
              </div>
            </Link>

            {/* secondary actions row */}
            <div className="grid grid-cols-2 gap-2.5">
              <div
                className="flex flex-col gap-3 rounded-3xl p-4"
                style={{
                  background: "#fff",
                  border: "1px solid rgba(6,59,59,0.07)",
                  boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 6px 20px rgba(6,59,59,0.05)",
                }}
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-2xl"
                  style={{ background: "#EFF6FF" }}
                >
                  <Activity className="h-4.5 w-4.5 h-[18px] w-[18px]" style={{ color: "#3B82F6" }} />
                </span>
                <div>
                  <p className="text-[14px] font-semibold tracking-tight" style={{ color: "#063B3B" }}>
                    Vistorias
                  </p>
                  <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                    Lista completa
                  </p>
                </div>
              </div>

              <div
                className="flex flex-col gap-3 rounded-3xl p-4"
                style={{
                  background: "#fff",
                  border: "1px solid rgba(6,59,59,0.07)",
                  boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 6px 20px rgba(6,59,59,0.05)",
                }}
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-2xl"
                  style={{ background: "#F0FDF4" }}
                >
                  {online
                    ? <Wifi className="h-[18px] w-[18px]" style={{ color: "#00B388" }} />
                    : <WifiOff className="h-[18px] w-[18px]" style={{ color: "#9CA3AF" }} />}
                </span>
                <div>
                  <p className="text-[14px] font-semibold tracking-tight" style={{ color: "#063B3B" }}>
                    {online ? "Online" : "Offline"}
                  </p>
                  <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                    {online ? "Conectado" : "Sem conexão"}
                  </p>
                </div>
              </div>
            </div>

          </div>
        </motion.section>

      </main>

      <BottomNav />
    </div>
  );
}
