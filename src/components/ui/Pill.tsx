"use client";

import { type ButtonHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function Pill({ active, className, children, ...rest }: PillProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition",
        active
          ? "border-brand-deep bg-brand-deep text-white shadow-soft"
          : "border-brand-steel bg-white text-ink-muted hover:border-brand-deep/40 hover:text-brand-deep",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
