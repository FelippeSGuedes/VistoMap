"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/utils/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightSlot, className, id, ...rest },
  ref
) {
  const inputId = id ?? `input-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
        >
          {label}
        </label>
      )}
      <div
        className={cn(
          "group relative flex items-center gap-2 rounded-2xl border bg-white px-3.5 transition",
          "border-brand-steel focus-within:border-brand-emerald focus-within:shadow-glow",
          error && "border-red-400 focus-within:border-red-500 focus-within:shadow-none",
          rest.disabled && "opacity-60",
          className
        )}
      >
        {leftIcon && <span className="text-ink-muted">{leftIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "h-12 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-muted/70 focus:outline-none"
          )}
          {...rest}
        />
        {rightSlot}
      </div>
      {(error || hint) && (
        <span
          className={cn(
            "text-xs",
            error ? "text-red-500" : "text-ink-muted"
          )}
        >
          {error ?? hint}
        </span>
      )}
    </div>
  );
});
