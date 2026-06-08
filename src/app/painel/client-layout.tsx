"use client";

/**
 * Layout do /painel — Centro Operacional Geoespacial.
 *
 * Tema dark premium: sidebar vidro escuro, topbar translúcida, acento esmeralda.
 * Role guard: técnico → /painel/login. Sem sessão → /painel/login.
 */

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Activity,
  Bell,
  ChevronRight,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  RotateCw,
  Search,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { asset } from "@/utils/asset";
import { cn } from "@/utils/cn";

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: typeof Activity;
  exact?: boolean;
}> = [
  { href: "/painel", label: "Operação", icon: LayoutDashboard, exact: true },
  { href: "/painel/mapa", label: "Mapa Tempo Real", icon: MapIcon },
  { href: "/painel/vistorias", label: "Fila de Vistorias", icon: ClipboardList },
  { href: "/painel/revisitas", label: "Central de Revisitas", icon: RotateCw },
  { href: "/painel/tecnicos", label: "Técnicos", icon: Users },
  { href: "/painel/auditoria", label: "Auditoria", icon: ShieldAlert },
  { href: "/painel/historico", label: "Histórico", icon: History },
  { href: "/painel/configuracoes", label: "Configurações", icon: Settings },
];

function initials(nome: string): string {
  const p = nome.trim().split(/[\s._-]+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase();
}

export default function PainelClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { hydrated, session, logout } = useAuthStore();

  useEffect(() => {
    if (!hydrated) return;
    if (!session) { router.replace("/painel/login"); return; }
    if (session.role !== "admin") router.replace("/painel/login");
  }, [hydrated, session, router]);

  if (pathname === "/painel/login") return <>{children}</>;
  if (!hydrated) return null;
  if (!session || session.role !== "admin") return null;

  const nome = session.tecnico.nome;

  return (
    <div
      className="relative flex min-h-[100dvh]"
      style={{ background: "#060D0D" }}
    >
      {/* glow ambiente esmeralda */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full blur-[100px]"
        style={{ background: "rgba(0,179,136,0.07)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-1/3 h-64 w-64 rounded-full blur-[120px]"
        style={{ background: "rgba(0,179,136,0.04)" }}
      />

      {/* ── SIDEBAR ─────────────────────────────────────────────── */}
      <aside
        className="relative z-20 flex h-[100dvh] w-[240px] flex-col"
        style={{
          background: "rgba(6,11,11,0.97)",
          backdropFilter: "saturate(160%) blur(24px)",
          WebkitBackdropFilter: "saturate(160%) blur(24px)",
          borderRight: "1px solid rgba(0,200,150,0.07)",
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(145deg, #00C99B 0%, #00875F 100%)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.25) inset, 0 6px 20px rgba(0,179,136,0.35)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset("/logo_favicon.PNG")}
              alt="VistoMap"
              className="h-5 w-5 object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </span>
          <div className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight" style={{ color: "#C8E8E4" }}>
              VistoMap
            </span>
            <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "#00B388" }}>
              Central Op. GIOC
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3">
          <p
            className="mb-2 mt-1 px-3 text-[9px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "#1E4040" }}
          >
            Operação
          </p>
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn("group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all")}
                    style={
                      active
                        ? {
                            background: "rgba(0,179,136,0.13)",
                            boxShadow: "0 0 0 1px rgba(0,179,136,0.25), 0 1px 0 rgba(255,255,255,0.04) inset",
                            color: "#00D4A0",
                          }
                        : { color: "#3E6060" }
                    }
                    onMouseEnter={(e) => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = "";
                    }}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active-indicator-dark"
                        className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                        style={{ background: "linear-gradient(180deg, #00D4A0, #00875F)" }}
                      />
                    )}
                    <Icon
                      className="h-[15px] w-[15px] shrink-0"
                      strokeWidth={active ? 2.2 : 1.8}
                      style={{ color: active ? "#00B388" : "#2A5050" }}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {active && (
                      <ChevronRight className="h-3 w-3 opacity-40" strokeWidth={2.2} />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User pill */}
        <div className="p-3" style={{ borderTop: "1px solid rgba(0,200,150,0.06)" }}>
          <div
            className="flex items-center gap-2.5 rounded-xl p-2"
            style={{ background: "rgba(0,200,150,0.05)" }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
              style={{
                background: "linear-gradient(145deg, #00B388 0%, #00875F 100%)",
                boxShadow: "0 4px 12px rgba(0,179,136,0.30)",
                letterSpacing: "0.04em",
              }}
            >
              {initials(nome)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold tracking-tight" style={{ color: "#C0DCDA" }}>
                {nome.split(/[\s._-]+/)[0]}
              </p>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#00B388" }}>
                Administrador
              </p>
            </div>
            <button
              type="button"
              onClick={() => { logout(); router.replace("/painel/login"); }}
              title="Sair"
              className="flex h-7 w-7 items-center justify-center rounded-lg transition"
              style={{ color: "#2A5050" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── COLUNA PRINCIPAL ─────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header
          className="sticky top-0 z-10 flex h-14 items-center gap-4 px-6"
          style={{
            background: "rgba(4,9,9,0.92)",
            backdropFilter: "saturate(160%) blur(24px)",
            WebkitBackdropFilter: "saturate(160%) blur(24px)",
            borderBottom: "1px solid rgba(0,200,150,0.06)",
          }}
        >
          <div
            className="flex h-9 max-w-md flex-1 items-center gap-2 rounded-xl px-3"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "#2A5050" }} strokeWidth={2.2} />
            <input
              type="search"
              placeholder="Buscar vistoria, equipamento, técnico, município…"
              className="flex-1 bg-transparent text-[12.5px] font-medium outline-none"
              style={{ color: "#C0D8D8" }}
            />
            <kbd className="hidden text-[9px] font-semibold uppercase tracking-[0.14em] sm:inline-block" style={{ color: "#1E4040" }}>
              ⌘K
            </kbd>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Ao vivo */}
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{
                background: "rgba(0,179,136,0.08)",
                border: "1px solid rgba(0,179,136,0.18)",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: "#00B388",
                  boxShadow: "0 0 8px rgba(0,179,136,0.8)",
                  animation: "vmPulse 2s ease-in-out infinite",
                }}
              />
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#00B388" }}>
                Ao vivo
              </span>
            </div>

            <button
              type="button"
              className="relative flex h-8 w-8 items-center justify-center rounded-lg transition"
              style={{ color: "#2A5050" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
            >
              <Bell className="h-4 w-4" />
              <span
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: "#F59E0B", boxShadow: "0 0 0 2px #040909" }}
              />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          {children}
        </main>
      </div>

      <style>{`
        @keyframes vmPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
