"use client";

/**
 * /painel/vistorias — Central de Distribuição Operacional.
 *
 * Grid de cards por município + drawer lateral de detalhes.
 * Seleção em massa, atribuição em lote, edição individual.
 * Performance para 5k-20k registros: chunks por município + lazy expand no drawer.
 *
 * Design: paleta neutra/corporativa. Emerald é reservado para seleção e ações
 * (cor de marca), nunca para sinalizar urgência — todas as vistorias têm a
 * mesma importância operacional.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Filter,
  Layers,
  MapPin,
  Pencil,
  RefreshCcw,
  RotateCw,
  Search,
  Sparkles,
  Square,
  UserCheck,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { painelService, type FilaItem } from "@/services/painel";
import { EditarVistoriaModal } from "@/components/painel/EditarVistoriaModal";
import { DateRangeFilter, dentroDoRange, type DateRange } from "@/components/painel/DateRangeFilter";
import { VistoriaMetricsBadge } from "@/components/painel/VistoriaMetricsBadge";
import type { TecnicoAtivo } from "@/types";

// ─── Paleta neutra/corporativa ────────────────────────────────────────────
const C = {
  ink: "var(--vm-ink)",
  inkSoft: "var(--vm-text-soft)",
  muted: "var(--vm-muted)",
  faint: "var(--vm-faint)",
  line: "var(--vm-border)",
  lineSoft: "var(--vm-border-soft)",
  surface: "var(--vm-card)",
  surfaceAlt: "var(--vm-card-hover)",
  brand: "#00B388",
  brandDeep: "#00875F",
  brandTint: "var(--vm-accent-tint)",
  brandLine: "rgba(0,179,136,0.22)",
  iconBg: "var(--vm-fill-2)",
  iconFg: "var(--vm-text-soft)",
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────
function relativo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.round(diff / 3_600_000);
  if (h < 1) {
    const m = Math.round(diff / 60_000);
    return m < 1 ? "agora" : `há ${m}min`;
  }
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
}

function initials(nome: string) {
  const p = nome.trim().split(/[\s._-]+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase();
}

const STATUS_COR: Record<string, string> = {
  "em-campo": "#00B388",
  base: "#6366F1",
  "off-shift": "var(--vm-faint)",
  offline: "#4B5563",
};

// ─── Tipos locais ────────────────────────────────────────────────────────
interface GrupoMunicipio {
  municipio: string;
  items: FilaItem[];
  total: number;
  revisitas: number;
  semAtribuicao: number;
  atribuidas: number;
  percentAtribuido: number;
}

type FiltroTipo = "todos" | "nova" | "revisita";
/** "atribuido" só se aplica dentro do bucket A_VISTORIAR — já tem técnico,
 *  aguardando ele iniciar (mesmo conceito do pin rosa "Atribuído" do mapa). */
type FiltroAtrib = "todos" | "sem" | "atribuido";
const COR_ATRIBUIDO = "#EC4899";

const CHUNK = 25;

