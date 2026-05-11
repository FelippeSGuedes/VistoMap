import { type HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "emerald" | "amber" | "deep" | "red" | "blue";
  size?: "xs" | "sm";
}

const TONE: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-brand-steel/70 text-brand-deep",
  emerald: "bg-brand-emerald/15 text-brand-emerald",
  amber: "bg-brand-amber/20 text-[#8a5a00]",
  deep: "bg-brand-deep text-white",
  red: "bg-red-100 text-red-600",
  blue: "bg-blue-100 text-blue-600",
};

const SIZE = {
  xs: "h-5 px-2 text-[10px]",
  sm: "h-6 px-2.5 text-[11px]",
};

export function Badge({
  tone = "neutral",
  size = "sm",
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide",
        TONE[tone],
        SIZE[size],
        className
      )}
      {...rest}
    />
  );
}
