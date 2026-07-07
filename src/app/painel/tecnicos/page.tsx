"use client";

/**
 * /painel/tecnicos — gestão de equipe de campo.
 * Light theme + dados reais (grupo VistoMap-Tecnicos do GIOC).
 */

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Search,
  Send,
  TrendingUp,
} from "lucide-react";
import { painelService, type HistoricoAnalytics } from "@/services/painel";
import type { TecnicoAtivo } from "@/types";
import { api } from "@/services/api";

interface ExpedienteAtivo {
  id: number;
  users_id: number;
  inicio_at: string;
  emPausa: boolean;
}

function elapsedShort(fromIso: string): string {
  const totalMin = Math.floor((Date.now() - new Date(fromIso).getTime()) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

interface TecnicoEnriquecido extends TecnicoAtivo {
  total30d: number;
  aprovadas30d: number;
  revisitas30d: number;
  cidades30d: number;
  kmPercorrido30d: number;
  produtividadePct: number;
}

const STATUS_CFG: Record<
  TecnicoAtivo["status"],
  { label: string; bg: string; fg: string; ring: string }
> = {
  "em-campo": { label: "Em campo", bg: "var(--vm-accent-tint)", fg: "#00875F", ring: "#00B388" },
  base: { label: "Na base", bg: "var(--vm-indigo-tint)", fg: "#4338CA", ring: "#6366F1" },
  "off-shift": { label: "Fora de plantão", bg: "var(--vm-tile-3)", fg: "#475569", ring: "var(--vm-faint)" },
  offline: { label: "Offline", bg: "var(--vm-tile-3)", fg: "#64748B", ring: "#94A3B8" },
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
  const [historico, setHistorico] = useState<HistoricoAnalytics | null>(null);
  const [expedientes, setExpedientes] = useState<ExpedienteAtivo[]>([]);
  const [query, setQuery] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<TecnicoAtivo["status"] | "todos">("todos");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [t, h, e] = await Promise.all([
        painelService.fetchTecnicos(),
        painelService.fetchHistorico(30),
        api
          .get<{ ativos: ExpedienteAtivo[] }>("/painel/expediente/ativos")
          .then((r) => r.data.ativos)
          .catch(() => [] as ExpedienteAtivo[]),
      ]);
      if (!alive) return;
      setTecnicos(t);
      setHistorico(h);
      setExpedientes(e);
    };
    load();
    const id = window.setInterval(load, 20000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const expedienteByUser = useMemo(() => {
    const m = new Map<string, ExpedienteAtivo>();
    expedientes.forEach((e) => m.set(String(e.users_id), e));
    return m;
  }, [expedientes]);

  // Merge tecnicos + ranking p/ KPIs 30d. Produtividade = total / topo do ranking.
  const enriquecidos = useMemo<TecnicoEnriquecido[]>(() => {
    const ranking = historico?.rankingTecnicos ?? [];
    const topo = Math.max(...ranking.map((r) => r.total), 1);
    const byId = new Map(ranking.map((r) => [String(r.id), r]));
    return tecnicos.map((t) => {
      const r = byId.get(t.id);
      const total = r?.total ?? 0;
      return {
        ...t,
        total30d: total,
        aprovadas30d: r?.aprovadas ?? 0,
        revisitas30d: r?.revisitas ?? 0,
        cidades30d: r?.cidades ?? 0,
        kmPercorrido30d: r?.kmPercorrido ?? 0,
        produtividadePct: Math.round((total / topo) * 100),
      };
    });
  }, [tecnicos, historico]);

  const lista = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriquecidos.filter((t) => {
      if (filtroStatus !== "todos" && t.status !== filtroStatus) return false;
      if (!q) return true;
      return (
        t.nome.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q) ||
        t.municipio?.toLowerCase().includes(q)
      );
    });
  }, [query, filtroStatus, enriquecidos]);

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
            style={{ color: "var(--vm-ink)" }}
          >
            Técnicos de campo
          </h1>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--vm-muted-b)" }}>
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
            background: "var(--vm-card)",
            border: "1px solid var(--vm-border-soft)",
            boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
          }}
        >
          <Search className="h-4 w-4" style={{ color: "var(--vm-faint-b)" }} strokeWidth={2.2} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar técnico, e-mail ou município…"
            className="flex-1 bg-transparent text-[13px] font-medium outline-none"
            style={{ color: "var(--vm-ink)" }}
          />
        </div>
        <div
          className="flex items-center gap-1 rounded-2xl px-2 py-1.5"
          style={{
            background: "var(--vm-card)",
            border: "1px solid var(--vm-border-soft)",
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
                    background: active ? "var(--vm-accent-tint)" : "transparent",
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
          const exp = expedienteByUser.get(t.id);
          const expColor = exp ? (exp.emPausa ? "#F59E0B" : "#00B388") : "#94A3B8";
          const expLabel = exp
            ? exp.emPausa
              ? "Pausa-almoço"
              : `Em expediente · ${elapsedShort(exp.inicio_at)}`
            : "Fora de expediente";
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i + 0.1 }}
              className="relative overflow-hidden rounded-[18px] p-4"
              style={{
                background: "var(--vm-card)",
                border: "1px solid var(--vm-border-soft)",
                boxShadow:
                  "0 1px 3px rgba(6,59,59,0.04), 0 8px 22px rgba(6,59,59,0.07)",
              }}
            >
              <div
                className="absolute right-3 top-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                style={{
                  background: `${expColor}15`,
                  color: expColor,
                  border: `1px solid ${expColor}33`,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: expColor }} />
                {expLabel}
              </div>
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
                      boxShadow: "0 0 0 3px var(--vm-card)",
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
                  <h3 className="mt-1 truncate text-[15px] font-semibold tracking-tight" style={{ color: "var(--vm-ink)" }}>
                    {t.nome}
                  </h3>
                  <p className="truncate text-[10.5px]" style={{ color: "var(--vm-muted)" }}>
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

              {/* KPIs atuais (atribuídas + hoje) */}
              <div className="relative mt-3 grid grid-cols-2 gap-1.5">
                <KpiBox
                  label="Atribuídas"
                  value={t.atribuidas}
                  bg="var(--vm-tile)"
                  borderColor="var(--vm-border-soft)"
                  labelColor="var(--vm-faint-b)"
                  valueColor="var(--vm-ink)"
                />
                <KpiBox
                  label="Hoje"
                  value={t.concluidasHoje}
                  bg="var(--vm-accent-tint)"
                  borderColor="rgba(0,179,136,0.22)"
                  labelColor="#00875F"
                  valueColor="#00875F"
                />
              </div>

              {/* KPIs 30 dias — produtividade operacional */}
              <div className="relative mt-2 rounded-xl p-2.5" style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border-soft)" }}>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[8.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--vm-muted)" }}>
                    Últimos 30 dias
                  </p>
                  <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold tabular-nums" style={{ color: t.produtividadePct >= 70 ? "#00875F" : t.produtividadePct >= 30 ? "#92400E" : "#94A3B8" }}>
                    <TrendingUp className="h-2.5 w-2.5" strokeWidth={2.5} />
                    {t.produtividadePct}%
                  </span>
                </div>
                {/* progress produtividade */}
                <div className="mb-2 h-1 overflow-hidden rounded-full" style={{ background: "var(--vm-border-soft)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(t.produtividadePct, 2)}%`,
                      background: t.produtividadePct >= 70 ? "#00B388" : t.produtividadePct >= 30 ? "#F59E0B" : "#94A3B8",
                    }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <MiniStat
                    icon={<CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2.3} />}
                    value={t.total30d}
                    label="vistorias"
                  />
                  <MiniStat
                    icon={<MapPin className="h-2.5 w-2.5" strokeWidth={2.3} />}
                    value={t.cidades30d}
                    label="cidades"
                  />
                  <MiniStat
                    icon={<Navigation className="h-2.5 w-2.5" strokeWidth={2.3} />}
                    value={t.kmPercorrido30d > 0 ? `${t.kmPercorrido30d}` : "0"}
                    label="km"
                  />
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
                  style={{ color: "var(--vm-muted-b)" }}
                  title="E-mail"
                >
                  <Mail className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-black/5"
                  style={{ color: "var(--vm-muted-b)" }}
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
            style={{ color: "var(--vm-faint-b)", background: "var(--vm-card)", border: "1px solid var(--vm-border-soft)" }}
          >
            Nenhum técnico encontrado com esses filtros.
          </div>
        )}
      </section>
    </div>
  );
}

