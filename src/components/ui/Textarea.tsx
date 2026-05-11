"use client";

import { forwardRef, useEffect, useRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  maxLength?: number;
  hint?: string;
  autoResize?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, maxLength, hint, autoResize = true, className, value, onChange, ...rest },
  ref
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!autoResize) return;
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value, autoResize]);

  const length = typeof value === "string" ? value.length : 0;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          {label}
        </label>
      )}
      <div className="rounded-2xl border border-brand-steel bg-white px-3.5 py-3 transition focus-within:border-brand-emerald focus-within:shadow-glow">
        <textarea
          ref={(node) => {
            innerRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
          }}
          value={value}
          onChange={onChange}
          maxLength={maxLength}
          className={cn(
            "min-h-[96px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-ink placeholder:text-ink-muted/70 focus:outline-none",
            className
          )}
          {...rest}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>{hint}</span>
        {maxLength && (
          <span>
            {length}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
});
