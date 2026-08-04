"use client";

/**
 * Nav inferior do módulo de Instalação — mesmo desenho visual do BottomNav
 * da vistoria (pill flutuante, botão central em destaque), mas com rotas e
 * guard próprios: não reaproveita o componente da vistoria (ele é fixo em
 * /dashboard, /vistorias, /historico, /perfil — hrefs que não existem
 * aqui) nem o useVistoriasAccessGuard (gate de expediente é outro fluxo).
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, LogOut, Map } from "lucide-react";
import { useAuthStore } from "@/store/auth";

const TABS = [
  { href: "/instalacao", label: "Início", icon: Home, center: false },
  { href: "/instalacao/mapa", label: "Mapa", icon: Map, center: true },
] as const;

export function InstalacaoBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 flex justify-center"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 14px)", paddingTop: 8 }}
    >
      <div
        className="flex items-end mx-4 w-full max-w-[390px]"
        style={{
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "saturate(200%) blur(28px)",
          WebkitBackdropFilter: "saturate(200%) blur(28px)",
          borderRadius: 28,
          border: "1px solid rgba(6,59,59,0.07)",
          boxShadow:
            "0 -1px 0 rgba(255,255,255,0.9) inset, 0 8px 32px rgba(6,59,59,0.12), 0 2px 8px rgba(6,59,59,0.06)",
          padding: "6px 8px",
        }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = pathname === tab.href || (pathname?.startsWith(tab.href + "/") ?? false);

          if (tab.center) {
            return (
              <Link key={tab.href} href={tab.href} className="relative -mt-5 flex flex-1 flex-col items-center">
                <span
                  className="flex h-[54px] w-[54px] items-center justify-center rounded-[18px] transition active:scale-95"
                  style={{
                    background: active
                      ? "linear-gradient(145deg,#00C99B 0%,#00B388 100%)"
                      : "linear-gradient(145deg,#063B3B 0%,#0A5252 100%)",
                    boxShadow: active
                      ? "0 0 0 4px rgba(0,179,136,0.18), 0 6px 20px rgba(0,179,136,0.4)"
                      : "0 6px 20px rgba(6,59,59,0.35), 0 1px 0 rgba(255,255,255,0.1) inset",
                  }}
                >
                  <Icon className="h-[22px] w-[22px] text-white" strokeWidth={1.8} />
                </span>
                <span className="mt-[5px] text-[10px] font-semibold" style={{ color: active ? "#00B388" : "#A0ACBA" }}>
                  {tab.label}
                </span>
              </Link>
            );
          }

          return (
            <Link key={tab.href} href={tab.href} className="flex flex-1 flex-col items-center gap-[4px] py-1.5 transition">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-[12px] transition"
                style={{ background: active ? "rgba(0,179,136,0.1)" : "transparent" }}
              >
                <Icon className="h-5 w-5 transition" style={{ color: active ? "#00B388" : "#A0ACBA" }} strokeWidth={active ? 2 : 1.7} />
              </span>
              <span className="text-[10px] font-semibold tracking-[-0.1px]" style={{ color: active ? "#063B3B" : "#A0ACBA" }}>
                {tab.label}
              </span>
            </Link>
          );
        })}

        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="flex flex-1 flex-col items-center gap-[4px] py-1.5 transition"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[12px]">
            <LogOut className="h-5 w-5" style={{ color: "#A0ACBA" }} strokeWidth={1.7} />
          </span>
          <span className="text-[10px] font-semibold tracking-[-0.1px]" style={{ color: "#A0ACBA" }}>
            Sair
          </span>
        </button>
      </div>
    </nav>
  );
}
