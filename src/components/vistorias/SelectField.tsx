"use client";

import { ChevronDown, Lock } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/utils/cn";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
  icon?: ReactNode;
  /** Em uma grid 2 colunas, ocupa toda a linha. */
  colSpan?: boolean;
}

/**
 * Dropdown com o mesmo visual do EditableField, pra campos cujo valor vem
 * de um dropdown do GLPI (ex.: tipoifield → 2G/3G/4G) — evita o técnico
 * digitar valor livre e criar entradas duplicadas/inconsistentes no GLPI.
 */
export function SelectField({
  label,
  value,
  options,
  placeholder = "Selecione…",
  onChange,
  readOnly,
  icon,
  colSpan,
}: SelectFieldProps) {
  const id = useId();
  const interactive = !readOnly;
  const isEmpty = !value;

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-white/80 px-3.5 py-2.5 transition",
        "border-brand-steel/70",
        interactive
          ? "cursor-pointer hover:border-brand-emerald/70 hover:bg-white"
          : "cursor-default opacity-95",
        colSpan && "col-span-2"
      )}
    >
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted"
      >
        {icon && <span className="text-ink-muted/80">{icon}</span>}
        {label}
        {readOnly && <Lock className="ml-1 h-3 w-3 text-ink-muted/60" />}
      </label>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <select
          id={id}
          value={value}
          disabled={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn(
            "w-full min-w-0 flex-1 appearance-none bg-transparent text-[14px] font-medium focus:outline-none",
            isEmpty ? "text-ink-muted/60" : "text-ink"
          )}
        >
          <option value="" disabled={!isEmpty}>
            {placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {interactive && (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted/60" />
        )}
      </div>
    </div>
  );
}