function KpiBox({
  label,
  value,
  bg,
  borderColor,
  labelColor,
  valueColor,
}: {
  label: string;
  value: number | string;
  bg: string;
  borderColor: string;
  labelColor: string;
  valueColor: string;
}) {
  return (
    <div
      className="rounded-xl px-2.5 py-1.5"
      style={{ background: bg, border: `1px solid ${borderColor}` }}
    >
      <p
        className="text-[8.5px] font-bold uppercase tracking-[0.12em]"
        style={{ color: labelColor }}
      >
        {label}
      </p>
      <p
        className="mt-0.5 text-[18px] font-semibold tabular-nums"
        style={{ color: valueColor }}
      >
        {value}
      </p>
    </div>
  );
}

function MiniStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
}) {
  return (
    <div className="flex flex-col">
      <span
        className="flex items-center gap-1 text-[13px] font-semibold tabular-nums leading-none"
        style={{ color: "var(--vm-ink)" }}
      >
        <span style={{ color: "var(--vm-muted)" }}>{icon}</span>
        {value}
      </span>
      <span
        className="mt-0.5 text-[8.5px] font-medium uppercase tracking-[0.1em]"
        style={{ color: "var(--vm-faint)" }}
      >
        {label}
      </span>
    </div>
  );
}

function ResumoChip({ cor, label, value }: { cor: string; label: string; value: number }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-1.5"
      style={{
        background: "var(--vm-card)",
        border: "1px solid var(--vm-border-soft)",
        boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
      }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: cor, boxShadow: `0 0 6px ${cor}88` }}
      />
      <span className="text-[10.5px] font-medium" style={{ color: "var(--vm-muted-b)" }}>
        {label}
      </span>
      <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--vm-ink)" }}>
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
      <span style={{ color: "var(--vm-faint-b)" }}>{icon}</span>
      <span className="flex-1" style={{ color: "var(--vm-muted)" }}>
        {label}
      </span>
      <span className="font-semibold" style={{ color: "var(--vm-ink)" }}>
        {children}
      </span>
    </div>
  );
}
