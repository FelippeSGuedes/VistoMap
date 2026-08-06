"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Ban,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  History,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCw,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  Undo2,
  Users,
  Wrench,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { asset } from "@/utils/asset";
import type { SessionRole } from "@/types";
import PainelAlertas from "@/components/painel/PainelAlertas";
import PainelWebPush from "@/components/painel/PainelWebPush";

// Escopo de acesso por papel — admin vê tudo; moderador é admin menos
// Cancelar (botão, não rota) e Status; leitura só as telas de visualização
// combinadas com o usuário (ver PAGE_ROLES abaixo para o guard de rota).
const ALL_ROLES: SessionRole[] = ["admin", "moderador", "leitura"];
const ADMIN_MOD: SessionRole[] = ["admin", "moderador"];
const ADMIN_ONLY: SessionRole[] = ["admin"];

// Items simples do nav (sem grupo)
const TOP_NAV = [
  { href: "/painel",                label: "Operação",        icon: LayoutDashboard, exact: true, roles: ALL_ROLES },
  { href: "/painel/mapa",           label: "Mapa Tempo Real", icon: MapIcon,                       roles: ALL_ROLES },
  { href: "/painel/notificacoes",   label: "Notificações",    icon: Bell,                          roles: ADMIN_MOD },
];

const BOTTOM_NAV = [
  { href: "/painel/tecnicos",       label: "Técnicos",      icon: Users,       roles: ADMIN_MOD },
  { href: "/painel/auditoria",      label: "Auditoria",     icon: ShieldAlert, roles: ALL_ROLES },
  { href: "/painel/historico",      label: "Histórico",     icon: History,     roles: ALL_ROLES },
  { href: "/painel/status",         label: "Status",        icon: HeartPulse,  roles: ADMIN_ONLY },
  { href: "/painel/configuracoes",  label: "Configurações", icon: Settings,    roles: ADMIN_MOD },
];

// Sub-itens do grupo "Vistorias"
const VISTORIAS_GROUP = [
  { href: "/painel/vistorias",           label: "Pendentes",            icon: ClipboardList, roles: ADMIN_MOD },
  { href: "/painel/andamento",           label: "Em Andamento",         icon: Activity,       roles: ALL_ROLES },
  { href: "/painel/realizadas",          label: "Concluídas",           icon: CheckCircle2,   roles: ALL_ROLES },
  { href: "/painel/revisitas",           label: "Revisitas",            icon: RotateCw,       roles: ALL_ROLES },
  { href: "/painel/central-vistorias",   label: "Central de Vistorias", icon: Wrench,         roles: ADMIN_MOD },
  { href: "/painel/devolucoes",          label: "Devoluções",           icon: Undo2,          roles: ALL_ROLES },
  { href: "/painel/rejeitadas",          label: "Vistorias Rejeitadas", icon: Ban,            roles: ALL_ROLES },
];

const VISTORIAS_HREFS = new Set(VISTORIAS_GROUP.map((i) => i.href));

// Sub-itens do grupo "Instalações" — módulo novo, fila própria (não é a
// mesma tela/tabela de Vistorias Rejeitadas).
const INSTALACOES_GROUP = [
  { href: "/painel/instalacoes/mapa",       label: "Mapa Tempo Real", icon: MapIcon, roles: ALL_ROLES },
  { href: "/painel/instalacoes/rejeitadas", label: "Rejeitadas",      icon: Ban,     roles: ALL_ROLES },
];
const INSTALACOES_HREFS = new Set(INSTALACOES_GROUP.map((i) => i.href));

// Mapa completo rota → papéis permitidos, usado pelo guard de navegação.
// Inclui rotas fora do menu (detalhe de técnico, página de teste interna).
const PAGE_ROLES: Array<{ href: string; roles: SessionRole[] }> = [
  ...TOP_NAV,
  ...BOTTOM_NAV,
  ...VISTORIAS_GROUP,
  ...INSTALACOES_GROUP,
  { href: "/painel/teste", roles: ADMIN_ONLY },
];

