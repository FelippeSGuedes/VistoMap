"use client";

/**
 * /perfil — Perfil enriquecido do técnico.
 * Avatar grande, nome real (firstname+realname do GLPI), cargo, equipe,
 * município operacional, status, KPIs pessoais, logout.
 */

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ArrowLeft,
  Award,
  Briefcase,
  Building2,
  CheckCircle2,
  Compass,
  LogOut,
  Mail,
  MapPin,
  RotateCw,
  Settings,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { BottomNav } from "@/components/layout/BottomNav";
import { useAuthStore } from "@/store/auth";
import { MOCK_PROFILE } from "@/utils/mock";
import { useState } from "react";
import { api } from "@/services/api";

interface ProfileApi {
  tecnico: { id: string; nome: string; email: string; matricula: string | null };
  cargo: string;
  equipe: string;
  grupos: string[];
  municipioOperacional: string | null;
  statusOperacional: "em-expediente" | "pausa" | "fora-expediente";
  kpis: {
    vistoriasConcluidas: number;
    revisitas: number;
    aprovadas: number;
    distanciaKm: number;
    diasAtivos: number;
  };
}

// Mapeia o status do API pro shape esperado pelo STATUS_LABELS deste arquivo
function mapStatusToLabel(
  s: ProfileApi["statusOperacional"]
): "em-campo" | "base" | "off-shift" {
  if (s === "em-expediente") return "em-campo";
  if (s === "pausa") return "base";
  return "off-shift";
}

function initials(nome: string) {
  const p = nome.trim().split(/[\s._-]+/);
  const a = p[0]?.[0] ?? "";
  const b = p[1]?.[0] ?? p[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

function firstNameOf(nome: string): string {
  const first = nome.trim().split(/[\s._-]+/)[0] ?? nome;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

const STATUS_LABELS = {
  "em-campo": { label: "Em campo", color: "#00B388", bg: "rgba(0,179,136,0.14)" },
  base: { label: "Na base", color: "#6366F1", bg: "rgba(99,102,241,0.14)" },
  "off-shift": { label: "Fora de plantão", color: "#9CA3AF", bg: "rgba(156,163,175,0.14)" },
} as const;

export default function PerfilPage() {
  const router = useRouter();
  const { hydrated, session, logout } = useAuthStore();

  useEffect(() => {
    if (hydrated && !session) router.replace("/login");
  }, [hydrated, session, router]);

  const [realProfile, setRealProfile] = useState<ProfileApi | null>(null);
  useEffect(() => {
    if (!session?.token) return;
    let alive = true;
    api
      .get<ProfileApi>("/perfil")
      .then((r) => {
        if (alive) setRealProfile(r.data);
      })
      .catch((err) => {
        console.warn("[/perfil] fallback mock:", err);
      });
    return () => {
      alive = false;
    };
  }, [session?.token]);

  const profile = MOCK_PROFILE;
  // Prefere realProfile (do backend) sobre session sobre mock.
  const nome = realProfile?.tecnico.nome ?? session?.tecnico.nome ?? profile.tecnico.nome;
  const email = realProfile?.tecnico.email ?? session?.tecnico.email ?? profile.tecnico.email;
  const matricula =
    realProfile?.tecnico.matricula ?? session?.tecnico.matricula ?? profile.tecnico.matricula;
  const cargo = realProfile?.cargo ?? profile.cargo;
  const equipe = realProfile?.equipe ?? equipe;
  const municipioOperacional =
    realProfile?.municipioOperacional ?? municipioOperacional ?? "—";
  const kpis = realProfile?.kpis ?? kpis;
  const firstName = firstNameOf(nome);
  const statusKey = realProfile
    ? mapStatusToLabel(realProfile.statusOperacional)
    : profile.statusOperacional;
  const status = STATUS_LABELS[statusKey];

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
            VistoMap · Field Ops
          </p>
          <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "#063B3B" }}>
            Perfil
          </h1>
        </div>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-ink-muted shadow-soft transition active:scale-95"
          title="Configurações"
        >
          <Settings className="h-4 w-4" />
        </button>
      </motion.header>

      <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-5 px-4 pb-32 pt-4">
        {/* HERO PERFIL — avatar + nome + cargo */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 0.7, 0.2, 1] }}
          className="relative overflow-hidden rounded-[28px] p-6 text-white"
          style={{
            background:
              "linear-gradient(135deg, #021F1F 0%, #042B2B 40%, #073838 100%)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.07) inset, 0 14px 36px rgba(2,18,18,0.22), 0 4px 10px rgba(2,18,18,0.12)",
          }}
        >
          {/* glows */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full blur-[40px]"
            style={{ background: "rgba(0,200,150,0.3)" }}
            animate={{ opacity: [0.5, 0.85, 0.5] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-10 -left-10 h-44 w-44 rounded-full blur-[44px]"
            style={{ background: "rgba(255,210,140,0.14)" }}
          />
          {/* highlight superior */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background:
                "linear-gradient(to right, transparent, rgba(0,200,150,0.55), transparent)",
            }}
          />

          <div className="relative flex items-start gap-4">
            {/* Avatar com initials premium */}
            <div className="relative">
              <div
                className="flex h-[68px] w-[68px] items-center justify-center rounded-[20px] text-[24px] font-bold tracking-[0.04em] text-white"
                style={{
                  background:
                    "linear-gradient(145deg, #00B388 0%, #00875F 100%)",
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 16px rgba(0,179,136,0.4), 0 0 0 3px rgba(0,200,150,0.18)",
                }}
              >
                {initials(nome)}
              </div>
              {/* status dot */}
              <span
                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full"
                style={{
                  background: status.color,
                  boxShadow: "0 0 0 3px #021F1F, 0 0 0 4px " + status.color + "55",
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.18em]"
                style={{
                  background: status.bg,
                  color: "#5EFFD9",
                  border: "1px solid rgba(0,200,150,0.28)",
                }}
              >
                <Sparkles className="h-2.5 w-2.5" />
                {status.label}
              </span>
              <h2
                className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.5px] text-white"
                style={{ textShadow: "0 0 20px rgba(0,200,150,0.18)" }}
              >
                {firstName}
              </h2>
              <p className="mt-0.5 truncate text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
                {cargo}
              </p>
            </div>
          </div>

          {/* Linha de info */}
          <div className="relative mt-4 grid grid-cols-2 gap-2">
            <InfoChip icon={<Building2 className="h-3 w-3" />} label="Município op." value={municipioOperacional ?? "—"} />
            <InfoChip icon={<Users className="h-3 w-3" />} label="Equipe" value={equipe} />
          </div>
        </motion.section>

        {/* KPIs pessoais */}
        <section>
          <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#B0BAC5" }}>
            Sua performance
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <KpiCard
              icon={CheckCircle2}
              label="Vistorias concluídas"
              value={kpis.vistoriasConcluidas}
              hex="#00B388"
              pill="#ECFDF5"
            />
            <KpiCard
              icon={ShieldCheck}
              label="Aprovadas"
              value={kpis.aprovadas}
              hex="#00B388"
              pill="#ECFDF5"
            />
            <KpiCard
              icon={RotateCw}
              label="Revisitas"
              value={kpis.revisitas}
              hex="#F59E0B"
              pill="#FEF3C7"
            />
            <KpiCard
              icon={Compass}
              label="Quilometragem"
              value={`${kpis.distanciaKm} km`}
              hex="#6366F1"
              pill="#EEF2FF"
            />
          </div>
          <div className="mt-2.5">
            <KpiCard
              icon={Award}
              label="Dias ativos na operação"
              value={kpis.diasAtivos}
              hex="#00B388"
              pill="#ECFDF5"
              wide
            />
          </div>
        </section>

        {/* Identificação técnica */}
        <section>
          <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#B0BAC5" }}>
            Identificação
          </p>
          <div
            className="space-y-px overflow-hidden rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.9)",
              boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 3px rgba(6,59,59,0.04)",
              border: "1px solid rgba(6,59,59,0.05)",
            }}
          >
            <InfoRow icon={<UserIcon className="h-4 w-4" />} label="Nome" value={nome} />
            <InfoRow icon={<Mail className="h-4 w-4" />} label="E-mail" value={email || "—"} mono />
            <InfoRow
              icon={<Briefcase className="h-4 w-4" />}
              label="Matrícula"
              value={matricula || "—"}
              mono
            />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Município" value={municipioOperacional ?? "—"} />
          </div>
        </section>

        {/* Conectividade */}
        <ConectividadeCard />

        {/* SAIR */}
        <button
          type="button"
          onClick={() => {
            logout();
            router.push("/login");
          }}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-semibold tracking-tight text-red-600 transition active:scale-[0.98]"
          style={{
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.18)",
          }}
        >
          <LogOut className="h-4 w-4" />
          Sair da conta
        </button>

        <p className="text-center text-[10px] font-medium" style={{ color: "#A0ACBA" }}>
          VistoMap · v0.1.0
        </p>
      </main>

      <BottomNav />
    </div>
  );
}

