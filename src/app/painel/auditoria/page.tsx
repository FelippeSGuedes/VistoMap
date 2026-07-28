"use client";

/**
 * /painel/auditoria — Timeline Operacional Viva.
 *
 * Rastreabilidade completa de cada ação: atribuições, finalizações,
 * reprovações, PDFs, edições. Design inspirado em Linear Activity / Stripe Events.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { painelService } from "@/services/painel";
import {
  Activity,
  Filter,
  RadioTower,
  RefreshCcw,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { AuditEntry } from "@/types";
import { ACAO_META as ACAO, initials } from "@/lib/auditMeta";

/* ─── Configuração por tipo de ação ─────────────────────────────────── */
/* (movida para @/lib/auditMeta — compartilhada com /painel/tecnicos/[id]) */

const TIPO_FILTROS: Array<{ id: AuditEntry["acao"] | "todos"; label: string }> = [
  { id: "todos",               label: "Todos" },
  { id: "vistoria-atribuida",  label: "Atribuições" },
  { id: "revisita-criada",     label: "Revisitas" },
  { id: "vistoria-reprovada",  label: "Reprovações" },
  { id: "vistoria-finalizada", label: "Finalizações" },
  { id: "pdf-regenerado",      label: "PDFs" },
  { id: "dados-editados",      label: "Edições" },
];

/**
 * O backend devolve o timestamp cru do MySQL ("2026-07-28 14:09:52", sem
 * timezone) — o valor é UTC, mas `new Date(iso)` nesse formato (espaço em
 * vez de "T") é interpretado como HORÁRIO LOCAL do navegador pela maioria
 * dos browsers, deslocando todo horário exibido (era isso que deixava as
 * horas da timeline erradas). Mesmo fix usado em devolucoes/notificações.
 */
function parseUTC(iso: string): Date {
  return new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
}

function fmtHora(iso: string) {
  return parseUTC(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDia(iso: string) {
  const d = parseUTC(iso);
  const hoje = new Date();
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" });
}

function relativo(iso: string) {
  const diff = Date.now() - parseUTC(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
}

/* ─── Evento individual da timeline ─────────────────────────────────── */
function EventoItem({ entry, isLast }: { entry: AuditEntry; isLast: boolean }) {
  const cfg = ACAO[entry.acao];
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative flex gap-4 pb-6"
    >
      {/* Linha vertical da timeline */}
      {!isLast && (
        <div
          className="absolute left-[19px] top-8 w-px"
          style={{ bottom: 0, background: "rgba(6,59,59,0.07)" }}
        />
      )}

      {/* Ícone / dot */}
      <div className="relative shrink-0">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[12px]"
          style={{ background: cfg.bg, border: `1px solid ${cfg.dot}30` }}
        >
          <Icon className="h-4 w-4" style={{ color: cfg.fg }} strokeWidth={2} />
        </div>
        {/* Dot pulsante para eventos recentes (< 2 min) */}
        {Date.now() - parseUTC(entry.timestamp).getTime() < 120_000 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: cfg.dot }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: cfg.dot }} />
          </span>
        )}
      </div>

      {/* Conteúdo */}
      <div className="min-w-0 flex-1 pt-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {/* Tipo */}
          <span
            className="inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-bold uppercase tracking-[0.14em]"
            style={{ background: cfg.bg, color: cfg.fg }}
          >
            {cfg.label}
          </span>

          {/* Ator */}
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--vm-ink)" }}>
            {entry.ator.nome}
          </span>
          <span className="text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
            {entry.ator.role === "admin" ? "Admin" : "Técnico"}
          </span>
        </div>

        {/* Alvo / descrição */}
        {(entry.alvo || entry.descricao) && (
          <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: "var(--vm-text-soft)" }}>
            {entry.alvo && (
              <span className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--vm-ink)" }}>
                {entry.alvo.tipo === "vistoria" && (
                  <RadioTower className="h-3 w-3 shrink-0" style={{ color: "var(--vm-faint)" }} />
                )}
                {entry.alvo.label}
              </span>
            )}
            {entry.alvo && entry.descricao && " — "}
            {entry.descricao}
          </p>
        )}

        {/* Meta — hora + relativo */}
        <p className="mt-1 flex items-center gap-2 text-[10.5px]" style={{ color: "var(--vm-faint-b)" }}>
          <span className="font-mono">{fmtHora(entry.timestamp)}</span>
          <span>·</span>
          <span>{relativo(entry.timestamp)}</span>
        </p>
      </div>
    </motion.div>
  );
}

