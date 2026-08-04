"use client";

/**
 * Home do módulo de Instalação — espelha a estrutura da tela inicial da
 * vistoria (saudação, card em destaque, grid de números, acesso rápido,
 * nav inferior), com dados e rotas exclusivos deste módulo. Não reaproveita
 * src/app/dashboard/page.tsx nem seus componentes — só o hook de sessão e
 * os primitivos genéricos (Skeleton).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight, ClipboardList, Map as MapIcon, Wrench } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { InstalacaoBottomNav } from "@/components/instalacoes/InstalacaoBottomNav";
import { useInstalacoesStore } from "@/store/instalacoes";
import { useAuthStore } from "@/store/auth";

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

export default function InstalacaoHomePage() {
  const router = useRouter();
  const { hydrated, session } = useAuthStore();
  const { items, loading, fetchAll } = useInstalacoesStore();
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
    if (session) void fetchAll();
  }, [session, fetchAll]);

  const meuUserId = Number(session?.tecnico.id ?? 0);
  const carregado = !loading && session != null;
  const disponiveis = carregado ? items.filter((i) => i.statusGeralId === STATE_LIBERADO).length : null;
  const minhas = carregado
    ? items.filter((i) => i.statusGeralId === STATE_EM_INSTALACAO && i.instalador?.id === meuUserId).length
    : null;
  const animatedDisponiveis = useCountUp(disponiveis, 1200);

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
            height: 200,
            borderRadius: 28,
            background: "linear-gradient(135deg, #021818 0%, #031E1E 35%, #052E2E 65%, #073838 100%)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.06) inset, 0 -1px 0 rgba(0,0,0,0.28) inset, " +
              "0 0 0 1px rgba(0,200,150,0.08), 0 12px 32px rgba(2,18,18,0.22), 0 4px 10px rgba(2,18,18,0.12)",
          }}
        >
          <div
            className="pointer-events-none absolute"
            style={{
              right: -30,
              bottom: -30,
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(0,200,150,0.16) 0%, rgba(0,200,150,0.05) 48%, transparent 68%)",
            }}
          />
          <div className="relative flex h-full flex-col justify-between">
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

        {/* STATS GRID */}
        <section>
          <p className="mb-3 px-0.5 text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#B0BAC5" }}>
            Resumo
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <div
              className="rounded-[22px] p-[15px]"
              style={{ background: "#fff", boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.07)" }}
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em]" style={{ color: "#A0ACBA" }}>
                Disponíveis
              </p>
              <div className="mt-[2px] text-[28px] font-semibold leading-none tracking-[-0.5px] tabular-nums" style={{ color: "#063B3B" }}>
                {disponiveis !== null ? disponiveis : <Skeleton className="mt-1 h-7 w-10 rounded-lg" />}
              </div>
            </div>
            <div
              className="rounded-[22px] p-[15px]"
              style={{ background: "#fff", boxShadow: "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.07)" }}
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em]" style={{ color: "#A0ACBA" }}>
                Minhas em andamento
              </p>
              <div className="mt-[2px] text-[28px] font-semibold leading-none tracking-[-0.5px] tabular-nums" style={{ color: "#063B3B" }}>
                {minhas !== null ? minhas : <Skeleton className="mt-1 h-7 w-10 rounded-lg" />}
              </div>
            </div>
          </div>
        </section>

        {/* QUICK ACTIONS */}
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, ease: [0.22, 0.7, 0.2, 1] }}>
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
