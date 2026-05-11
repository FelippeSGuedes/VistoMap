import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/utils/cn";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl border border-brand-steel/70 bg-white/95 p-4 shadow-soft transition",
          "dark:border-white/5 dark:bg-surface-dark-card",
          className
        )}
        {...rest}
      />
    );
  }
);