/* ─── Separador de dia ───────────────────────────────────────────────── */
function DiaSeparador({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="h-px flex-1" style={{ background: "rgba(6,59,59,0.07)" }} />
      <span
        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
        style={{ background: "var(--vm-tile-3)", color: "var(--vm-muted)" }}
      >
        {label}
        <span
          className="rounded-full px-1.5 text-[9px] tabular-nums"
          style={{ background: "rgba(6,59,59,0.07)", color: "var(--vm-text-soft)" }}
        >
          {count}
        </span>
      </span>
      <div className="h-px flex-1" style={{ background: "rgba(6,59,59,0.07)" }} />
    </div>
  );
}

/* ─── Página ─────────────────────────────────────────────────────────── */
export default function AuditoriaPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<AuditEntry["acao"] | "todos">("todos");
  const topo = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await painelService.fetchAudit({ limit: 300 });
      setEntries(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 20_000);
    return () => window.clearInterval(id);
  }, []);

  const lista = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (tipoFiltro !== "todos" && e.acao !== tipoFiltro) return false;
      if (!q) return true;
      return (
        e.ator.nome.toLowerCase().includes(q) ||
        (e.alvo?.label ?? "").toLowerCase().includes(q) ||
        (e.descricao ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, query, tipoFiltro]);

  // Agrupa por dia
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; entries: AuditEntry[] }>();
    for (const e of lista) {
      const d = parseUTC(e.timestamp);
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, { label: fmtDia(e.timestamp), entries: [] });
      map.get(key)!.entries.push(e);
    }
    return Array.from(map.values());
  }, [lista]);

  // KPIs do período filtrado
  const kpis = useMemo(() => {
    const hoje = lista.filter(
      (e) => Date.now() - parseUTC(e.timestamp).getTime() < 86_400_000
    );
    return {
      total: lista.length,
      hoje: hoje.length,
      atribuicoes: lista.filter((e) => e.acao === "vistoria-atribuida" || e.acao === "revisita-atribuida").length,
      reprovacoes: lista.filter((e) => e.acao === "vistoria-reprovada").length,
    };
  }, [lista]);

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.18em]"
              style={{ background: "var(--vm-accent-tint)", color: "#00875F", border: "1px solid rgba(0,179,136,0.22)" }}>
              <Activity className="h-2.5 w-2.5" /> Timeline operacional
            </span>
            {loading && <RefreshCcw className="h-3 w-3 animate-spin" style={{ color: "var(--vm-faint-b)" }} />}
          </div>
          <h1 className="text-[28px] font-semibold tracking-[-0.5px]" style={{ color: "var(--vm-ink)" }}>Auditoria</h1>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--vm-muted-b)" }}>
            Rastreabilidade completa de cada ação na operação.
          </p>
        </div>
        {/* KPIs */}
        <div className="flex shrink-0 items-center gap-5">
          <div className="flex flex-col items-end">
            <span className="text-[22px] font-semibold tabular-nums tracking-tight" style={{ color: "var(--vm-ink)" }}>{kpis.hoje}</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--vm-muted)" }}>hoje</span>
          </div>
          <div className="h-10 w-px" style={{ background: "var(--vm-border)" }} />
          <div className="flex flex-col items-end">
            <span className="text-[22px] font-semibold tabular-nums tracking-tight" style={{ color: "#00875F" }}>{kpis.atribuicoes}</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--vm-muted)" }}>atribuições</span>
          </div>
          <div className="h-10 w-px" style={{ background: "var(--vm-border)" }} />
          <div className="flex flex-col items-end">
            <span className="text-[22px] font-semibold tabular-nums tracking-tight" style={{ color: "#B91C1C" }}>{kpis.reprovacoes}</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--vm-muted)" }}>reprovações</span>
          </div>
        </div>
      </motion.div>

      {/* BUSCA + FILTROS */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border-soft)", boxShadow: "0 1px 3px rgba(6,59,59,0.03)" }}>
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--vm-faint-b)" }} strokeWidth={2.2} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ator, equipamento, descrição…"
            className="flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-[#C0C8D2]"
            style={{ color: "var(--vm-ink)" }} />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-[var(--vm-faint-b)]"><X className="h-3.5 w-3.5" /></button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-2xl p-1.5"
          style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border-soft)", boxShadow: "0 1px 3px rgba(6,59,59,0.03)" }}>
          <Filter className="ml-1 h-3 w-3 shrink-0" style={{ color: "var(--vm-faint-b)" }} strokeWidth={2.2} />
          {TIPO_FILTROS.map((f) => {
            const active = tipoFiltro === f.id;
            const cfg = f.id !== "todos" ? ACAO[f.id as AuditEntry["acao"]] : null;
            const cor = cfg?.fg ?? "#00B388";
            const count = f.id === "todos" ? lista.length : lista.filter((e) => e.acao === f.id).length;
            return (
              <button key={f.id} type="button" onClick={() => setTipoFiltro(f.id as AuditEntry["acao"] | "todos")}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition"
                style={{
                  background: active ? `${cor}22` : "transparent",
                  color: active ? cor : "#7A8896",
                  border: active ? `1px solid ${cor}50` : "1px solid transparent",
                }}>
                {cfg && <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.dot }} />}
                {f.label}
                <span className="tabular-nums text-[9.5px]" style={{ color: active ? cor : "var(--vm-faint-b)" }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TIMELINE */}
      <div ref={topo} className="overflow-hidden rounded-[20px] p-6"
        style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border-soft)", boxShadow: "0 1px 3px rgba(6,59,59,0.04),0 8px 24px var(--vm-border-soft)" }}>
        {grouped.length === 0 && !loading && (
          <div className="flex flex-col items-center py-16">
            <Sparkles className="mb-3 h-8 w-8" style={{ color: "#00B388" }} strokeWidth={1.5} />
            <p className="text-[13px] font-semibold" style={{ color: "var(--vm-ink)" }}>Nenhum evento registrado</p>
            <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--vm-faint)" }}>
              {query ? "Nenhum resultado para a busca." : "Aguardando atividade da operação."}
            </p>
          </div>
        )}

        {grouped.map((grupo) => (
          <div key={grupo.label} className="mb-2">
            <DiaSeparador label={grupo.label} count={grupo.entries.length} />
            {grupo.entries.map((e, i) => (
              <EventoItem key={e.id} entry={e} isLast={i === grupo.entries.length - 1} />
            ))}
          </div>
        ))}

        {lista.length > 0 && (
          <div className="mt-2 flex items-center justify-between border-t pt-4 text-[10.5px]"
            style={{ borderColor: "var(--vm-border-soft)", color: "var(--vm-faint)" }}>
            <span className="inline-flex items-center gap-1.5">
              <Activity className="h-3 w-3" style={{ color: "#00B388" }} />
              {kpis.total} eventos carregados · atualiza a cada 20s
            </span>
            <button type="button" onClick={load}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition hover:bg-black/5"
              style={{ color: "#00875F" }}>
              <RefreshCcw className="h-3 w-3" strokeWidth={2.2} /> Atualizar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
