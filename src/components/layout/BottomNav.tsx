"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map, ListChecks, User } from "lucide-react";
import { cn } from "@/utils/cn";

const TABS = [
  { href: "/dashboard", label: "Início",    icon: Home,        center: false },
  { href: "/vistorias", label: "Mapa",      icon: Map,         center: true  },
  { href: "/historico", label: "Histórico", icon: ListChecks,  center: false },
  { href: "/perfil",    label: "Perfil",    icon: User,        center: false },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 flex justify-center"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 14px)", paddingTop: 8 }}
    >
      <div
        className="flex items-end mx-4 w-full max-w-[390px]"
        style={{
          background:     "rgba(255,255,255,0.88)",
          backdropFilter: "saturate(200%) blur(28px)",
          WebkitBackdropFilter: "saturate(200%) blur(28px)",
          borderRadius:   28,
          border:         "1px solid rgba(6,59,59,0.07)",
          boxShadow:      "0 -1px 0 rgba(255,255,255,0.9) inset, 0 8px 32px rgba(6,59,59,0.12), 0 2px 8px rgba(6,59,59,0.06)",
          padding:        "6px 8px",
        }}
      >
        {TABS.map((tab) => {
          const Icon   = tab.icon;
          const active = pathname === tab.href || pathname?.startsWith(tab.href + "/");

          if (tab.center) {
            /* ── central floating action button ── */
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="relative -mt-5 flex flex-1 flex-col items-center"
              >
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
                <span
                  className="mt-[5px] text-[10px] font-semibold"
                  style={{ color: active ? "#00B388" : "#A0ACBA" }}
                >
                  {tab.label}
                </span>
              </Link>
            );
          }

          /* ── regular tab ── */
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-1 flex-col items-center gap-[4px] py-1.5 transition"
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-[12px] transition",
                  active && "bg-[rgba(0,179,136,0.1)]"
                )}
              >
                <Icon
                  className="h-5 w-5 transition"
                  style={{ color: active ? "#00B388" : "#A0ACBA" }}
                  strokeWidth={active ? 2 : 1.7}
                />
              </span>
              <span
                className="text-[10px] font-semibold tracking-[-0.1px]"
                style={{ color: active ? "#063B3B" : "#A0ACBA" }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
