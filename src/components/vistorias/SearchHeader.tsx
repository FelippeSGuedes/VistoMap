"use client";

import Link from "next/link";
import { ArrowLeft, Search, SlidersHorizontal, X } from "lucide-react";
import { type ReactNode } from "react";

interface SearchHeaderProps {
  query: string;
  onQuery: (value: string) => void;
  onOpenFilters: () => void;
  filterCount?: number;
  pills?: ReactNode;
  backHref?: string;
  /**
   * Modo compacto: mostra só o botão de filtro, flutuando no canto superior
   * direito (sem barra, sem busca, sem voltar). Usado no mapa — a barra
   * cheia sobrepunha o FAB "Postes próximos" em telas com notch maior.
   */
  minimal?: boolean;
}

export function SearchHeader({
  query,
  onQuery,
  onOpenFilters,
  filterCount = 0,
  pills,
  backHref = "/dashboard",
  minimal = false,
}: SearchHeaderProps) {
  if (minimal) {
    return (
      <div className="fixed inset-x-0 top-0 z-40 flex justify-end px-4 pt-safe-t">
        <button
          type="button"
          onClick={onOpenFilters}
          className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-deep text-white shadow-soft"
          aria-label="Filtros"
        >
          <SlidersHorizontal className="h-5 w-5" />
          {filterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-amber px-1 text-[11px] font-bold text-brand-deep">
              {filterCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-40 border-b border-brand-steel/60 bg-white/80 backdrop-blur-xl pt-[max(env(safe-area-inset-top),12px)]">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Link
          href={backHref}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-soft"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5 text-ink" />
        </Link>
        <label className="relative flex h-11 flex-1 items-center gap-2 rounded-2xl border border-brand-steel bg-white px-3 shadow-soft focus-within:border-brand-emerald">
          <Search className="h-4 w-4 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar equipamento, GLPI, cidade…"
            className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-muted/70 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery("")}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-steel/60 text-ink-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <button
          type="button"
          onClick={onOpenFilters}
          className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-deep text-white shadow-soft"
          aria-label="Filtros"
        >
          <SlidersHorizontal className="h-5 w-5" />
          {filterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-amber px-1 text-[11px] font-bold text-brand-deep">
              {filterCount}
            </span>
          )}
        </button>
      </div>
      {pills && (
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 pb-3">
          {pills}
        </div>
      )}
    </div>
  );
}