/* ── sub-componentes ───────────────────────────────────────────────── */

function InfoChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
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
        <p className="truncate text-[12px] font-semibold tracking-tight text-white leading-none">
          {value}
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hex,
  pill,
  wide,
}: {
  icon: typeof Award;
  label: string;
  value: number | string;
  hex: string;
  pill: string;
  wide?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-[20px] p-3.5 ${wide ? "col-span-full" : ""}`}
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
        {value}
      </div>
    </motion.div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-white px-4 py-2.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
        style={{ background: "rgba(6,59,59,0.05)", color: "#7A8896" }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em]" style={{ color: "#A0ACBA" }}>
          {label}
        </p>
        <p
          className={`mt-0.5 truncate text-[13px] font-medium ${mono ? "font-mono tabular-nums" : ""}`}
          style={{ color: "#063B3B" }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function ConectividadeCard() {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl p-3"
      style={{
        background: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(6,59,59,0.05)",
        boxShadow: "0 1px 3px rgba(6,59,59,0.04)",
      }}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-xl"
        style={{ background: "rgba(0,179,136,0.14)", color: "#00B388" }}
      >
        <Wifi className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em]" style={{ color: "#A0ACBA" }}>
          Conexão operacional
        </p>
        <p className="mt-0.5 text-[13px] font-semibold tracking-tight" style={{ color: "#063B3B" }}>
          Online · sincronizado
        </p>
      </div>
      <span
        className="flex h-2 w-2 rounded-full"
        style={{
          background: "#00B388",
          boxShadow: "0 0 0 3px rgba(0,179,136,0.18)",
        }}
      />
    </div>
  );
}