// ─── EquipamentoRow ──────────────────────────────────────────────────────
function EquipamentoRow({
  item,
  checked,
  onToggle,
  onAtribuir,
  onEditar,
}: {
  item: FilaItem;
  checked: boolean;
  onToggle: () => void;
  onAtribuir: () => void;
  onEditar: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl p-3 transition"
      style={{
        background: checked ? C.brandTint : C.surface,
        border: checked
          ? "1px solid rgba(0,179,136,0.4)"
          : `1px solid ${C.line}`,
        boxShadow: checked
          ? "0 2px 10px rgba(0,179,136,0.12)"
          : "0 1px 3px rgba(6,59,59,0.04)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 transition hover:scale-110"
        style={{ color: checked ? C.brand : "#C0C8D2" }}
      >
        {checked ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
      </button>

      {/* avatar do técnico ou placeholder vazio */}
      {item.tecnico ? (
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
          style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}
        >
          {initials(item.tecnico.nome)}
        </span>
      ) : (
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: C.iconBg, color: "var(--vm-ph-icon)" }}
        >
          <UserPlus className="h-4 w-4" strokeWidth={2} />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[14px] font-semibold" style={{ color: C.ink }}>
            {item.equipamento}
          </p>
          {item.isRepeat && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-[0.1em]"
              style={{ background: C.iconBg, color: C.inkSoft }}
            >
              <RotateCw className="h-2 w-2" strokeWidth={2.5} />
              Revisita
            </span>
          )}
        </div>
        <p className="truncate text-[11.5px]" style={{ color: C.muted }}>
          <span className="font-mono">{item.glpiId}</span>
          {item.endereco ? ` · ${item.endereco}` : ""}
          {item.tecnico ? (
            <>
              {" · "}
              <span style={{ color: C.brandDeep, fontWeight: 600 }}>
                {item.tecnico.nome.split(" ")[0]}
              </span>
            </>
          ) : (
            <span style={{ color: C.faint, fontWeight: 600 }}> · sem técnico</span>
          )}
          {item.dataVistoria ? ` · ${relativo(item.dataVistoria)}` : ""}
        </p>
        <div className="mt-1">
          <VistoriaMetricsBadge vistoriaId={item.id} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {/* Reatribuir/desvincular um técnico já em campo é só na Central de
            Vistorias (2026-08-21) — aqui só oferece a ação pra quem ainda
            não tem ninguém atribuído. */}
        {!item.tecnico && (
          <button
            type="button"
            onClick={onAtribuir}
            className="flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-semibold transition hover:opacity-85"
            style={{
              background: C.brandTint,
              color: C.brandDeep,
              border: `1px solid ${C.brandLine}`,
            }}
          >
            <UserPlus className="h-3.5 w-3.5" strokeWidth={2.3} />
            Atribuir
          </button>
        )}
        <button
          type="button"
          onClick={onEditar}
          className="flex h-8 w-8 items-center justify-center rounded-xl transition hover:bg-black/5"
          style={{ color: C.faint, border: `1px solid ${C.line}` }}
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

// ─── StatChip (sub-stat neutro nos cards) ──────────────────────────────────
function StatChip({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof UserCheck;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: C.faint }} strokeWidth={2} />
      <span className="text-[12px] font-semibold tabular-nums" style={{ color: C.inkSoft }}>
        {value}
      </span>
      <span className="text-[11px]" style={{ color: C.muted }}>
        {label}
      </span>
    </div>
  );
}

// ─── MunicipioCard (grid) ──────────────────────────────────────────────────
function MunicipioCard({
  grupo,
  selCount,
  onOpen,
  onAtribuirGrupo,
}: {
  grupo: GrupoMunicipio;
  selCount: number;
  onOpen: () => void;
  onAtribuirGrupo: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group flex h-full cursor-pointer flex-col rounded-[18px] text-left outline-none transition duration-150 hover:-translate-y-0.5 focus-visible:ring-2"
      style={{
        background: C.surface,
        border: selCount > 0 ? "1px solid rgba(0,179,136,0.4)" : `1px solid ${C.line}`,
        boxShadow:
          selCount > 0
            ? "0 4px 16px rgba(0,179,136,0.12)"
            : "0 1px 4px var(--vm-border-soft)",
      }}
    >
      {/* Topo: ícone + nome + seleção */}
      <div className="flex items-start gap-3 p-4 pb-2">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
          style={{ background: C.iconBg, color: C.iconFg }}
        >
          <Building2 className="h-[18px] w-[18px]" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-[15px] font-semibold leading-tight tracking-[-0.2px]"
            style={{ color: C.ink }}
            title={grupo.municipio}
          >
            {grupo.municipio}
          </h3>
          <p className="mt-0.5 text-[11.5px]" style={{ color: C.muted }}>
            {grupo.total} vistoria{grupo.total !== 1 ? "s" : ""} pendente
            {grupo.total !== 1 ? "s" : ""}
          </p>
        </div>
        {selCount > 0 && (
          <span
            className="flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[9.5px] font-bold"
            style={{ background: C.brandTint, color: C.brandDeep }}
          >
            <CheckSquare className="h-3 w-3" strokeWidth={2.5} />
            {selCount}
          </span>
        )}
      </div>

      {/* Número grande */}
      <div className="flex items-end gap-2 px-4">
        <span
          className="text-[40px] font-bold leading-none tabular-nums tracking-[-1px]"
          style={{ color: C.ink }}
        >
          {grupo.total}
        </span>
        <span className="mb-1 text-[11px] font-medium" style={{ color: C.faint }}>
          equipamentos
        </span>
      </div>

      {/* Barra de progresso de atribuição (cor única neutra) */}
      <div className="px-4 pt-3">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--vm-border-soft)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${grupo.percentAtribuido}%`, background: C.brand }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <StatChip icon={UserCheck} value={grupo.atribuidas} label="atribuídas" />
          <StatChip icon={UserPlus} value={grupo.semAtribuicao} label="a atribuir" />
          {grupo.revisitas > 0 && (
            <StatChip icon={RotateCw} value={grupo.revisitas} label="revisitas" />
          )}
        </div>
      </div>

      {/* Rodapé: ações */}
      <div
        className="mt-auto flex items-center gap-2 p-3 pt-3"
        style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: 12 }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAtribuirGrupo();
          }}
          className="flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-semibold transition hover:opacity-85"
          style={{
            background: C.brandTint,
            color: C.brandDeep,
            border: `1px solid ${C.brandLine}`,
          }}
        >
          <UserPlus className="h-3.5 w-3.5" strokeWidth={2.3} />
          Atribuir todos
        </button>
        <span
          className="ml-auto flex items-center gap-1 text-[11.5px] font-semibold transition group-hover:gap-1.5"
          style={{ color: C.inkSoft }}
        >
          Ver vistorias
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
      </div>
    </div>
  );
}

// ─── MunicipioDetailDrawer (detalhes de um município) ──────────────────────
function MunicipioDetailDrawer({
  grupo,
  selecionados,
  onClose,
  onToggleAll,
  onToggleItem,
  onAtribuirItem,
  onAtribuirGrupo,
  onEditar,
}: {
  grupo: GrupoMunicipio | null;
  selecionados: Set<number>;
  onClose: () => void;
  onToggleAll: (ids: number[]) => void;
  onToggleItem: (id: number) => void;
  onAtribuirItem: (item: FilaItem) => void;
  onAtribuirGrupo: () => void;
  onEditar: (item: FilaItem) => void;
}) {
  const [q, setQ] = useState("");
  const [visivel, setVisivel] = useState(CHUNK);

  // Reseta busca/paginação ao trocar de município
  useEffect(() => {
    setQ("");
    setVisivel(CHUNK);
  }, [grupo?.municipio]);

  const filtrados = useMemo(() => {
    if (!grupo) return [];
    const t = q.trim().toLowerCase();
    if (!t) return grupo.items;
    return grupo.items.filter(
      (i) =>
        i.equipamento.toLowerCase().includes(t) ||
        i.glpiId.toLowerCase().includes(t) ||
        (i.endereco ?? "").toLowerCase().includes(t) ||
        (i.tecnico?.nome ?? "").toLowerCase().includes(t)
    );
  }, [grupo, q]);

  const ids = grupo?.items.map((i) => i.id) ?? [];
  const checkedCount = ids.filter((id) => selecionados.has(id)).length;
  const allChecked = checkedCount === ids.length && ids.length > 0;

  return (
    <AnimatePresence>
      {grupo && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200]"
            style={{ background: "rgba(6,59,59,0.10)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="fixed bottom-0 right-0 top-0 z-[201] flex w-full max-w-[600px] flex-col"
            style={{
              background: C.surfaceAlt,
              boxShadow: "-4px 0 40px rgba(6,59,59,0.16)",
              borderLeft: `1px solid ${C.line}`,
            }}
          >
            {/* Header */}
            <div
              className="shrink-0 px-5 pb-4 pt-6"
              style={{ background: C.surface, borderBottom: `1px solid ${C.line}` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]"
                    style={{ background: C.iconBg, color: C.iconFg }}
                  >
                    <Building2 className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <div>
                    <p
                      className="text-[9px] font-bold uppercase tracking-[0.18em]"
                      style={{ color: C.brand }}
                    >
                      Município
                    </p>
                    <h2
                      className="text-[19px] font-semibold tracking-[-0.3px]"
                      style={{ color: C.ink }}
                    >
                      {grupo.municipio}
                    </h2>
                    <p className="text-[11.5px]" style={{ color: C.muted }}>
                      {grupo.total} pendentes · {grupo.atribuidas} atribuídas
                      {grupo.revisitas > 0 ? ` · ${grupo.revisitas} revisitas` : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5"
                  style={{ color: C.muted }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Busca local + ações */}
              <div className="mt-4 flex items-center gap-2">
                <div
                  className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2"
                  style={{ background: C.surfaceAlt, border: `1px solid ${C.line}` }}
                >
                  <Search className="h-3.5 w-3.5 shrink-0" style={{ color: C.faint }} strokeWidth={2.2} />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Filtrar neste município…"
                    className="flex-1 bg-transparent text-[12.5px] font-medium outline-none placeholder:text-[#C0C8D2]"
                    style={{ color: C.ink }}
                  />
                  {q && (
                    <button type="button" onClick={() => setQ("")} style={{ color: C.faint }}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onToggleAll(ids)}
                  className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-semibold transition hover:bg-black/5"
                  style={{ color: C.inkSoft, border: `1px solid ${C.line}` }}
                >
                  {allChecked ? (
                    <CheckSquare className="h-3.5 w-3.5" style={{ color: C.brand }} />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                  {allChecked ? "Desmarcar" : "Todos"}
                </button>
                <button
                  type="button"
                  onClick={onAtribuirGrupo}
                  className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-bold text-white transition hover:opacity-90"
                  style={{ background: C.brand }}
                >
                  <UserPlus className="h-3.5 w-3.5" strokeWidth={2.3} />
                  Atribuir todos
                </button>
              </div>
            </div>

            {/* Lista de vistorias */}
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {filtrados.length === 0 && (
                <p className="py-12 text-center text-[12.5px]" style={{ color: C.faint }}>
                  Nenhuma vistoria para “{q}”.
                </p>
              )}
              {filtrados.slice(0, visivel).map((item) => (
                <EquipamentoRow
                  key={item.id}
                  item={item}
                  checked={selecionados.has(item.id)}
                  onToggle={() => onToggleItem(item.id)}
                  onAtribuir={() => onAtribuirItem(item)}
                  onEditar={() => onEditar(item)}
                />
              ))}
              {visivel < filtrados.length && (
                <button
                  type="button"
                  onClick={() => setVisivel((v) => v + CHUNK)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11.5px] font-semibold transition hover:bg-white"
                  style={{ color: C.brandDeep, border: `1px dashed ${C.brandLine}` }}
                >
                  Mostrar mais {Math.min(CHUNK, filtrados.length - visivel)} (
                  {filtrados.length - visivel} restantes)
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── AtribuirDrawer ──────────────────────────────────────────────────────
function AtribuirDrawer({
  open,
  count,
  selecionados,
  items,
  tecnicos,
  atribuindo,
  onClose,
  onAtribuir,
}: {
  open: boolean;
  count: number;
  selecionados: Set<number>;
  items: FilaItem[];
  tecnicos: TecnicoAtivo[];
  atribuindo: boolean;
  onClose: () => void;
  onAtribuir: (tecId: string, tecNome: string) => void;
}) {
  const municipiosSel = useMemo(() => {
    const sel = items.filter((i) => selecionados.has(i.id));
    const m = new Map<string, number>();
    for (const i of sel) m.set(i.municipio, (m.get(i.municipio) ?? 0) + 1);
    return m;
  }, [items, selecionados]);

  const sugestoes = useMemo(() => {
    return tecnicos
      .map((t) => {
        const temMunicipio = t.municipio
          ? Array.from(municipiosSel.keys()).some(
              (m) =>
                m.toLowerCase().includes(t.municipio!.toLowerCase()) ||
                t.municipio!.toLowerCase().includes(m.toLowerCase())
            )
          : false;
        return { tec: t, temMunicipio };
      })
      .sort((a, b) => {
        if (a.temMunicipio && !b.temMunicipio) return -1;
        if (!a.temMunicipio && b.temMunicipio) return 1;
        return b.tec.atribuidas - a.tec.atribuidas;
      });
  }, [tecnicos, municipiosSel]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300]"
            style={{ background: "var(--vm-border)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed bottom-0 right-0 top-0 z-[301] flex w-[380px] flex-col overflow-hidden"
            style={{
              background: C.surface,
              boxShadow: "-4px 0 40px rgba(6,59,59,0.14)",
              borderLeft: `1px solid ${C.line}`,
            }}
          >
            <div
              className="flex items-start justify-between border-b px-5 pb-4 pt-6"
              style={{ borderColor: C.line }}
            >
              <div>
                <p
                  className="text-[9px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: C.brand }}
                >
                  Atribuição em lote
                </p>
                <h2
                  className="mt-0.5 text-[18px] font-semibold tracking-[-0.3px]"
                  style={{ color: C.ink }}
                >
                  {count} equipamento{count !== 1 ? "s" : ""}
                </h2>
                {municipiosSel.size > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Array.from(municipiosSel.entries()).map(([m, c]) => (
                      <span
                        key={m}
                        className="rounded-full px-2 py-[2px] text-[9.5px] font-semibold"
                        style={{ background: C.iconBg, color: C.inkSoft }}
                      >
                        {m} ({c})
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black/5"
                style={{ color: C.muted }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {sugestoes.length === 0 && (
                <p className="py-8 text-center text-[12px]" style={{ color: C.faint }}>
                  Nenhum técnico disponível.
                </p>
              )}
              {sugestoes.map(({ tec, temMunicipio }) => (
                <button
                  key={tec.id}
                  type="button"
                  onClick={() => onAtribuir(tec.id, tec.nome)}
                  disabled={atribuindo}
                  className="mb-1 flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition hover:bg-emerald-50/70 disabled:opacity-60"
                >
                  <span
                    className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-[11px] font-bold text-white"
                    style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}
                  >
                    {initials(tec.nome)}
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full"
                      style={{
                        background: STATUS_COR[tec.status] ?? "var(--vm-faint)",
                        boxShadow: "0 0 0 2px var(--vm-card)",
                      }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p
                        className="truncate text-[13px] font-semibold"
                        style={{ color: C.ink }}
                      >
                        {tec.nome}
                      </p>
                      {temMunicipio && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-[1px] text-[7.5px] font-bold uppercase tracking-[0.1em]"
                          style={{ background: C.brandTint, color: C.brandDeep }}
                        >
                          ativo na região
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px]" style={{ color: C.muted }}>
                      {tec.municipio ?? "—"} · {tec.atribuidas} atribuídas · {tec.concluidasHoje} hoje
                    </p>
                    {temMunicipio && tec.municipio && (
                      <p className="text-[9.5px]" style={{ color: C.brandDeep }}>
                        {tec.nome.split(" ")[0]} já possui operação ativa em {tec.municipio}.
                      </p>
                    )}
                  </div>
                  {atribuindo ? (
                    <RefreshCcw
                      className="h-3.5 w-3.5 shrink-0 animate-spin"
                      style={{ color: "var(--vm-faint-b)" }}
                    />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--vm-faint-b)" }} />
                  )}
                </button>
              ))}
            </div>

            <div className="border-t p-4" style={{ borderColor: C.line }}>
              <p className="text-[10px]" style={{ color: C.faint }}>
                Vincula via{" "}
                <code className="rounded bg-black/[0.04] px-1 text-[9.5px]">
                  users_id_vistoriadorafield
                </code>{" "}
                · grupo VistoMap-Técnicos
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Modal de atribuição individual ──────────────────────────────────────
function AtribuirModal({
  item,
  tecnicos,
  onClose,
  onAtribuir,
}: {
  item: FilaItem;
  tecnicos: TecnicoAtivo[];
  onClose: () => void;
  onAtribuir: (tec: TecnicoAtivo) => void;
}) {
  const ativos = tecnicos;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[400] flex items-center justify-center p-6"
      style={{ background: "var(--vm-backdrop)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] overflow-hidden rounded-[24px]"
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          boxShadow: "0 24px 60px rgba(6,59,59,0.2)",
        }}
      >
        <header
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: C.lineSoft }}
        >
          <div>
            <p
              className="text-[9px] font-bold uppercase tracking-[0.18em]"
              style={{ color: C.brand }}
            >
              Atribuir técnico
            </p>
            <h3
              className="mt-0.5 text-[16px] font-semibold tracking-[-0.3px]"
              style={{ color: C.ink }}
            >
              {item.equipamento}
            </h3>
            <p className="text-[11px]" style={{ color: C.muted }}>
              {item.municipio} · {item.glpiId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black/5"
            style={{ color: C.muted }}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-1 p-3">
          {/* Reatribuir/desvincular um técnico já em campo é só na Central
              de Vistorias (2026-08-14, reforçado 2026-08-21) — aqui não
              dava pra ver devolução/recusa em aberto antes de tirar o
              técnico, o que já causou perda de contexto real em produção
              (ver auditoria 12/08). Esse modal agora só abre pra item sem
              técnico nenhum. */}
          {ativos.map((t) => {
            const noMunicipio = t.municipio
              ? t.municipio.toLowerCase().includes(item.municipio.toLowerCase()) ||
                item.municipio.toLowerCase().includes(t.municipio.toLowerCase())
              : false;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onAtribuir(t)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-emerald-50"
              >
                <span
                  className="relative flex h-8 w-8 items-center justify-center rounded-xl text-[10px] font-bold text-white"
                  style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}
                >
                  {initials(t.nome)}
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                    style={{
                      background: STATUS_COR[t.status] ?? "var(--vm-faint)",
                      boxShadow: "0 0 0 2px var(--vm-card)",
                    }}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p
                      className="truncate text-[12.5px] font-semibold"
                      style={{ color: C.ink }}
                    >
                      {t.nome}
                    </p>
                    {noMunicipio && t.municipio && (
                      <span
                        className="rounded-full px-1.5 py-[1px] text-[8px] font-bold"
                        style={{ background: C.brandTint, color: C.brandDeep }}
                      >
                        na região
                      </span>
                    )}
                  </div>
                  <p className="text-[10px]" style={{ color: C.muted }}>
                    {t.municipio ?? "—"} · {t.atribuidas} atrib · {t.concluidasHoje} hoje
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--vm-faint-b)" }} />
              </button>
            );
          })}
          {ativos.length === 0 && (
            <p className="py-4 text-center text-[12px]" style={{ color: C.faint }}>
              Nenhum técnico disponível.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────
export default function FilaVistoriasPage() {
  const [items, setItems] = useState<FilaItem[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoAtivo[]>([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [query, setQuery] = useState("");
  const [filtroMunicipio, setFiltroMunicipio] = useState("");
  const [filtroTecnico, setFiltroTecnico] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [filtroAtrib, setFiltroAtrib] = useState<FiltroAtrib>("todos");
  const [dateRange, setDateRange] = useState<DateRange>({ de: null, ate: null });
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Detalhe (drawer de município) — guarda o NOME para sobreviver a reloads
  const [detalheNome, setDetalheNome] = useState<string | null>(null);

  // Seleção + atribuição
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [atribuirItem, setAtribuirItem] = useState<FilaItem | null>(null);
  const [editarOpen, setEditarOpen] = useState<FilaItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [atribuindo, setAtribuindo] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aVistoriar, aguardando] = await Promise.all([
        painelService.fetchFila({ status: "A_VISTORIAR", limit: 10000 }),
        painelService.fetchFila({ status: "AGUARDANDO_REVISITA", limit: 10000 }),
      ]);
      setItems([...aVistoriar, ...aguardando]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    painelService.fetchTecnicos().then(setTecnicos);
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  // Filtrados
  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filtroMunicipio && i.municipio !== filtroMunicipio) return false;
      if (filtroTecnico && String(i.tecnico?.id) !== filtroTecnico) return false;
      if (filtroTipo === "nova" && i.isRepeat) return false;
      if (filtroTipo === "revisita" && !i.isRepeat) return false;
      if (filtroAtrib === "sem" && i.tecnico) return false;
      if (filtroAtrib === "atribuido" && !(i.status === "A_VISTORIAR" && i.tecnico)) return false;
      if (!dentroDoRange(i.dataVistoria, dateRange)) return false;
      if (!q) return true;
      return (
        i.equipamento.toLowerCase().includes(q) ||
        i.municipio.toLowerCase().includes(q) ||
        i.glpiId.toLowerCase().includes(q) ||
        (i.endereco ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, filtroMunicipio, filtroTecnico, filtroTipo, filtroAtrib, dateRange]);

  // Contadores das pílulas de tipo/atribuição — sobre o total (não sobre
  // `filtrados`), mesmo padrão do Mapa Tempo Real pras pílulas de situação.
  const contagemTipo = useMemo(
    () => ({
      todos: items.length,
      nova: items.filter((i) => !i.isRepeat).length,
      revisita: items.filter((i) => i.isRepeat).length,
    }),
    [items]
  );
  const contagemAtrib = useMemo(
    () => ({
      todos: items.length,
      sem: items.filter((i) => !i.tecnico).length,
      atribuido: items.filter((i) => i.status === "A_VISTORIAR" && i.tecnico).length,
    }),
    [items]
  );

  // Grupos por município
  const grupos = useMemo<GrupoMunicipio[]>(() => {
    const map = new Map<string, FilaItem[]>();
    for (const i of filtrados) {
      const arr = map.get(i.municipio) ?? [];
      arr.push(i);
      map.set(i.municipio, arr);
    }
    return Array.from(map.entries())
      .map(([municipio, its]) => {
        const revisitas = its.filter((i) => i.isRepeat).length;
        const semAtribuicao = its.filter((i) => !i.tecnico).length;
        const total = its.length;
        const atribuidas = total - semAtribuicao;
        const percentAtribuido =
          total > 0 ? Math.round((atribuidas / total) * 100) : 100;
        return {
          municipio,
          items: its,
          total,
          revisitas,
          semAtribuicao,
          atribuidas,
          percentAtribuido,
        };
      })
      .sort((a, b) => a.municipio.localeCompare(b.municipio, "pt-BR"));
  }, [filtrados]);

  // Grupo aberto no drawer de detalhe (derivado → sempre fresco)
  const detalheGrupo = useMemo(
    () => grupos.find((g) => g.municipio === detalheNome) ?? null,
    [grupos, detalheNome]
  );

  const municipiosDisponiveis = useMemo(
    () => Array.from(new Set(items.map((i) => i.municipio))).sort(),
    [items]
  );

  // KPIs
  const kpis = useMemo(
    () => ({
      total: filtrados.length,
      revisitas: filtrados.filter((i) => i.isRepeat).length,
      semAtrib: filtrados.filter((i) => !i.tecnico).length,
      municipios: grupos.length,
    }),
    [filtrados, grupos]
  );

  const temFiltros = !!(
    filtroMunicipio ||
    filtroTecnico ||
    filtroTipo !== "todos" ||
    filtroAtrib !== "todos" ||
    dateRange.de ||
    dateRange.ate
  );

  // Seleção
  const toggleItem = (id: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleMunicipio = (ids: number[]) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      const todos = ids.every((id) => next.has(id));
      if (todos) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  // contagem de selecionados por município (para badge no card)
  const selPorMunicipio = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of grupos) {
      m.set(g.municipio, g.items.filter((i) => selecionados.has(i.id)).length);
    }
    return m;
  }, [grupos, selecionados]);

  // Atribuição em lote
  const handleAtribuirLote = async (tecId: string, tecNome: string) => {
    setAtribuindo(true);
    try {
      await Promise.all(
        Array.from(selecionados).map((id) =>
          painelService.atribuir({ vistoria_id: id, tecnico_id: tecId })
        )
      );
      showToast(`${selecionados.size} equipamento(s) atribuídos a ${tecNome}.`);
      setSelecionados(new Set());
      setDrawerOpen(false);
      load();
    } catch {
      showToast("Falha em parte das atribuições. Verifique a fila.");
    } finally {
      setAtribuindo(false);
    }
  };

  // Atribuição individual
  const handleAtribuirItem = async (item: FilaItem, tec: TecnicoAtivo) => {
    try {
      await painelService.atribuir({ vistoria_id: item.id, tecnico_id: tec.id });
      showToast(`${item.equipamento} atribuído a ${tec.nome}.`);
      setAtribuirItem(null);
      load();
    } catch {
      showToast("Falha ao atribuir.");
    }
  };

  // Atribuir grupo inteiro (seleciona todos + abre drawer de atribuição)
  const handleAtribuirGrupo = (grupo: GrupoMunicipio) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      grupo.items.forEach((i) => next.add(i.id));
      return next;
    });
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-4 pb-20">
      {/* HEADER OPERACIONAL */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[24px]"
        style={{
          background: "linear-gradient(135deg,#063B3B 0%,#0A4F4A 48%,#0E5F54 100%)",
          boxShadow: "0 12px 40px rgba(6,59,59,0.22)",
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 pt-6 pb-5">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{
                  background: "rgba(0,179,136,0.18)",
                  color: "#6EE7C7",
                  border: "1px solid rgba(0,179,136,0.32)",
                }}
              >
                <Zap className="h-3 w-3" /> Central de distribuição
              </span>
              {loading && (
                <RefreshCcw
                  className="h-3.5 w-3.5 animate-spin"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                />
              )}
            </div>
            <h1 className="text-[30px] font-semibold tracking-[-0.6px] text-white">
              Vistorias Pendentes
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: "rgba(255,255,255,0.66)" }}>
              Distribuição regional · {kpis.municipios} municípios ativos · atualiza a cada 30s
            </p>
          </div>
        </div>

        {/* KPI cards — paleta neutra (sem cores de urgência) */}
        <div className="grid grid-cols-2 gap-px sm:grid-cols-4" style={{ background: "rgba(255,255,255,0.08)" }}>
          {[
            { label: "Total na fila", value: kpis.total, icon: Layers, accent: "#6EE7C7" },
            { label: "Municípios", value: kpis.municipios, icon: MapPin, accent: "#A5B4FC" },
            { label: "A atribuir", value: kpis.semAtrib, icon: UserPlus, accent: "#93C5FD" },
            { label: "Revisitas", value: kpis.revisitas, icon: RotateCw, accent: "#CBD5E1" },
          ].map((k) => (
            <div
              key={k.label}
              className="flex items-center gap-3 px-5 py-4"
              style={{ background: "rgba(8,46,44,0.55)", backdropFilter: "blur(4px)" }}
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "rgba(255,255,255,0.07)", color: k.accent }}
              >
                <k.icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <div
                  className="text-[24px] font-semibold leading-none tabular-nums tracking-tight"
                  style={{ color: k.accent }}
                >
                  {k.value}
                </div>
                <div
                  className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.13em]"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  {k.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* BUSCA + FILTROS */}
      <div className="flex items-center gap-2">
        <div
          className="flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{
            background: C.surface,
            border: `1px solid ${C.line}`,
            boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
          }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--vm-faint-b)" }} strokeWidth={2.2} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar equipamento, município, endereço, GIOC ID…"
            className="flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-[#C0C8D2]"
            style={{ color: C.ink }}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} style={{ color: "var(--vm-faint-b)" }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <button
          type="button"
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className="flex h-10 items-center gap-1.5 rounded-2xl px-3 text-[12px] font-semibold transition"
          style={{
            background: temFiltros ? "rgba(0,179,136,0.08)" : C.surface,
            border: temFiltros ? `1px solid ${C.brandLine}` : `1px solid ${C.line}`,
            color: temFiltros ? C.brandDeep : "var(--vm-muted-b)",
            boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
          }}
        >
          <Filter className="h-3.5 w-3.5" strokeWidth={2.2} />
          Filtros
          {temFiltros && (
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white"
              style={{ background: C.brand }}
            >
              {
                [
                  filtroMunicipio,
                  filtroTecnico,
                  filtroTipo !== "todos",
                  filtroAtrib !== "todos",
                ].filter(Boolean).length
              }
            </span>
          )}
        </button>
      </div>

      {/* FILTROS EXPANDIDOS */}
      <AnimatePresence>
        {mostrarFiltros && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="flex flex-wrap items-center gap-2 rounded-2xl p-3"
              style={{
                background: C.surface,
                border: `1px solid ${C.line}`,
                boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
              }}
            >
              <select
                value={filtroMunicipio}
                onChange={(e) => setFiltroMunicipio(e.target.value)}
                className="h-8 rounded-xl px-2.5 text-[12px] font-medium outline-none"
                style={{
                  background: filtroMunicipio ? "rgba(0,179,136,0.08)" : "var(--vm-tile)",
                  border: filtroMunicipio ? `1px solid ${C.brandLine}` : "1px solid var(--vm-border)",
                  color: filtroMunicipio ? C.brandDeep : "var(--vm-muted-b)",
                }}
              >
                <option value="">Todos os municípios</option>
                {municipiosDisponiveis.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={filtroTecnico}
                onChange={(e) => setFiltroTecnico(e.target.value)}
                className="h-8 rounded-xl px-2.5 text-[12px] font-medium outline-none"
                style={{
                  background: filtroTecnico ? "rgba(0,179,136,0.08)" : "var(--vm-tile)",
                  border: filtroTecnico ? `1px solid ${C.brandLine}` : "1px solid var(--vm-border)",
                  color: filtroTecnico ? C.brandDeep : "var(--vm-muted-b)",
                }}
              >
                <option value="">Todos os técnicos</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>

              <div
                className="flex overflow-hidden rounded-xl"
                style={{ border: "1px solid var(--vm-border)" }}
              >
                {(["todos", "nova", "revisita"] as FiltroTipo[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFiltroTipo(v)}
                    className="flex h-8 items-center gap-1 px-3 text-[11px] font-semibold transition"
                    style={{
                      background: filtroTipo === v ? "rgba(0,179,136,0.1)" : "transparent",
                      color: filtroTipo === v ? C.brandDeep : "var(--vm-muted-b)",
                    }}
                  >
                    {v === "todos" ? "Todos" : v === "nova" ? "Novas" : "Revisitas"}
                    <span
                      className="rounded-full px-1.5 text-[9.5px] font-bold tabular-nums"
                      style={{
                        background: filtroTipo === v ? "rgba(0,179,136,0.16)" : "var(--vm-fill-2)",
                        color: filtroTipo === v ? C.brandDeep : "var(--vm-faint)",
                      }}
                    >
                      {contagemTipo[v]}
                    </span>
                  </button>
                ))}
              </div>

              <div
                className="flex overflow-hidden rounded-xl"
                style={{ border: "1px solid var(--vm-border)" }}
              >
                {(["todos", "sem", "atribuido"] as FiltroAtrib[]).map((v) => {
                  const active = filtroAtrib === v;
                  const cor = v === "atribuido" ? COR_ATRIBUIDO : C.brandDeep;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFiltroAtrib(v)}
                      className="flex h-8 items-center gap-1 px-3 text-[11px] font-semibold transition"
                      style={{
                        background: active ? `${cor}1A` : "transparent",
                        color: active ? cor : "var(--vm-muted-b)",
                      }}
                    >
                      {v === "todos" ? "Todos" : v === "sem" ? "A atribuir" : "Atribuído"}
                      <span
                        className="rounded-full px-1.5 text-[9.5px] font-bold tabular-nums"
                        style={{
                          background: active ? `${cor}29` : "var(--vm-fill-2)",
                          color: active ? cor : "var(--vm-faint)",
                        }}
                      >
                        {contagemAtrib[v]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {temFiltros && (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroMunicipio("");
                    setFiltroTecnico("");
                    setFiltroTipo("todos");
                    setFiltroAtrib("todos");
                    setDateRange({ de: null, ate: null });
                  }}
                  className="ml-auto flex h-8 items-center gap-1 rounded-xl px-2.5 text-[11px] font-medium transition hover:bg-black/5"
                  style={{ color: C.faint }}
                >
                  <X className="h-3 w-3" /> Limpar filtros
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GRID DE MUNICÍPIOS */}
      {loading && grupos.length === 0 && (
        <div
          className="flex flex-col items-center rounded-[20px] py-20"
          style={{ background: C.surface, border: `1px solid ${C.lineSoft}` }}
        >
          <RefreshCcw className="mb-3 h-6 w-6 animate-spin" style={{ color: C.brand }} />
          <p className="text-[12px]" style={{ color: C.faint }}>
            Carregando fila operacional…
          </p>
        </div>
      )}
      {!loading && grupos.length === 0 && (
        <div
          className="flex flex-col items-center rounded-[20px] py-20"
          style={{ background: C.surface, border: `1px solid ${C.lineSoft}` }}
        >
          <Sparkles className="mb-3 h-8 w-8" style={{ color: C.brand }} strokeWidth={1.5} />
          <p className="text-[13px] font-semibold" style={{ color: C.ink }}>
            Fila operacional limpa
          </p>
          <p className="mt-0.5 text-[11.5px]" style={{ color: C.faint }}>
            {query || temFiltros
              ? "Nenhum resultado para os filtros aplicados."
              : "Nenhuma vistoria pendente na fila."}
          </p>
        </div>
      )}
      {grupos.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {grupos.map((grupo) => (
            <MunicipioCard
              key={grupo.municipio}
              grupo={grupo}
              selCount={selPorMunicipio.get(grupo.municipio) ?? 0}
              onOpen={() => setDetalheNome(grupo.municipio)}
              onAtribuirGrupo={() => handleAtribuirGrupo(grupo)}
            />
          ))}
        </div>
      )}

      {/* DRAWER DE DETALHE DO MUNICÍPIO */}
      <MunicipioDetailDrawer
        grupo={detalheGrupo}
        selecionados={selecionados}
        onClose={() => setDetalheNome(null)}
        onToggleAll={toggleMunicipio}
        onToggleItem={toggleItem}
        onAtribuirItem={(item) => setAtribuirItem(item)}
        onAtribuirGrupo={() => detalheGrupo && handleAtribuirGrupo(detalheGrupo)}
        onEditar={(item) => setEditarOpen(item)}
      />

      {/* BARRA FLUTUANTE DE SELEÇÃO */}
      <AnimatePresence>
        {selecionados.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 z-[250] -translate-x-1/2"
          >
            <div
              className="flex items-center gap-3 rounded-[18px] px-4 py-2.5"
              style={{ background: "#063B3B", boxShadow: "0 8px 32px rgba(6,59,59,0.32)" }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-bold"
                style={{ background: C.brand, color: "#fff" }}
              >
                {selecionados.size}
              </span>
              <span className="text-[12.5px] font-medium text-white/90">
                equipamento{selecionados.size !== 1 ? "s" : ""} selecionado
                {selecionados.size !== 1 ? "s" : ""}
              </span>
              <div className="mx-1 h-4 w-px" style={{ background: "rgba(255,255,255,0.15)" }} />
              <button
                type="button"
                onClick={() => setSelecionados(new Set())}
                className="text-[11px] font-medium text-white/60 transition hover:text-white/80"
              >
                Desmarcar
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                disabled={atribuindo}
                className="flex h-7 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-bold transition disabled:opacity-60"
                style={{ background: C.brand, color: "#fff" }}
              >
                {atribuindo ? (
                  <RefreshCcw className="h-3 w-3 animate-spin" />
                ) : (
                  <UserPlus className="h-3 w-3" strokeWidth={2.3} />
                )}
                Atribuir em lote
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAWER ATRIBUIÇÃO EM LOTE */}
      <AtribuirDrawer
        open={drawerOpen}
        count={selecionados.size}
        selecionados={selecionados}
        items={filtrados}
        tecnicos={tecnicos}
        atribuindo={atribuindo}
        onClose={() => setDrawerOpen(false)}
        onAtribuir={handleAtribuirLote}
      />

      {/* MODAL ATRIBUIÇÃO INDIVIDUAL */}
      <AnimatePresence>
        {atribuirItem && (
          <AtribuirModal
            item={atribuirItem}
            tecnicos={tecnicos}
            onClose={() => setAtribuirItem(null)}
            onAtribuir={(tec) => handleAtribuirItem(atribuirItem, tec)}
          />
        )}
      </AnimatePresence>

      {/* MODAL EDITAR */}
      <EditarVistoriaModal
        open={!!editarOpen}
        vistoriaId={editarOpen ? String(editarOpen.id) : null}
        equipamento={editarOpen?.equipamento}
        municipio={editarOpen?.municipio}
        initial={{ motivofield: editarOpen?.motivoReprovacao ?? "" }}
        onClose={() => setEditarOpen(null)}
        onSaved={(r) => {
          showToast(
            r.regeneradoPdf ? "Salvo · PDF marcado." : `Salvo · ${r.affected} campo(s).`
          );
          load();
        }}
      />

      {/* TOAST */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-8 left-1/2 z-[410] flex items-center gap-2 rounded-2xl px-4 py-2.5"
            style={{
              background: C.surface,
              border: "1px solid rgba(0,179,136,0.28)",
              boxShadow: "0 12px 32px rgba(0,179,136,0.16)",
            }}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: C.brand }} />
            <span className="text-[12.5px] font-medium" style={{ color: C.ink }}>
              {toast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
