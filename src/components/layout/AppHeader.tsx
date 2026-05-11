"use client";

import Link from "next/link";
import { ArrowLeft, Bell } from "lucide-react";
import { cn } from "@/utils/cn";
import { Logo } from "@/components/icons/Logo";

interface AppHeaderProps {
  backHref?: string;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  transparent?: boolean;
  className?: string;
}

export function AppHeader({
  backHref,
  title,
  subtitle,
  right,
  transparent,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex items-center gap-3 border-b border-transparent px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]",
        transparent
          ? "bg-transparent"
          : "glass border-brand-steel/60 backdrop-blur-xl",
        className
      )}
    >
      {backHref ? (
        <Link
          href={backHref}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-ink shadow-soft transition hover:bg-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      ) : (
        <Logo />
      )}
      <div className="min-w-0 flex-1">
        {title && (
          <h1 className="truncate text-[17px] font-semibold tracking-tight text-ink">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="truncate text-xs text-ink-muted">{subtitle}</p>
        )}
      </div>
      {right ?? (
        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-ink shadow-soft transition hover:bg-white"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-emerald" />
        </button>
      )}
    </header>
  );
}
