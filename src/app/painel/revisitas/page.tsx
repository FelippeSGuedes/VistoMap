"use client";

/**
 * /painel/revisitas — Central de Tratamento Operacional.
 * Oficina operacional premium. Cards ao invés de tabelas.
 * Cada reprovado é um caso a tratar, não uma linha de grid.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  MapPin,
  Pencil,
  RefreshCcw,
  RotateCw,
  Search,
  Sparkles,
  UserCheck,
  UserPlus,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { painelService } from "@/services/painel";
import { useAuthStore } from "@/store/auth";
import { EditarVistoriaModal } from "@/components/painel/EditarVistoriaModal";
import { DateRangeFilter, dentroDoRange, type DateRange } from "@/components/painel/DateRangeFilter";
import { classificarMotivoClient } from "@/utils/motivos-client";
import type {
  RevisitaPendente,
  TecnicoAtivo,
  VistoriaPriority,
} from "@/types";

function relativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.round(diff / 3_600_000);
  if (h < 1) return "agora";
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
}

const PRIORIDADE_CONFIG: Record<
  VistoriaPriority,
  { bg: string; fg: string; border: string; label: string; glow: string }
> = {
  CRITICA: { bg: "var(--vm-red-tint)", fg: "#B91C1C", border: "rgba(239,68,68,0.3)", label: "Crítica", glow: "rgba(239,68,68,0.12)" },
  ALTA:    { bg: "var(--vm-orange-tint)", fg: "#C2410C", border: "rgba(249,115,22,0.3)", label: "Alta",    glow: "rgba(249,115,22,0.10)" },
  MEDIA:   { bg: "var(--vm-indigo-tint)", fg: "#4338CA", border: "rgba(99,102,241,0.25)", label: "Média",  glow: "rgba(99,102,241,0.06)" },
  BAIXA:   { bg: "var(--vm-tile-3)", fg: "#475569", border: "rgba(71,85,105,0.18)",  label: "Baixa",  glow: "rgba(71,85,105,0.04)" },
};

function initials(nome: string) {
  const p = nome.trim().split(/[\s._-]+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase();
}

/* ─── Card de Revisita ─────────────────────────────────────────────── */
function RevisitaCard({
  r,
  onAtribuir,
  onEditar,
  onRegerar,
  onAprovar,
  submitting,
  podeAgir,
}: {
  r: RevisitaPendente;
  onAtribuir: () => void;
  onEditar: () => void;
  onRegerar: () => void;
  onAprovar: () => void;
  submitting: boolean;
  podeAgir: boolean;
}) {
  const pri = PRIORIDADE_CONFIG[r.prioridade];
  const isCritica = r.prioridade === "CRITICA" || r.prioridade === "ALTA";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      className="relative overflow-hidden rounded-[20px] transition-shadow"
      style={{
        background: "var(--vm-card)",
        border: `1.5px solid ${pri.border}`,
        boxShadow: `0 2px 8px rgba(6,59,59,0.04), 0 0 0 1px rgba(6,59,59,0.01)`,
      }}
    >
      {/* Barra lateral de prioridade */}
      <div
        className="absolute inset-y-0 left-0 w-1 rounded-l-[20px]"
        style={{ background: pri.fg, opacity: isCritica ? 1 : 0.4 }}
      />

      {/* CABEÇALHO DO CARD */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 pl-6">
        <div className="min-w-0 flex-1">
          {/* Badge de tipo */}
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[9px] font-bold uppercase tracking-[0.14em]"
              style={{ background: pri.bg, color: pri.fg }}
            >
              <RotateCw className="h-2.5 w-2.5" strokeWidth={2.5} />
              Revisita · {pri.label}
            </span>
            {isCritica && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-[2px] text-[8.5px] font-bold uppercase tracking-[0.12em]"
                style={{ background: "var(--vm-red-tint)", color: "#B91C1C" }}
              >
                <Zap className="h-2 w-2" />
                Urgente
              </span>
            )}
          </div>

          {/* Equipamento */}
          <h3
            className="truncate text-[15px] font-semibold tracking-[-0.3px]"
            style={{ color: "var(--vm-ink)" }}
          >
            {r.equipamento}
          </h3>

          {/* Meta */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--vm-muted)" }}>
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {r.municipio}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              reprovado {relativo(r.reprovadoEm)}
            </span>
            <span className="rounded bg-black/[0.04] px-1 font-mono text-[10px]">
              {r.glpiId}
            </span>
          </div>
        </div>

        {/* Técnico atribuído (ou vazio) */}
        <div className="shrink-0">
          {r.tecnicoAtribuido ? (
            <div className="flex flex-col items-center gap-1">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                style={{ background: "linear-gradient(145deg,#00C99B,#00875F)" }}
              >
                {initials(r.tecnicoAtribuido.nome)}
              </span>
              <span className="max-w-[64px] truncate text-center text-[9.5px] font-medium" style={{ color: "var(--vm-muted-b)" }}>
                {r.tecnicoAtribuido.nome.split(" ")[0]}
              </span>
            </div>
          ) : podeAgir ? (
            <button
              type="button"
              onClick={onAtribuir}
              className="flex flex-col items-center gap-1 opacity-60 transition hover:opacity-100"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: "var(--vm-tile-3)", border: "1.5px dashed var(--vm-ph-icon)" }}
              >
                <UserPlus className="h-4 w-4" style={{ color: "var(--vm-faint)" }} strokeWidth={1.8} />
              </span>
              <span className="text-[9.5px] font-medium" style={{ color: "var(--vm-faint)" }}>Atribuir</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* MOTIVO — bloco de destaque visual com categoria classificada */}
      <div
        className="mx-5 mb-3 ml-6 rounded-xl px-3 py-2.5"
        style={{
          background: pri.bg,
          border: `1px solid ${pri.border}`,
        }}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: pri.fg }}>
            Motivo da reprovação
          </p>
          {(() => {
            const cat = classificarMotivoClient(r.motivoReprovacao);
            return (
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-[2px] text-[8.5px] font-bold uppercase tracking-[0.12em]"
                style={{
                  background: `${cat.color}1F`,
                  color: cat.color,
                  border: `1px solid ${cat.color}55`,
                }}
                title={cat.label}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />
                {cat.short}
              </span>
            );
          })()}
        </div>
        <p className="text-[12.5px] font-medium leading-snug" style={{ color: "var(--vm-text)" }}>
          {r.motivoReprovacao || "Não informado"}
        </p>
      </div>

      {/* STATUS DO PDF */}
      <div className="flex items-center gap-3 px-5 pb-3 pl-6">
        {r.pdfAnteriorPath ? (
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "#4338CA" }}>
            <FileText className="h-3.5 w-3.5" strokeWidth={2} />
            PDF anterior disponível
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--vm-faint)" }}>
            <FileText className="h-3.5 w-3.5" strokeWidth={2} />
            Sem PDF anterior
          </span>
        )}
        {r.reprovadoPor && (
          <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--vm-muted)" }}>
            <UserCheck className="h-3 w-3" />
            por {r.reprovadoPor}
          </span>
        )}
      </div>

      {/* AÇÕES — leitura só visualiza, sem botões de ação */}
      {podeAgir && (
        <div
          className="flex items-center gap-1.5 border-t px-4 py-2.5 pl-6"
          style={{ borderColor: "var(--vm-border-soft)" }}
        >
          <button
            type="button"
            onClick={onEditar}
            className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition hover:opacity-80"
            style={{ background: "var(--vm-indigo-tint)", color: "#4338CA", border: "1px solid rgba(99,102,241,0.2)" }}
          >
            <Wrench className="h-3 w-3" strokeWidth={2.2} />
            Corrigir Campos
          </button>
          <button
            type="button"
            onClick={onAtribuir}
            className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition hover:opacity-80"
            style={{ background: "var(--vm-accent-tint)", color: "#00875F", border: "1px solid rgba(0,179,136,0.2)" }}
          >
            <UserPlus className="h-3 w-3" strokeWidth={2.2} />
            {r.tecnicoAtribuido ? "Reatribuir" : "Atribuir Revisita"}
          </button>
          <button
            type="button"
            onClick={onRegerar}
            disabled={submitting}
            className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition hover:opacity-80 disabled:opacity-40"
            style={{ background: "var(--vm-teal-tint)", color: "#0F766E", border: "1px solid rgba(15,118,110,0.18)" }}
          >
            <RefreshCcw className={`h-3 w-3 ${submitting ? "animate-spin" : ""}`} strokeWidth={2.2} />
            Regenerar Projeto
          </button>
          <button
            type="button"
            onClick={onAprovar}
            disabled={submitting}
            className="ml-auto flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition hover:opacity-80 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#00C99B,#00875F)", color: "#fff", border: "1px solid rgba(0,135,95,0.45)" }}
          >
            <CheckCircle2 className="h-3 w-3" strokeWidth={2.4} />
            Aprovar Revisita
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* ─── Página ───────────────────────────────────────────────────────── */
export default function RevisitasPage() {
  const { session } = useAuthStore();
  const podeAgir = session?.role !== "leitura";
  const [lista, setLista] = useState<RevisitaPendente[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoAtivo[]>([]);
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ de: null, ate: null });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [atribuirOpen, setAtribuirOpen] = useState<RevisitaPendente | null>(
    null
  );
  const [editarOpen, setEditarOpen] = useState<RevisitaPendente | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const carregar = async () => {
    const [r, t] = await Promise.all([
      painelService.fetchRevisitas(),
      painelService.fetchTecnicos(),
    ]);
    setLista(r);
    setTecnicos(t);
  };

  useEffect(() => {
    carregar();
    const id = window.setInterval(carregar, 20000);
    return () => window.clearInterval(id);
  }, []);

  const filtrada = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lista.filter((r) => {
      if (!dentroDoRange(r.reprovadoEm, dateRange)) return false;
      if (!q) return true;
      return (
        r.equipamento.toLowerCase().includes(q) ||
        r.municipio.toLowerCase().includes(q) ||
        r.motivoReprovacao.toLowerCase().includes(q) ||
        r.glpiId.toLowerCase().includes(q)
      );
    });
  }, [lista, query, dateRange]);

  const toggleAll = () => {
    if (selecionados.size === filtrada.length) setSelecionados(new Set());
    else setSelecionados(new Set(filtrada.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selecionados);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelecionados(next);
  };

  const handleAtribuir = async (r: RevisitaPendente, t: TecnicoAtivo) => {
    setSubmitting(r.id);
    try {
      await painelService.atribuir({
        vistoria_id: r.id, // backend extrai numerico de "rev-X"
        tecnico_id: t.id,
        regenerar_pdf: false,
      });
      setToast(`Revisita de ${r.equipamento} atribuída a ${t.nome}.`);
      setTimeout(() => setToast(null), 3000);
      setAtribuirOpen(null);
      carregar();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Falha ao atribuir.";
      setToast(`❌ ${msg}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSubmitting(null);
    }
  };

  const handleAprovar = async (r: RevisitaPendente) => {
    if (!confirm(`Aprovar ${r.equipamento}? Sai da fila de revisitas.`)) return;
    setSubmitting(r.id);
    try {
      const res = await painelService.aprovarVistoria(r.id);
      setToast(
        res.eraRevisita
          ? `Revisita de ${r.equipamento} aprovada · situação: Revisitado.`
          : `${r.equipamento} aprovada · situação: Vistoriado.`
      );
      setTimeout(() => setToast(null), 3000);
      carregar();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Falha ao aprovar.";
      setToast(`❌ ${msg}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSubmitting(null);
    }
  };

  const handleRegerarPdf = async (r: RevisitaPendente) => {
    if (!r.tecnicoAtribuido) {
      setToast("Atribua um técnico antes de regenerar o PDF.");
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setSubmitting(r.id);
    try {
      await painelService.atribuir({
        vistoria_id: r.id,
        tecnico_id: r.tecnicoAtribuido.id,
        regenerar_pdf: true,
      });
      setToast(`PDF de ${r.equipamento} marcado para regeneração.`);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast("Falha ao regerar PDF.");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* HEADER — identidade de central operacional */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.18em]"
              style={{ background: "var(--vm-red-tint)", color: "#B91C1C", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              Tratamento operacional
            </span>
          </div>
          <h1 className="text-[28px] font-semibold tracking-[-0.5px]" style={{ color: "var(--vm-ink)" }}>
            Central de Revisitas
          </h1>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--vm-muted-b)" }}>
            Cada equipamento reprovado é um caso a tratar. Corrija, revise e decida o próximo passo operacional.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Contadores rápidos */}
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[22px] font-semibold tabular-nums tracking-tight" style={{ color: "#B91C1C" }}>
              {lista.filter(r => r.prioridade === "CRITICA" || r.prioridade === "ALTA").length}
            </span>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "#B91C1C" }}>
              urgentes
            </span>
          </div>
          <div className="h-10 w-px" style={{ background: "var(--vm-border)" }} />
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[22px] font-semibold tabular-nums tracking-tight" style={{ color: "var(--vm-ink)" }}>
              {lista.length}
            </span>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--vm-muted)" }}>
              total
            </span>
          </div>
        </div>
      </motion.div>

      {/* BARRA DE BUSCA */}
      <div
        className="flex items-center gap-2 rounded-2xl px-3 py-2.5"
        style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border-soft)", boxShadow: "0 1px 3px rgba(6,59,59,0.03)" }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: "var(--vm-faint-b)" }} strokeWidth={2.2} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar equipamento, município, motivo…"
          className="flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-[#C0C8D2]"
          style={{ color: "var(--vm-ink)" }}
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="text-[var(--vm-faint-b)] transition hover:text-[var(--vm-muted-b)]">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-[0.1em]"
          style={{ background: "var(--vm-orange-tint)", color: "#C2410C" }}
        >
          <RotateCw className="h-2.5 w-2.5" /> {filtrada.length}
        </span>
      </div>

      {/* GRID DE CARDS OPERACIONAIS */}
      <AnimatePresence mode="popLayout">
        {filtrada.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-[20px] py-16"
            style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border-soft)" }}
          >
            <Sparkles className="mb-3 h-8 w-8" style={{ color: "#00B388" }} strokeWidth={1.5} />
            <p className="text-[14px] font-semibold" style={{ color: "var(--vm-ink)" }}>
              {query ? "Nenhuma revisita encontrada" : "Operação em dia"}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--vm-faint)" }}>
              {query ? "Tente outro termo de busca." : "Nenhuma revisita pendente no momento."}
            </p>
          </motion.div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))" }}>
            {filtrada.map((r) => (
              <RevisitaCard
                key={r.id}
                r={r}
                onAtribuir={() => setAtribuirOpen(r)}
                onEditar={() => setEditarOpen(r)}
                onRegerar={() => handleRegerarPdf(r)}
                onAprovar={() => handleAprovar(r)}
                submitting={submitting === r.id}
                podeAgir={podeAgir}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* DRAWER ATRIBUIR */}
      <AnimatePresence>
        {atribuirOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6"
            style={{ background: "var(--vm-backdrop)", backdropFilter: "blur(12px)" }}
            onClick={() => setAtribuirOpen(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[420px] overflow-hidden rounded-[24px]"
              style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", boxShadow: "0 24px 60px rgba(6,59,59,0.2)" }}
            >
              <header className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--vm-border-soft)" }}>
                <div>
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: "#C2410C" }}>
                    Atribuir revisita
                  </p>
                  <h3 className="mt-0.5 text-[16px] font-semibold tracking-[-0.3px]" style={{ color: "var(--vm-ink)" }}>
                    {atribuirOpen.equipamento}
                  </h3>
                  <p className="text-[11px]" style={{ color: "var(--vm-muted)" }}>
                    {atribuirOpen.municipio} · {atribuirOpen.glpiId}
                  </p>
                </div>
                <button type="button" onClick={() => setAtribuirOpen(null)} className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-black/5" style={{ color: "var(--vm-muted)" }}>
                  <X className="h-4 w-4" />
                </button>
              </header>
              <div className="space-y-1 p-3">
                <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--vm-faint-b)" }}>
                  Técnicos disponíveis
                </p>
                {tecnicos.filter((t) => t.status !== "offline").map((t) => {
                  const statusColor = t.status === "em-campo" ? "#00B388" : t.status === "base" ? "#6366F1" : "var(--vm-faint)";
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={submitting === atribuirOpen.id}
                      onClick={() => handleAtribuir(atribuirOpen, t)}
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-emerald-50 disabled:opacity-50"
                    >
                      <span className="relative flex h-8 w-8 items-center justify-center rounded-xl text-[10px] font-bold text-white" style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}>
                        {initials(t.nome)}
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full" style={{ background: statusColor, boxShadow: "0 0 0 2px var(--vm-card)" }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold" style={{ color: "var(--vm-ink)" }}>{t.nome}</p>
                        <p className="text-[10px]" style={{ color: "var(--vm-muted)" }}>{t.municipio ?? "—"} · {t.atribuidas} atrib</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--vm-faint-b)" }} />
                    </button>
                  );
                })}
                {tecnicos.filter((t) => t.status !== "offline").length === 0 && (
                  <p className="px-2 py-4 text-center text-[12px]" style={{ color: "var(--vm-faint)" }}>Nenhum técnico disponível no momento.</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL EDITAR */}
      <EditarVistoriaModal
        open={!!editarOpen}
        vistoriaId={editarOpen ? editarOpen.id.replace(/^rev-/, "") : null}
        equipamento={editarOpen?.equipamento}
        municipio={editarOpen?.municipio}
        initial={{ motivofield: editarOpen?.motivoReprovacao ?? "" }}
        onClose={() => setEditarOpen(null)}
        onSaved={(r) => {
          setToast(r.regeneradoPdf ? "Salvo · PDF marcado para regeneração." : `Salvo · ${r.affected} campo(s) atualizado(s).`);
          setTimeout(() => setToast(null), 3500);
          carregar();
        }}
      />

      {/* TOAST */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-8 left-1/2 z-[210] flex items-center gap-2 rounded-2xl px-4 py-2.5"
            style={{ background: "var(--vm-card)", border: "1px solid rgba(0,179,136,0.28)", boxShadow: "0 12px 32px rgba(0,179,136,0.16), 0 4px 12px var(--vm-border)" }}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#00B388" }} />
            <span className="text-[12.5px] font-medium" style={{ color: "var(--vm-ink)" }}>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}