function rolesForPath(pathname: string): SessionRole[] | null {
  // Match exato primeiro, senão o prefixo mais específico (ex.: /painel/tecnicos/123 → /painel/tecnicos).
  const exact = PAGE_ROLES.find((p) => p.href === pathname);
  if (exact) return exact.roles;
  const prefix = PAGE_ROLES
    .filter((p) => p.href !== "/painel" && pathname.startsWith(p.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return prefix ? prefix.roles : null;
}

const ROLE_LABEL: Record<SessionRole, string> = {
  admin: "Administrador",
  moderador: "Moderador",
  leitura: "Leitura",
  tecnico: "Técnico",
  instalador: "Instalador",
};

// Largura abaixo da qual a sidebar recolhe automaticamente
const AUTO_COLLAPSE_BP = 1100;

function initials(nome: string) {
  const p = nome.trim().split(/[\s._-]+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase();
}

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
  search:       "var(--vm-input)",
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
} as const;

type Theme = {
  navActive: string;
  navActiveTxt: string;
  navInactive: string;
  [k: string]: string;
};

function NavItem({
  href,
  label,
  icon: Icon,
  exact,
  pathname,
  T,
  indent = false,
  collapsed = false,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  pathname: string;
  T: Theme;
  indent?: boolean;
  collapsed?: boolean;
}) {
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");

  return (
    <li>
      <Link
        href={href}
        title={collapsed ? label : undefined}
        className={`relative flex items-center rounded-lg text-[12.5px] font-medium transition-colors duration-100 ${
          collapsed ? "justify-center px-0 py-[9px]" : "gap-2.5 px-2.5 py-[7px]"
        }`}
        style={{
          paddingLeft: !collapsed && indent ? "2rem" : undefined,
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
          className="h-[15px] w-[15px] shrink-0"
          strokeWidth={active ? 2.3 : 1.8}
          style={{ color: active ? "#00B388" : T.navInactive }}
        />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    </li>
  );
}

export default function PainelClientLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { hydrated, session, logout } = useAuthStore();

  const [isDark, setIsDark] = useState(false);
  const [vistoriasOpen, setVistoriasOpen] = useState(false);
  const [instalacoesOpen, setInstalacoesOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pendentesCount, setPendentesCount] = useState(0);
  const prefRef = useRef(false); // preferência manual do usuário (expandido/recolhido)

  useEffect(() => {
    setIsDark(localStorage.getItem("vm_painel_theme") === "dark");
  }, []);

  // Colapso inteligente: recolhe sob breakpoint estreito; senão respeita a
  // preferência salva. Reavalia em resize.
  useEffect(() => {
    prefRef.current = localStorage.getItem("vm_painel_sidebar") === "collapsed";
    const apply = () =>
      setCollapsed(window.innerWidth < AUTO_COLLAPSE_BP ? true : prefRef.current);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  // Abre o grupo automaticamente quando está numa rota de vistorias
  useEffect(() => {
    if (VISTORIAS_HREFS.has(pathname)) setVistoriasOpen(true);
  }, [pathname]);

  useEffect(() => {
    if (INSTALACOES_HREFS.has(pathname)) setInstalacoesOpen(true);
  }, [pathname]);

  // Polling do badge de notificações pendentes
  const fetchPendentes = useCallback(async () => {
    if (!session?.token) return;
    try {
      // raw fetch NÃO herda o basePath/assetPrefix do Next — prefixar manual,
      // senão vira /api/... (sem /painel) e o nginx responde 404.
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      const r = await fetch(`${base}/api/painel/notificacoes`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (r.ok) {
        const d = (await r.json()) as { pendentes: number };
        setPendentesCount(d.pendentes);
      }
    } catch { /* ignora */ }
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    fetchPendentes();
    const id = window.setInterval(fetchPendentes, 10_000);
    return () => window.clearInterval(id);
  }, [fetchPendentes, session?.token]);

  const toggleTheme = () => {
    const next = !isDark;
    localStorage.setItem("vm_painel_theme", next ? "dark" : "light");
    // Mapas e widgets (Mapbox) leem o tema apenas no init — recarregar é a
    // única forma de garantir TODOS os elementos no tema certo, nos 2 sentidos.
    window.location.reload();
  };

  const toggleCollapse = () => {
    const next = !collapsed;
    prefRef.current = next;
    localStorage.setItem("vm_painel_sidebar", next ? "collapsed" : "expanded");
    setCollapsed(next);
  };

  const isPainelRole = (r?: SessionRole): r is SessionRole =>
    r === "admin" || r === "moderador" || r === "leitura";

  useEffect(() => {
    if (!hydrated) return;
    if (!session || !isPainelRole(session.role)) {
      router.replace("/painel/login");
      return;
    }
    // Acesso à tela atual não permitido pro papel — manda pro dashboard,
    // que todo papel enxerga. Cobre navegação direta por URL/back-forward.
    const allowed = rolesForPath(pathname);
    if (allowed && !allowed.includes(session.role)) {
      router.replace("/painel");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, session, pathname, router]);

  if (pathname === "/painel/login") return <>{children}</>;
  if (!hydrated) return null;
  if (!session || !isPainelRole(session.role)) return null;
  const currentAllowed = rolesForPath(pathname);
  if (currentAllowed && !currentAllowed.includes(session.role)) return null;

  const T = isDark ? DARK : LIGHT;
  const isMapaPage = pathname === "/painel/mapa" || pathname === "/painel/instalacoes/mapa";
  const nome = session.tecnico.nome;
  const vistoriasActive = VISTORIAS_HREFS.has(pathname);
  const instalacoesActive = INSTALACOES_HREFS.has(pathname);
  const topNav = TOP_NAV.filter((i) => i.roles.includes(session.role));
  const bottomNav = BOTTOM_NAV.filter((i) => i.roles.includes(session.role));
  const vistoriasGroup = VISTORIAS_GROUP.filter((i) => i.roles.includes(session.role));
  const instalacoesGroup = INSTALACOES_GROUP.filter((i) => i.roles.includes(session.role));

  return (
    <div
      className={`flex h-[100dvh] overflow-hidden ${isDark ? "dark" : ""}`}
      style={{ background: T.shell }}
    >
      {/* Alertas em tempo real (toast + som) — recusas, exceções, concluídas, devoluções */}
      <PainelAlertas />
      {/* Web push — registra o navegador do analista habilitado pelo admin */}
      <PainelWebPush />

      {/* ── SIDEBAR ─────────────────────────────────────────────── */}
      <aside
        className="flex h-full shrink-0 flex-col transition-[width] duration-200 ease-out"
        style={{
          width: collapsed ? 68 : 224,
          background: T.sidebar,
          borderRight: `1px solid ${T.border}`,
          boxShadow: isDark ? "none" : "0 0 0 1px rgba(0,0,0,0.04), 2px 0 12px rgba(0,0,0,0.04)",
        }}
      >
        {/* ── BRAND ── */}
        <div
          className={`flex h-16 shrink-0 items-center ${collapsed ? "justify-center px-0" : "gap-3 px-4"}`}
          style={{ borderBottom: `1px solid ${T.border}` }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset("/logo-vistomap.png")}
              alt="VistoMap"
              className="h-9 w-9 object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </span>

          {!collapsed && (
            <div className="min-w-0 flex-1 leading-none">
              <div className="flex items-baseline gap-px">
                <span className="text-[16px] font-bold tracking-[-0.4px]" style={{ color: T.text }}>
                  Visto
                </span>
                <span className="text-[16px] font-bold tracking-[-0.4px]" style={{ color: "#00B388" }}>
                  Map
                </span>
              </div>
              <div className="mt-[3px] flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "#00C99B", boxShadow: "0 0 6px rgba(0,201,155,0.7)" }}
                />
                <span
                  className="text-[8.5px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: T.textMuted }}
                >
                  Central GIOC
                </span>
              </div>
            </div>
          )}

          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapse}
              title="Recolher menu"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition hover:bg-black/5"
              style={{ color: T.textMuted }}
            >
              <PanelLeftClose className="h-[15px] w-[15px]" />
            </button>
          )}
        </div>

        {/* Botão expandir (modo recolhido) */}
        {collapsed && (
          <div className="flex justify-center py-2" style={{ borderBottom: `1px solid ${T.border}` }}>
            <button
              type="button"
              onClick={toggleCollapse}
              title="Expandir menu"
              className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-black/5"
              style={{ color: T.textMuted }}
            >
              <PanelLeftOpen className="h-[16px] w-[16px]" />
            </button>
          </div>
        )}

        {/* ── NAV ── */}
        <nav className={`flex-1 overflow-y-auto py-3 ${collapsed ? "px-2" : "px-2"}`}>
          {!collapsed && (
            <p className="mb-1.5 px-2.5 text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: T.textMuted }}>
              Menu
            </p>
          )}
          <ul className="space-y-[2px]">
            {/* Itens do topo */}
            {topNav.map(({ href, label, icon, exact }) => (
              <NavItem
                key={href}
                href={href}
                label={label}
                icon={icon}
                exact={exact}
                pathname={pathname}
                T={T}
                collapsed={collapsed}
              />
            ))}

            {/* ── GRUPO: VISTORIAS ───────────────────────────────── */}
            {vistoriasGroup.length === 0 ? null : collapsed ? (
              <li>
                <button
                  type="button"
                  title="Vistorias"
                  onClick={() => { toggleCollapse(); setVistoriasOpen(true); }}
                  className="relative flex w-full items-center justify-center rounded-lg py-[9px] transition-colors duration-100"
                  style={{
                    background: vistoriasActive ? T.navActive : "transparent",
                    color: vistoriasActive ? T.navActiveTxt : T.navInactive,
                  }}
                >
                  {vistoriasActive && (
                    <span
                      className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-r-full"
                      style={{ background: "linear-gradient(180deg,#00C99B,#00875F)" }}
                    />
                  )}
                  <ClipboardList
                    className="h-[15px] w-[15px]"
                    strokeWidth={vistoriasActive ? 2.3 : 1.8}
                    style={{ color: vistoriasActive ? "#00B388" : T.navInactive }}
                  />
                </button>
              </li>
            ) : (
              <li>
                <button
                  type="button"
                  onClick={() => setVistoriasOpen((v) => !v)}
                  className="relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium transition-colors duration-100"
                  style={{
                    background: vistoriasActive ? T.navActive : "transparent",
                    color: vistoriasActive ? T.navActiveTxt : T.navInactive,
                  }}
                >
                  {vistoriasActive && (
                    <span
                      className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-r-full"
                      style={{ background: "linear-gradient(180deg,#00C99B,#00875F)" }}
                    />
                  )}
                  <ClipboardList
                    className="h-[15px] w-[15px] shrink-0"
                    strokeWidth={vistoriasActive ? 2.3 : 1.8}
                    style={{ color: vistoriasActive ? "#00B388" : T.navInactive }}
                  />
                  <span className="flex-1 truncate text-left">Vistorias</span>
                  {vistoriasOpen ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                </button>

                {vistoriasOpen && (
                  <ul className="mt-0.5 space-y-[2px]">
                    {vistoriasGroup.map(({ href, label, icon }) => (
                      <NavItem
                        key={href}
                        href={href}
                        label={label}
                        icon={icon}
                        pathname={pathname}
                        T={T}
                        indent
                      />
                    ))}
                  </ul>
                )}
              </li>
            )}

            {/* ── GRUPO: INSTALAÇÕES ─────────────────────────────── */}
            {instalacoesGroup.length === 0 ? null : collapsed ? (
              <li>
                <button
                  type="button"
                  title="Instalações"
                  onClick={() => { toggleCollapse(); setInstalacoesOpen(true); }}
                  className="relative flex w-full items-center justify-center rounded-lg py-[9px] transition-colors duration-100"
                  style={{
                    background: instalacoesActive ? T.navActive : "transparent",
                    color: instalacoesActive ? T.navActiveTxt : T.navInactive,
                  }}
                >
                  {instalacoesActive && (
                    <span
                      className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-r-full"
                      style={{ background: "linear-gradient(180deg,#00C99B,#00875F)" }}
                    />
                  )}
                  <Wrench
                    className="h-[15px] w-[15px]"
                    strokeWidth={instalacoesActive ? 2.3 : 1.8}
                    style={{ color: instalacoesActive ? "#00B388" : T.navInactive }}
                  />
                </button>
              </li>
            ) : (
              <li>
                <button
                  type="button"
                  onClick={() => setInstalacoesOpen((v) => !v)}
                  className="relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium transition-colors duration-100"
                  style={{
                    background: instalacoesActive ? T.navActive : "transparent",
                    color: instalacoesActive ? T.navActiveTxt : T.navInactive,
                  }}
                >
                  {instalacoesActive && (
                    <span
                      className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-r-full"
                      style={{ background: "linear-gradient(180deg,#00C99B,#00875F)" }}
                    />
                  )}
                  <Wrench
                    className="h-[15px] w-[15px] shrink-0"
                    strokeWidth={instalacoesActive ? 2.3 : 1.8}
                    style={{ color: instalacoesActive ? "#00B388" : T.navInactive }}
                  />
                  <span className="flex-1 truncate text-left">Instalações</span>
                  {instalacoesOpen ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                </button>

                {instalacoesOpen && (
                  <ul className="mt-0.5 space-y-[2px]">
                    {instalacoesGroup.map(({ href, label, icon }) => (
                      <NavItem
                        key={href}
                        href={href}
                        label={label}
                        icon={icon}
                        pathname={pathname}
                        T={T}
                        indent
                      />
                    ))}
                  </ul>
                )}
              </li>
            )}

            {/* Separador */}
            <li>
              <div className={`my-2 border-t ${collapsed ? "mx-2" : "mx-2"}`} style={{ borderColor: T.border }} />
            </li>

            {/* Itens do rodapé */}
            {bottomNav.map(({ href, label, icon }) => (
              <NavItem
                key={href}
                href={href}
                label={label}
                icon={icon}
                pathname={pathname}
                T={T}
                collapsed={collapsed}
              />
            ))}
          </ul>
        </nav>

        {/* ── USER PILL ── */}
        <div className="p-2.5" style={{ borderTop: `1px solid ${T.border}` }}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <span
                title={nome}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                style={{ background: "linear-gradient(145deg,#00B388,#00875F)", boxShadow: "0 2px 8px rgba(0,179,136,0.3)" }}
              >
                {initials(nome)}
              </span>
              <button
                type="button"
                onClick={() => { logout(); router.replace("/painel/login"); }}
                title="Sair"
                className="flex h-7 w-7 items-center justify-center rounded-md opacity-50 transition hover:opacity-90"
                style={{ color: T.navInactive }}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div
              className="flex items-center gap-2.5 rounded-lg p-2"
              style={{ background: isDark ? "rgba(255,255,255,0.03)" : "var(--vm-tile)" }}
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
                  {ROLE_LABEL[session.role]}
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
          )}
        </div>
      </aside>

      {/* ── COLUNA DIREITA ───────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col" style={{ background: T.shell }}>

        {/* Topbar */}
        <header
          className="flex h-14 shrink-0 items-center gap-3 px-5"
          style={{ background: T.topbar, borderBottom: `1px solid ${T.border}` }}
        >
          <label
            className="flex h-8 max-w-[380px] flex-1 cursor-text items-center gap-2 rounded-lg px-3"
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

            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? "Tema claro" : "Tema escuro"}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150"
              style={{ color: T.textMuted }}
            >
              {isDark ? <Sun className="h-[15px] w-[15px]" /> : <Moon className="h-[15px] w-[15px]" />}
            </button>

            <Link
              href="/painel/notificacoes"
              className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5"
              style={{ color: T.textMuted }}
            >
              <Bell className="h-[15px] w-[15px]" />
              {pendentesCount > 0 && (
                <span
                  className="absolute right-[4px] top-[4px] flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-amber-500 px-[3px] text-[8px] font-bold text-white"
                  style={{ boxShadow: `0 0 0 1.5px ${T.badge}` }}
                >
                  {pendentesCount > 9 ? "9+" : pendentesCount}
                </span>
              )}
            </Link>
          </div>
        </header>

        <main
          className={isMapaPage ? "relative min-h-0 flex-1 overflow-hidden" : "flex-1 overflow-y-auto px-6 py-6"}
          style={{ background: T.shell }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
