"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CloudOff,
  Map,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wrench,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuthStore } from "@/store/auth";
import { vistoriasService } from "@/services/vistorias";
import type { DashboardStats } from "@/types";

const STAT_CARDS = [
  {
    key: "pendentes" as const,
    label: "Pendentes",
    icon: Activity,
    accent: "bg-brand-amber/15 text-[#8a5a00]",
    ring: "from-brand-amber/30 to-brand-amber/0",
  },
  {
    key: "emCampo" as const,
    label: "Em campo",
    icon: Radio,
    accent: "bg-blue-100 text-blue-600",
    ring: "from-blue-200/40 to-blue-200/0",
  },
  {
    key: "concluidas" as const,
    label: "Concluídas",
    icon: CheckCircle2,
    accent: "bg-brand-emerald/15 text-brand-emerald",
    ring: "from-brand-emerald/30 to-brand-emerald/0",
  },
  {
    key: "reprovadas" as const,
    label: "Reprovadas",
    icon: ShieldAlert,
    accent: "bg-red-100 text-red-500",
    ring: "from-red-200/40 to-red-200/0",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const { hydrated, session, logout } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (hydrated && !session) router.replace("/login");
  }, [hydrated, session, router]);

  useEffect(() => {
    let alive = true;
    vistoriasService.fetchDashboardStats().then((data) => {
      if (alive) setStats(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    const data = await vistoriasService.fetchDashboardStats();
    setStats(data);
    setRefreshing(false);
  };

  const tecnicoNome = session?.tecnico.nome ?? "Técnico";
  const firstName = tecnicoNome.split(" ")[0] ?? tecnicoNome;

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-brand-ice pb-24">
      <AppHeader
        title={`Olá, ${firstName}`}
        subtitle={session?.tecnico.email ?? "Conectando…"}
        right={
          <button
            type="button"
            onClick={logout}
            className="hidden h-10 items-center gap-1.5 rounded-2xl border border-brand-steel bg-white px-3 text-xs font-semibold text-ink-muted shadow-soft hover:text-ink sm:inline-flex"
          >
            Sair
          </button>
        }
      />

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-4">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-3xl bg-grad-deep p-5 text-white shadow-elev"
        >
          <div
            aria-hidden
            className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand-emerald/30 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-brand-amber/25 blur-3xl"
          />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                <Sparkles className="h-3 w-3" />
                Field Ops
              </span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                {stats?.total ?? "—"} vistorias atribuídas
              </h2>
              <p className="mt-1 text-sm text-white/70">
                Última sincronização{" "}
                {stats
                  ? new Date(stats.ultimaSincronizacao).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 text-white transition hover:bg-white/20"
              aria-label="Atualizar"
            >
              <RefreshCw
                className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          <Link href="/vistorias" className="mt-5 block">
            <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold backdrop-blur transition hover:bg-white/15">
              <span className="inline-flex items-center gap-2">
                <Map className="h-4 w-4" />
                Abrir mapa operacional
              </span>
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        </motion.section>

        <section className="grid grid-cols-2 gap-3">
          {STAT_CARDS.map(({ key, label, icon: Icon, accent, ring }, idx) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * idx + 0.05 }}
            >
              <Card className="relative overflow-hidden">
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${ring} blur-2xl`}
                />
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  {label}
                </p>
                <p className="mt-1 text-[26px] font-semibold tracking-tight text-ink">
                  {stats ? stats[key] : <Skeleton className="h-8 w-12" />}
                </p>
              </Card>
            </motion.div>
          ))}
        </section>

        <section className="space-y-3">
          <header className="flex items-center justify-between px-1">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Atalhos
            </h3>
          </header>
          <div className="grid grid-cols-1 gap-3">
            <Link href="/vistorias">
              <Card className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-emerald/15 text-brand-emerald">
                    <Map className="h-5 w-5" />
                  </span>
                  <div>
                    <h4 className="text-[15px] font-semibold tracking-tight text-ink">
                      Vistorias no mapa
                    </h4>
                    <p className="text-xs text-ink-muted">
                      Visualize todas as ordens próximas em tempo real
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-ink-muted" />
              </Card>
            </Link>
            <Card className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-deep/8 text-brand-deep">
                  <Wrench className="h-5 w-5" />
                </span>
                <div>
                  <h4 className="text-[15px] font-semibold tracking-tight text-ink">
                    Equipamentos GLPI
                  </h4>
                  <p className="text-xs text-ink-muted">
                    Consulte fichas técnicas vinculadas
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-brand-amber/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a5a00]">
                Em breve
              </span>
            </Card>
            <Card className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                  <CloudOff className="h-5 w-5" />
                </span>
                <div>
                  <h4 className="text-[15px] font-semibold tracking-tight text-ink">
                    Modo offline
                  </h4>
                  <p className="text-xs text-ink-muted">
                    Capture vistorias sem conexão e sincronize depois
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline">
                Ativar
              </Button>
            </Card>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
