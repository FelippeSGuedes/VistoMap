"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map, ListChecks, User } from "lucide-react";
import { cn } from "@/utils/cn";

const TABS = [
  { href: "/dashboard", label: "Início", icon: Home },
  { href: "/vistorias", label: "Vistorias", icon: Map },
  { href: "/historico", label: "Histórico", icon: ListChecks },
  { href: "/perfil", label: "Perfil", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-30 mx-auto w-full max-w-xl px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2">
      <div className="glass flex items-center justify-around rounded-3xl border border-brand-steel/60 px-2 py-1.5 shadow-elev">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active =
            pathname === tab.href || pathname?.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-2 text-[11px] font-medium transition",
                active ? "text-brand-deep" : "text-ink-muted hover:text-ink"
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-2xl transition",
                  active && "bg-brand-emerald/15 text-brand-emerald"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
