"use client";

/**
 * /painel/tecnicos — gestão de equipe de campo.
 * Light theme + dados reais (grupo VistoMap-Tecnicos do GLPI).
 */

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  Mail,
  MapPin,
  Phone,
  Search,
  Send,
} from "lucide-react";
import { painelService } from "@/services/painel";
import type { TecnicoAtivo } from "@/types";

const STATUS_CFG: Record<
  TecnicoAtivo["status"],
  { label: string; bg: string; fg: string; ring: string }
> = {
  "em-campo": { label: "Em campo", bg: "#ECFDF5", fg: "#00875F", ring: "#00B388" },
  base: { label: "Na base", bg: "#EEF2FF", fg: "#4338CA", ring: "#6366F1" },
  "off-shift": { label: "Fora de plantão", bg: "#F1F5F9", fg: "#475569", ring: "#9CA3AF" },
  offline: { label: "Offline", bg: "#F1F5F9", fg: "#64748B", ring: "#94A3B8" },
};

function relativo(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
}

export default function TecnicosPage() {
  const [tecnicos, setTecnicos] = useState<TecnicoAtivo[]>([]);
  const [query, setQuery] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<TecnicoAtivo["status"] | "todos">("todos");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const t = await painelService.fetchTecnicos();
      if (alive) setTecnicos(t);
    };
    load();
    const id = window.setInterval(load, 20000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const lista = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tecnicos.filter((t) => {
      if (filtroStatus !== "todos" && t.status !== filtroStatus) return false;
      if (!q) return true;
      return (
        t.nome.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q) ||
        t.municipio?.toLowerCase().includes(q)
      );
    });
  }, [query, filtroStatus, tecnicos]);

  const ativos = tecnicos.filter((t) => t.status === "em-campo").length;
  const naBase = tecnicos.filter((t) => t.status === "base").length;
  const offline = tecnicos.filter((t) => t.status === "offline").length;

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between gap-4"
      >
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: "#00B388" }}
          >
            Equipe · {tecnicos.length} técnicos
          </p>
          <h1
            className="mt-1 text-[28px] font-semibold tracking-[-0.5px]"
            style={{ color: "#063B3B" }}
          >
            Técnicos de campo
          </h1>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "#566773" }}>
            Status operacional, produtividade e disponibilidade em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ResumoChip cor="#00B388" label="Em campo" value={ativos} />
          <ResumoChip cor="#6366F1" label="Na base" value={naBase} />
          <ResumoChip cor="#94A3B8" label="Offline" value={offline} />
        </div>
      </motion.div>

      {/* TOOLBAR */}
      <div className="flex items-center gap-2">
        <div
          className="flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.06)",
            boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
          }}
        >
          <Search className="h-4 w-4" style={{ color: "#A0ACBA" }} strokeWidth={2.2} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar técnico, e-mail ou município…"
            className="flex-1 bg-transparent text-[13px] font-medium outline-none"
            style={{ color: "#063B3B" }}
          />
        </div>
        <div
          className="flex items-center gap-1 rounded-2xl px-2 py-1.5"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.06)",
            boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
          }}
        >
          {(["todos", "em-campo", "base", "off-shift", "offline"] as const).map(
            (s) => {
              const active = filtroStatus === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFiltroStatus(s)}
                  className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition"
                  style={{
                    background: active ? "#ECFDF5" : "transparent",
                    color: active ? "#00875F" : "#7A8896",
                  }}
                >
                  {s === "todos" ? "Todos" : STATUS_CFG[s].label}
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* CARDS */}
      <section className="grid grid-cols-3 gap-3">
        {lista.map((t, i) => {
          const cfg = STATUS_CFG[t.status];
          const isOffline = t.status === "offline";
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i + 0.1 }}
              className="relative overflow-hidden rounded-[18px] p-4"
              style={{
                background: "#fff",
                border: "1px solid rgba(6,59,59,0.05)",
                boxShadow:
                  "0 1px 3px rgba(6,59,59,0.04), 0 8px 22px rgba(6,59,59,0.07)",
              }}
            >
              {!isOffline && (
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-[28px]"
                  style={{ background: `${cfg.ring}1a` }}
                />
              )}

              <div className="relative flex items-start gap-3">
                <div className="relative">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-2xl text-[13px] font-bold text-white"
                    style={{
                      background:
                        "linear-gradient(145deg, #00B388, #00875F)",
                      boxShadow: "0 4px 14px rgba(0,179,136,0.28)",
                    }}
                  >
                    {t.nome
                      .split(/[\s._-]+/)
                      .slice(0, 2)
                      .map((s) => s[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <span
                    className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full"
                    style={{
                      background: cfg.ring,
                      boxShadow: "0 0 0 3px #fff",
                    }}
                  >
                    <span className="h-1 w-1 rounded-full bg-white" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <span
                    className="inline-flex items-center rounded-full px-1.5 py-[2px] text-[8.5px] font-bold uppercase tracking-[0.1em]"
                    style={{ background: cfg.bg, color: cfg.fg }}
                  >
                    {cfg.label}
                  </span>
                  <h3 className="mt-1 truncate text-[15px] font-semibold tracking-tight" style={{ color: "#063B3B" }}>
                    {t.nome}
                  </h3>
                  <p className="truncate text-[10.5px]" style={{ color: "#7A8896" }}>
                    {t.email ?? "—"}
                  </p>
                </div>
              </div>

              {/* meta */}
              <div className="relative mt-3 space-y-1.5 text-[11.5px]">
                <Meta icon={<MapPin className="h-3 w-3" />} label="Município">
                  {t.municipio ?? "—"}
                </Meta>
                <Meta icon={<Clock className="h-3 w-3" />} label="Última atividade">
                  {relativo(t.ultimaAtividade)}
                </Meta>
              </div>

              {/* KPIs */}
              <div className="relative mt-3 grid grid-cols-2 gap-1.5">
                <div
                  className="rounded-xl px-2.5 py-1.5"
                  style={{
                    background: "#F7F9FB",
                    border: "1px solid rgba(6,59,59,0.05)",
                  }}
                >
                  <p
                    className="text-[8.5px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: "#A0ACBA" }}
                  >
                    Atribuídas
                  </p>
                  <p className="mt-0.5 text-[18px] font-semibold tabular-nums" style={{ color: "#063B3B" }}>
                    {t.atribuidas}
                  </p>
                </div>
                <div
                  className="rounded-xl px-2.5 py-1.5"
                  style={{
                    background: "#ECFDF5",
                    border: "1px solid rgba(0,179,136,0.22)",
                  }}
                >
                  <p
                    className="text-[8.5px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: "#00875F" }}
                  >
                    Concluídas hoje
                  </p>
                  <p className="mt-0.5 text-[18px] font-semibold tabular-nums" style={{ color: "#00875F" }}>
                    {t.concluidasHoje}
                  </p>
                </div>
              </div>

              {/* actions */}
              <div className="relative mt-3 flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isOffline}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[10.5px] font-semibold text-white transition disabled:opacity-40"
                  style={{
                    background:
                      "linear-gradient(135deg, #00C99B 0%, #00875F 100%)",
                    boxShadow: "0 4px 12px rgba(0,179,136,0.28)",
                  }}
                >
                  <Send className="h-3 w-3" strokeWidth={2.4} />
                  Atribuir
                </button>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-black/5"
                  style={{ color: "#566773" }}
                  title="E-mail"
                >
                  <Mail className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-black/5"
                  style={{ color: "#566773" }}
                  title="Ligar"
                >
                  <Phone className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
        {lista.length === 0 && (
          <div
            className="col-span-3 rounded-2xl p-8 text-center text-[12.5px]"
            style={{ color: "#A0ACBA", background: "#fff", border: "1px solid rgba(6,59,59,0.05)" }}
          >
            Nenhum técnico encontrado com esses filtros.
          </div>
        )}
      </section>
    </div>
  );
}

function ResumoChip({ cor, label, value }: { cor: string; label: string; value: number }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-1.5"
      style={{
        background: "#fff",
        border: "1px solid rgba(6,59,59,0.06)",
        boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
      }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: cor, boxShadow: `0 0 6px ${cor}88` }}
      />
      <span className="text-[10.5px] font-medium" style={{ color: "#566773" }}>
        {label}
      </span>
      <span className="text-[13px] font-semibold tabular-nums" style={{ color: "#063B3B" }}>
        {value}
      </span>
    </div>
  );
}

function Meta({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: "#A0ACBA" }}>{icon}</span>
      <span className="flex-1" style={{ color: "#7A8896" }}>
        {label}
      </span>
      <span className="font-semibold" style={{ color: "#063B3B" }}>
        {children}
      </span>
    </div>
  );
}
