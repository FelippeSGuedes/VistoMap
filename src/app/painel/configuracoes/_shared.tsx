"use client";

/**
 * Peças compartilhadas entre as sub-páginas de /painel/configuracoes
 * (Expediente, Notificações, Colaboradores, Novo Colaborador) — prefixo `_`
 * tira do roteamento do App Router, não é uma rota.
 */

import type { LucideIcon } from "lucide-react";

export type AcessoPainel = "tecnico" | "administrador" | "moderador" | "leitura" | "nenhum";
export interface PerfilGlpi { id: number; nome: string }
export interface OpcaoAcesso { key: AcessoPainel; label: string }

export const PERFIL_CFG: Record<string, { bg: string; fg: string }> = {
  Administrador: { bg: "var(--vm-accent-tint)", fg: "#00875F" },
  Moderador: { bg: "var(--vm-indigo-tint)", fg: "#4338CA" },
  Leitura: { bg: "var(--vm-tile-3)", fg: "#475569" },
  Técnico: { bg: "rgba(37,99,235,0.10)", fg: "#2563EB" },
};

export function initials(nome: string) {
  const p = nome.trim().split(/[\s._-]+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase();
}

export function Campo({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13.5px] text-gray-800 outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
      />
    </div>
  );
}

/** Cabeçalho consistente das 4 sub-páginas — mesmo ícone-badge do header antigo de Configurações. */
export function ConfigHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: "var(--vm-accent-tint)", color: "#00875F" }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h1 className="text-[20px] font-bold text-gray-900">{title}</h1>
        <p className="text-[13px] text-gray-500">{subtitle}</p>
      </div>
    </div>
  );
}
