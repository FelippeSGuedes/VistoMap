"use client";

/**
 * Layout do /painel — central operacional administrativa.
 *
 * Identidade visual alinhada ao app mobile: fundo branco gelo, cinzas
 * sofisticados, acento esmeralda. Glassmorphism suave. Nada de dark/cyber.
 *
 * Estrutura: Sidebar 240px + Topbar (busca, ao vivo, sino, user) + Outlet
 * Role guard: técnico → /dashboard. Sem sessão → /painel/login.
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
    if (!session) {
      router.replace("/painel/login");
      return;
    }
    // Técnico sem permissão de admin: manda para /painel/login
    // (e não /dashboard) para que possa re-autenticar com conta admin.
    if (session.role !== "admin") {
      router.replace("/painel/login");
    }
  }, [hydrated, session, router]);

  if (pathname === "/painel/login") return <>{children}</>;
  if (!hydrated) return null;
  if (!session || session.role !== "admin") return null;

  const nome = session.tecnico.nome;

  return (
    <div
      className="relative flex min-h-[100dvh]"
      style={{
        background:
          "radial-gradient(ellipse 100% 60% at 50% -10%, #ECFDF5 0%, #F7F9FB 38%, #FFFFFF 100%)",
      }}
    >
      {/* glow ambient esmeralda no canto sup esquerdo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-20 h-80 w-80 rounded-full blur-[80px]"
        style={{ background: "rgba(0,179,136,0.10)" }}
      />

      {/* ── SIDEBAR ───────────────────────────────────────────────── */}
      <aside
        className="relative z-20 flex h-[100dvh] w-[240px] flex-col"
        style={{
          background: "rgba(255,255,255,0.78)",
          backdropFilter: "saturate(180%) blur(22px)",
          WebkitBackdropFilter: "saturate(180%) blur(22px)",
          borderRight: "1px solid rgba(6,59,59,0.06)",
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(145deg, #00C99B 0%, #00875F 100%)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.4) inset, 0 6px 16px rgba(0,179,136,0.28)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset("/logo_favicon.PNG")}
              alt="VistoMap"
              className="h-5 w-5"
              style={{ objectFit: "contain" }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </span>
          <div className="flex flex-col leading-none">
            <span
              className="text-[15px] font-semibold tracking-tight"
              style={{ color: "#063B3B" }}
            >
              VistoMap
            </span>
            <span
              className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "#00B388" }}
            >
              Central Op. GIOC
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3">
          <p
            className="mb-2 mt-2 px-3 text-[9px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "#A0ACBA" }}
          >
            Operação
          </p>
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all"
                    )}
                    style={
                      active
                        ? {
                            background:
                              "linear-gradient(135deg, rgba(0,179,136,0.12), rgba(0,179,136,0.04))",
                            boxShadow:
                              "0 1px 0 rgba(255,255,255,0.5) inset, 0 0 0 1px rgba(0,179,136,0.22)",
                            color: "#063B3B",
                          }
                        : { color: "#566773" }
                    }
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active-indicator-light"
                        className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                        style={{
                          background:
                            "linear-gradient(180deg, #00C99B, #00875F)",
                        }}
                      />
                    )}
                    <Icon
                      className="h-[15px] w-[15px]"
                      strokeWidth={active ? 2.2 : 1.8}
                      style={{ color: active ? "#00B388" : "#7A8896" }}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {active && (
                      <ChevronRight
                        className="h-3 w-3 opacity-60"
                        strokeWidth={2.2}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User pill */}
        <div className="border-t border-black/[0.04] p-3">
          <div
            className="flex items-center gap-2.5 rounded-xl p-2"
            style={{ background: "rgba(6,59,59,0.04)" }}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold text-white"
              style={{
                background:
                  "linear-gradient(145deg, #00B388 0%, #00875F 100%)",
                boxShadow: "0 4px 12px rgba(0,179,136,0.28)",
                letterSpacing: "0.04em",
              }}
            >
              {initials(nome)}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-[12px] font-semibold tracking-tight"
                style={{ color: "#063B3B" }}
              >
                {nome.split(/[\s._-]+/)[0]}
              </p>
              <p
                className="text-[9.5px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "#00B388" }}
              >
                Administrador
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/painel/login");
              }}
              title="Sair"
              className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-black/[0.05]"
              style={{ color: "#7A8896" }}
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
            background: "rgba(255,255,255,0.74)",
            backdropFilter: "saturate(180%) blur(22px)",
            WebkitBackdropFilter: "saturate(180%) blur(22px)",
            borderBottom: "1px solid rgba(6,59,59,0.05)",
          }}
        >
          <div
            className="flex h-9 max-w-md flex-1 items-center gap-2 rounded-xl px-3"
            style={{
              background: "rgba(247,249,251,0.85)",
              border: "1px solid rgba(6,59,59,0.06)",
            }}
          >
            <Search className="h-3.5 w-3.5" style={{ color: "#A0ACBA" }} strokeWidth={2.2} />
            <input
              type="search"
              placeholder="Buscar vistoria, equipamento, técnico, município…"
              className="flex-1 bg-transparent text-[12.5px] font-medium outline-none"
              style={{ color: "#063B3B" }}
            />
            <kbd
              className="hidden text-[9px] font-semibold uppercase tracking-[0.14em] sm:inline-block"
              style={{ color: "#A0ACBA" }}
            >
              ⌘K
            </kbd>
          </div>

          <div className="flex items-center gap-1.5">
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{
                background: "rgba(0,179,136,0.10)",
                border: "1px solid rgba(0,179,136,0.22)",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: "#00B388",
                  boxShadow: "0 0 6px rgba(0,179,136,0.6)",
                }}
              />
              <span
                className="text-[9.5px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: "#00875F" }}
              >
                Ao vivo
              </span>
            </div>

            <button
              type="button"
              className="relative flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-black/[0.04]"
              style={{ color: "#566773" }}
            >
              <Bell className="h-4 w-4" />
              <span
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                style={{
                  background: "#F59E0B",
                  boxShadow: "0 0 0 2px #fff",
                }}
              />
            </button>
          </div>
        </header>

        <main
          className="flex-1 overflow-y-auto px-6 py-6"
          style={{ background: "transparent" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
