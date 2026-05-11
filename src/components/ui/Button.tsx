"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg" | "xl";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-grad-emerald text-white shadow-glow hover:brightness-105 active:brightness-95 focus-visible:ring-brand-emerald/40",
  secondary:
    "bg-brand-deep text-white shadow-elev hover:bg-[#0a4f65] active:bg-[#0a4f65] focus-visible:ring-brand-deep/30",
  outline:
    "border border-brand-steel bg-white text-ink hover:border-brand-emerald hover:text-brand-deep focus-visible:ring-brand-emerald/30",
  ghost:
    "bg-transparent text-ink hover:bg-brand-steel/60 focus-visible:ring-brand-deep/20",
  danger:
    "bg-status-rejected text-white shadow-elev hover:brightness-105 focus-visible:ring-red-300",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] rounded-xl",
  md: "h-11 px-4 text-sm rounded-2xl",
  lg: "h-12 px-5 text-[15px] rounded-2xl",
  xl: "h-14 px-6 text-base rounded-2xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading,
    leftIcon,
    rightIcon,
    fullWidth,
    className,
    children,
    disabled,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex select-none items-center justify-center gap-2 font-semibold tracking-tight transition will-change-transform",
        "focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60",
        "active:scale-[0.985]",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        leftIcon && <span className="flex items-center">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!loading && rightIcon && <span className="flex items-center">{rightIcon}</span>}
    </button>
  );
});
