"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Moon,
  RotateCw,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { asset } from "@/utils/asset";

const NAV = [
  { href: "/painel",             label: "Operação",           icon: LayoutDashboard, exact: true },
  { href: "/painel/mapa",        label: "Mapa Tempo Real",    icon: MapIcon },
  { href: "/painel/vistorias",   label: "Fila de Vistorias",  icon: ClipboardList },
  { href: "/painel/revisitas",   label: "Central de Revisitas", icon: RotateCw },
  { href: "/painel/tecnicos",    label: "Técnicos",           icon: Users },
  { href: "/painel/auditoria",   label: "Auditoria",          icon: ShieldAlert },
  { href: "/painel/historico",   label: "Histórico",          icon: History },
  { href: "/painel/configuracoes", label: "Configurações",    icon: Settings },
];

function initials(nome: string) {
  const p = nome.trim().split(/[\s._-]+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase();
}

// Tokens de tema centralizados
const LIGHT = {
  shell:        "#EFF1F5",
  sidebar:      "#FFFFFF",
  topbar:       "#FFFFFF",
  border:       "#E8EAED",
  text:         "#111827",
  textMuted:    "#9CA3AF",
  navActive:    "#F0FDF9",
  navActiveTxt: "#064E3B",
  navInactive:  "#6B7280",
  badge:        "#FFFFFF",
  search:       "#F8F9FB",
  avatarRing:   "#FFFFFF",
} as const;

const DARK = {
  shell:        "#111318",
  sidebar:      "#1A1F2E",
  topbar:       "#1A1F2E",
  border:       "rgba(255,255,255,0.07)",
  text:         "#E2E8F0",
  textMuted:    "#718096",
  navActive:    "rgba(0,185,136,0.12)",
  navActiveTxt: "#4EEDC4",
  navInactive:  "#8B9DBF",
  badge:        "#1A1F2E",
  search:       "rgba(255,255,255,0.06)",
  avatarRing:   "#1A1F2E",
} as const;

export default function PainelClientLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { hydrated, session, logout } = useAuthStore();

  const [isDark, setIsDark] = useState(false);
  useEffect(() => { setIsDark(localStorage.getItem("vm_painel_theme") === "dark"); }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem("vm_painel_theme", next ? "dark" : "light");
  };

  useEffect(() => {
    if (!hydrated) return;
    if (!session || session.role !== "admin") router.replace("/painel/login");
  }, [hydrated, session, router]);

  if (pathname === "/painel/login") return <>{children}</>;
  if (!hydrated) return null;
  if (!session || session.role !== "admin") return null;

  const T = isDark ? DARK : LIGHT;
  const isMapaPage = pathname === "/painel/mapa";
  const isCommandPage = pathname === "/painel";
  const nome = session.tecnico.nome;

  return (
    <div className="flex h-[100dvh] overflow-hidden" style={{ background: T.shell }}>

      {/* ── SIDEBAR ─────────────────────────────────────────────── */}
      <aside
        className="flex h-full w-[220px] shrink-0 flex-col"
        style={{
          background: T.sidebar,
          borderRight: `1px solid ${T.border}`,
          boxShadow: isDark ? "none" : "0 0 0 1px rgba(0,0,0,0.04), 2px 0 12px rgba(0,0,0,0.04)",
        }}
      >
        {/* Brand */}
        <div
          className="flex h-14 shrink-0 items-center gap-2.5 px-4"
          style={{ borderBottom: `1px solid ${T.border}` }}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(145deg,#00C99B 0%,#00875F 100%)",
              boxShadow: "0 2px 8px rgba(0,179,136,0.35)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset("/logo_favicon.PNG")}
              alt="VM"
              className="h-[18px] w-[18px] object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </span>
          <div className="leading-none">
            <div className="text-[13.5px] font-semibold" style={{ color: T.text }}>VistoMap</div>
            <div className="mt-[2px] text-[8.5px] font-bold uppercase tracking-[0.20em]" style={{ color: "#00B388" }}>
              Central GIOC
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <p
            className="mb-1.5 px-2.5 text-[9px] font-bold uppercase tracking-[0.22em]"
            style={{ color: T.textMuted }}
          >
            Menu
          </p>
          <ul className="space-y-[2px]">
            {NAV.map(({ href, label, icon: Icon, exact }) => {
              const active = exact
                ? pathname === href
                : pathname === href || pathname.startsWith(href + "/");
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className="relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium transition-colors duration-100"
                    style={{
                      background: active ? T.navActive : "transparent",
                      color: active ? T.navActiveTxt : T.navInactive,
                    }}
                  >
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-r-full"
                        style={{ background: "linear-gradient(180deg,#00C99B,#00875F)" }}
                      />
                    )}
                    <Icon
                      className="h-[14px] w-[14px] shrink-0"
                      strokeWidth={active ? 2.3 : 1.8}
                      style={{ color: active ? "#00B388" : T.navInactive }}
                    />
                    <span className="truncate">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User pill */}
        <div className="p-2.5" style={{ borderTop: `1px solid ${T.border}` }}>
          <div
            className="flex items-center gap-2.5 rounded-lg p-2"
            style={{ background: isDark ? "rgba(255,255,255,0.03)" : "#F8FAFB" }}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10.5px] font-bold text-white"
              style={{ background: "linear-gradient(145deg,#00B388,#00875F)", boxShadow: "0 2px 8px rgba(0,179,136,0.3)" }}
            >
              {initials(nome)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-semibold" style={{ color: T.text }}>
                {nome.split(/[\s._-]+/)[0]}
              </div>
              <div className="text-[8.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "#00B388" }}>
                Administrador
              </div>
            </div>
            <button
              type="button"
              onClick={() => { logout(); router.replace("/painel/login"); }}
              title="Sair"
              className="flex h-6 w-6 items-center justify-center rounded-md opacity-40 transition hover:opacity-80"
              style={{ color: T.navInactive }}
            >
              <LogOut className="h-3 w-3" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── COLUNA DIREITA ───────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col" style={{ background: T.shell }}>

        {/* Topbar */}
        <header
          className="flex h-14 shrink-0 items-center gap-3 px-5"
          style={{ background: T.topbar, borderBottom: `1px solid ${T.border}` }}
        >
          {/* Search */}
          <label
            className="flex h-8 flex-1 max-w-[380px] cursor-text items-center gap-2 rounded-lg px-3"
            style={{ background: T.search, border: `1px solid ${T.border}` }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: T.textMuted }} strokeWidth={2.2} />
            <input
              type="search"
              placeholder="Buscar vistoria, técnico, equipamento…"
              className="flex-1 bg-transparent text-[12px] font-medium outline-none placeholder:opacity-50"
              style={{ color: T.text }}
            />
          </label>

          <div className="ml-auto flex items-center gap-1">
            {/* Live pill */}
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-[5px]"
              style={{ background: "rgba(0,179,136,0.10)", border: "1px solid rgba(0,179,136,0.22)" }}
            >
              <span
                className="h-[7px] w-[7px] animate-pulse rounded-full"
                style={{ background: "#10B981", boxShadow: "0 0 0 2px rgba(16,185,129,0.25)" }}
              />
              <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "#059669" }}>
                Ao vivo
              </span>
            </div>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggle}
              title={isDark ? "Tema claro" : "Tema escuro"}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150"
              style={{ color: T.textMuted }}
            >
              {isDark ? <Sun className="h-[15px] w-[15px]" /> : <Moon className="h-[15px] w-[15px]" />}
            </button>

            {/* Bell */}
            <button
              type="button"
              className="relative flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ color: T.textMuted }}
            >
              <Bell className="h-[15px] w-[15px]" />
              <span
                className="absolute right-[7px] top-[7px] h-[7px] w-[7px] rounded-full bg-amber-400"
                style={{ boxShadow: `0 0 0 1.5px ${T.badge}` }}
              />
            </button>
          </div>
        </header>

        {/*
         * CONTEÚDO:
         * • Mapa → altura explícita + position relative para o absolute inset-0 funcionar
         * • Outros → flex-1 + overflow-y-auto com padding
         */}
        <main
          className={(isMapaPage || isCommandPage) ? "relative flex-1 min-h-0 overflow-hidden" : "flex-1 overflow-y-auto px-6 py-6"}
          style={{ background: T.shell }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
