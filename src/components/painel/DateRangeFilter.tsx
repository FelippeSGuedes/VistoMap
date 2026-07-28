"use client";

/**
 * DateRangeFilter — filtro "de/até" compacto, pra dropar nas barras de
 * filtro das listas do painel (Pendentes, Concluídas, Revisitas, etc).
 * Filtragem é sempre client-side (a lista já vem inteira do backend).
 */

import { useState } from "react";
import { Calendar, X } from "lucide-react";

export interface DateRange {
  de: string | null;
  ate: string | null;
}

const fieldStyle = {
  background: "var(--vm-tile)",
  borderColor: "var(--vm-border)",
  color: "var(--vm-text)",
} as const;

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const ativo = !!(value.de || value.ate);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-medium transition"
        style={{
          background: ativo ? "rgba(0,179,136,0.10)" : "var(--vm-tile)",
          border: `1px solid ${ativo ? "rgba(0,179,136,0.35)" : "var(--vm-border)"}`,
          color: ativo ? "#00875F" : "var(--vm-text-soft)",
        }}
      >
        <Calendar className="h-3.5 w-3.5" />
        {ativo
          ? `${value.de ?? "…"} – ${value.ate ?? "…"}`
          : "Filtrar por data"}
        {ativo && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange({ de: null, ate: null });
            }}
            className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-20 mt-1.5 w-[240px] rounded-xl p-3"
            style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", boxShadow: "0 12px 32px rgba(0,0,0,0.18)" }}
          >
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>De</label>
            <input
              type="date"
              value={value.de ?? ""}
              onChange={(e) => onChange({ ...value, de: e.target.value || null })}
              className="mb-2.5 w-full rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
              style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
            />
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>Até</label>
            <input
              type="date"
              value={value.ate ?? ""}
              onChange={(e) => onChange({ ...value, ate: e.target.value || null })}
              className="w-full rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
              style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
            />
            {ativo && (
              <button
                type="button"
                onClick={() => onChange({ de: null, ate: null })}
                className="mt-2.5 w-full rounded-lg py-1.5 text-[11.5px] font-semibold transition hover:brightness-95"
                style={{ background: "var(--vm-tile)", color: "var(--vm-text-soft)" }}
              >
                Limpar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** true se `iso` (data qualquer, pode ser null) cai dentro do range (inclusive). */
export function dentroDoRange(iso: string | null | undefined, range: DateRange): boolean {
  if (!range.de && !range.ate) return true;
  if (!iso) return false;
  const d = iso.slice(0, 10);
  if (range.de && d < range.de) return false;
  if (range.ate && d > range.ate) return false;
  return true;
}
