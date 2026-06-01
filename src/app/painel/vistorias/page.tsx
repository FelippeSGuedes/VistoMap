"use client";

/**
 * /painel/vistorias — Central de Distribuição Operacional.
 *
 * Agrupamento por município, seleção em massa, atribuição em lote.
 * Performance para 5k-20k registros: chunks por município + lazy expand.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Filter,
  Pencil,
  RefreshCcw,
  RotateCw,
  Search,
  Sparkles,
  Square,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { painelService, type FilaItem } from "@/services/painel";
import { EditarVistoriaModal } from "@/components/painel/EditarVistoriaModal";
import type { TecnicoAtivo } from "@/types";

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
  "off-shift": "#9CA3AF",
  offline: "#4B5563",
};

// ─── Tipos locais ────────────────────────────────────────────────────────
interface GrupoMunicipio {
  municipio: string;
  items: FilaItem[];
  total: number;
  revisitas: number;
  semAtribuicao: number;
  percentAtribuido: number;
}

type FiltroTipo = "todos" | "nova" | "revisita";
type FiltroAtrib = "todos" | "sem";

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
      className={`flex items-center gap-2.5 px-4 py-2 transition-colors ${checked ? "bg-emerald-50/60" : "hover:bg-black/[0.015]"}`}
      style={{ borderBottom: "1px solid rgba(6,59,59,0.04)" }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 transition hover:text-[#00B388]"
        style={{ color: "#C0C8D2" }}
      >
        {checked ? (
          <CheckSquare className="h-3.5 w-3.5" style={{ color: "#00B388" }} />
        ) : (
          <Square className="h-3.5 w-3.5" />
        )}
      </button>
      <div className="w-1.5 shrink-0">
        {item.isRepeat && (
          <div className="h-4 w-1.5 rounded-full" style={{ background: "#F59E0B" }} />
        )}
      </div>
      <span className="w-20 shrink-0 font-mono text-[9.5px]" style={{ color: "#94A3B8" }}>
        {item.glpiId}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[12px] font-semibold" style={{ color: "#063B3B" }}>
            {item.equipamento}
          </p>
          {item.isRepeat && (
            <span
              className="shrink-0 rounded-full px-1.5 py-[1px] text-[7.5px] font-bold uppercase tracking-[0.1em]"
              style={{ background: "#FFFBEB", color: "#B45309" }}
            >
              Rev
            </span>
          )}
        </div>
        {item.endereco && (
          <p className="truncate text-[10px]" style={{ color: "#94A3B8" }}>
            {item.endereco}
          </p>
        )}
      </div>
      {item.dataVistoria && (
        <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "#94A3B8" }}>
          {relativo(item.dataVistoria)}
        </span>
      )}
      <div className="w-24 shrink-0">
        {item.tecnico ? (
          <div className="flex items-center gap-1">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[7.5px] font-bold text-white"
              style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}
            >
              {initials(item.tecnico.nome)}
            </span>
            <span className="truncate text-[10px] font-medium" style={{ color: "#475569" }}>
              {item.tecnico.nome.split(" ")[0]}
            </span>
          </div>
        ) : (
          <span className="text-[10px] italic" style={{ color: "#CBD5E1" }}>
            sem técnico
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onAtribuir}
          className="flex h-6 items-center gap-1 rounded-lg px-2 text-[9.5px] font-semibold transition hover:opacity-80"
          style={{ background: "#ECFDF5", color: "#00875F", border: "1px solid rgba(0,179,136,0.18)" }}
        >
          <UserPlus className="h-2.5 w-2.5" strokeWidth={2.3} />
          {item.tecnico ? "Re" : "Atrib"}
        </button>
        <button
          type="button"
          onClick={onEditar}
          className="flex h-6 w-6 items-center justify-center rounded-lg transition hover:bg-black/5"
          style={{ color: "#94A3B8" }}
        >
          <Pencil className="h-3 w-3" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

// ─── MunicipioCard ────────────────────────────────────────────────────────
const CHUNK = 25;

function MunicipioCard({
  grupo,
  selecionados,
  onToggleAll,
  onToggleItem,
  onAtribuirItem,
  onAtribuirGrupo,
  onEditar,
}: {
  grupo: GrupoMunicipio;
  selecionados: Set<number>;
  onToggleAll: (ids: number[]) => void;
  onToggleItem: (id: number) => void;
  onAtribuirItem: (item: FilaItem) => void;
  onAtribuirGrupo: () => void;
  onEditar: (item: FilaItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [visivel, setVisivel] = useState(CHUNK);

  const ids = grupo.items.map((i) => i.id);
  const checkedCount = ids.filter((id) => selecionados.has(id)).length;
  const allChecked = checkedCount === ids.length && ids.length > 0;
  const someChecked = checkedCount > 0 && !allChecked;

  const barColor =
    grupo.percentAtribuido === 100
      ? "#00B388"
      : grupo.percentAtribuido > 70
      ? "#00B388"
      : grupo.percentAtribuido > 40
      ? "#F59E0B"
      : "#EF4444";

  return (
    <div
      className="overflow-hidden rounded-[16px]"
      style={{
        background: "#fff",
        border:
          grupo.revisitas > 0
            ? "1px solid rgba(245,158,11,0.28)"
            : "1px solid rgba(6,59,59,0.06)",
        boxShadow: "0 1px 4px rgba(6,59,59,0.04)",
      }}
    >
      {/* Header do município */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Checkbox de grupo */}
        <button
          type="button"
          onClick={() => onToggleAll(ids)}
          className="shrink-0 transition hover:opacity-70"
          style={{ color: allChecked || someChecked ? "#00B388" : "#CBD5E1" }}
        >
          {allChecked ? (
            <CheckSquare className="h-4 w-4" />
          ) : someChecked ? (
            <div className="relative">
              <Square className="h-4 w-4" />
              <div
                className="absolute inset-[3px] rounded-[1px]"
                style={{ background: "#00B388", opacity: 0.45 }}
              />
            </div>
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>

        {/* Ícone de município */}
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{
            background: grupo.revisitas > 0 ? "#FFFBEB" : "#F1F5F9",
            color: grupo.revisitas > 0 ? "#B45309" : "#475569",
          }}
        >
          <Building2 className="h-3.5 w-3.5" strokeWidth={2} />
        </div>

        {/* Nome + stats */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className="text-[14px] font-semibold tracking-[-0.2px]"
              style={{ color: "#063B3B" }}
            >
              {grupo.municipio}
            </h3>
            {grupo.revisitas > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-[0.12em]"
                style={{
                  background: "#FFFBEB",
                  color: "#B45309",
                  border: "1px solid rgba(245,158,11,0.3)",
                }}
              >
                <RotateCw className="h-2 w-2" strokeWidth={2.5} />
                {grupo.revisitas} rev
              </span>
            )}
            {grupo.semAtribuicao > 0 && (
              <span
                className="rounded-full px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-[0.12em]"
                style={{ background: "#FEF2F2", color: "#B91C1C" }}
              >
                {grupo.semAtribuicao} sem atrib
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div className="mt-1 flex items-center gap-2">
            <div
              className="h-1 flex-1 overflow-hidden rounded-full"
              style={{ background: "rgba(6,59,59,0.07)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${grupo.percentAtribuido}%`, background: barColor }}
              />
            </div>
            <span
              className="text-[9px] font-medium tabular-nums"
              style={{ color: "#94A3B8" }}
            >
              {grupo.total - grupo.semAtribuicao}/{grupo.total}
            </span>
          </div>
        </div>

        {/* Ações rápidas */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onAtribuirGrupo}
            className="flex h-7 items-center gap-1 rounded-xl px-2.5 text-[10px] font-semibold transition hover:opacity-85"
            style={{
              background: "#ECFDF5",
              color: "#00875F",
              border: "1px solid rgba(0,179,136,0.22)",
            }}
          >
            <UserPlus className="h-3 w-3" strokeWidth={2.3} />
            Atribuir todos
          </button>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex h-7 w-7 items-center justify-center rounded-xl transition hover:bg-black/5"
            style={{ color: "#64748B" }}
          >
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform duration-200"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
        </div>
      </div>

      {/* Conteúdo expandido */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t" style={{ borderColor: "rgba(6,59,59,0.05)" }}>
              {/* Cabeçalho da tabela */}
              <div
                className="flex items-center gap-2.5 border-b px-4 py-1.5"
                style={{ borderColor: "rgba(6,59,59,0.04)", background: "#FAFBFC" }}
              >
                <div className="w-3.5 shrink-0" />
                <div className="w-1.5 shrink-0" />
                <span
                  className="w-20 shrink-0 text-[8.5px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: "#A0ACBA" }}
                >
                  GIOC ID
                </span>
                <span
                  className="flex-1 text-[8.5px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: "#A0ACBA" }}
                >
                  Equipamento
                </span>
                <span
                  className="w-12 shrink-0 text-[8.5px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: "#A0ACBA" }}
                >
                  Data
                </span>
                <span
                  className="w-24 shrink-0 text-[8.5px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: "#A0ACBA" }}
                >
                  Técnico
                </span>
                <span
                  className="w-20 shrink-0 text-right text-[8.5px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: "#A0ACBA" }}
                >
                  Ações
                </span>
              </div>

              {grupo.items.slice(0, visivel).map((item) => (
                <EquipamentoRow
                  key={item.id}
                  item={item}
                  checked={selecionados.has(item.id)}
                  onToggle={() => onToggleItem(item.id)}
                  onAtribuir={() => onAtribuirItem(item)}
                  onEditar={() => onEditar(item)}
                />
              ))}

              {visivel < grupo.items.length && (
                <button
                  type="button"
                  onClick={() => setVisivel((c) => c + CHUNK)}
                  className="flex w-full items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition hover:bg-black/[0.02]"
                  style={{ color: "#7A8896", borderTop: "1px solid rgba(6,59,59,0.04)" }}
                >
                  Mostrar mais {Math.min(CHUNK, grupo.items.length - visivel)} ({grupo.items.length - visivel} restantes)
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
    // Mostra todos — admin pode atribuir mesmo a offline (ex: tecnico chegando agora)
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
            style={{ background: "rgba(6,59,59,0.08)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed bottom-0 right-0 top-0 z-[301] flex w-[380px] flex-col overflow-hidden"
            style={{
              background: "#fff",
              boxShadow: "-4px 0 40px rgba(6,59,59,0.14)",
              borderLeft: "1px solid rgba(6,59,59,0.06)",
            }}
          >
            <div
              className="flex items-start justify-between border-b px-5 pb-4 pt-6"
              style={{ borderColor: "rgba(6,59,59,0.06)" }}
            >
              <div>
                <p
                  className="text-[9px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: "#00B388" }}
                >
                  Atribuição em lote
                </p>
                <h2
                  className="mt-0.5 text-[18px] font-semibold tracking-[-0.3px]"
                  style={{ color: "#063B3B" }}
                >
                  {count} equipamento{count !== 1 ? "s" : ""}
                </h2>
                {municipiosSel.size > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Array.from(municipiosSel.entries()).map(([m, c]) => (
                      <span
                        key={m}
                        className="rounded-full px-2 py-[2px] text-[9.5px] font-semibold"
                        style={{ background: "#F1F5F9", color: "#475569" }}
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
                style={{ color: "#7A8896" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {sugestoes.length === 0 && (
                <p className="py-8 text-center text-[12px]" style={{ color: "#94A3B8" }}>
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
                        background: STATUS_COR[tec.status] ?? "#9CA3AF",
                        boxShadow: "0 0 0 2px #fff",
                      }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p
                        className="truncate text-[13px] font-semibold"
                        style={{ color: "#063B3B" }}
                      >
                        {tec.nome}
                      </p>
                      {temMunicipio && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-[1px] text-[7.5px] font-bold uppercase tracking-[0.1em]"
                          style={{ background: "#ECFDF5", color: "#00875F" }}
                        >
                          ativo na região
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px]" style={{ color: "#7A8896" }}>
                      {tec.municipio ?? "—"} · {tec.atribuidas} atribuídas · {tec.concluidasHoje} hoje
                    </p>
                    {temMunicipio && tec.municipio && (
                      <p className="text-[9.5px]" style={{ color: "#00875F" }}>
                        {tec.nome.split(" ")[0]} já possui operação ativa em {tec.municipio}.
                      </p>
                    )}
                  </div>
                  {atribuindo ? (
                    <RefreshCcw
                      className="h-3.5 w-3.5 shrink-0 animate-spin"
                      style={{ color: "#A0ACBA" }}
                    />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: "#A0ACBA" }} />
                  )}
                </button>
              ))}
            </div>

            <div className="border-t p-4" style={{ borderColor: "rgba(6,59,59,0.06)" }}>
              <p className="text-[10px]" style={{ color: "#94A3B8" }}>
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
  const ativos = tecnicos; // mostra todos, incluindo offline (admin decide)
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: "rgba(247,249,251,0.72)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] overflow-hidden rounded-[24px]"
        style={{
          background: "#fff",
          border: "1px solid rgba(6,59,59,0.08)",
          boxShadow: "0 24px 60px rgba(6,59,59,0.2)",
        }}
      >
        <header
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "rgba(6,59,59,0.05)" }}
        >
          <div>
            <p
              className="text-[9px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "#00B388" }}
            >
              Atribuir técnico
            </p>
            <h3
              className="mt-0.5 text-[16px] font-semibold tracking-[-0.3px]"
              style={{ color: "#063B3B" }}
            >
              {item.equipamento}
            </h3>
            <p className="text-[11px]" style={{ color: "#7A8896" }}>
              {item.municipio} · {item.glpiId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black/5"
            style={{ color: "#7A8896" }}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-1 p-3">
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
                      background: STATUS_COR[t.status] ?? "#9CA3AF",
                      boxShadow: "0 0 0 2px #fff",
                    }}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p
                      className="truncate text-[12.5px] font-semibold"
                      style={{ color: "#063B3B" }}
                    >
                      {t.nome}
                    </p>
                    {noMunicipio && t.municipio && (
                      <span
                        className="rounded-full px-1.5 py-[1px] text-[8px] font-bold"
                        style={{ background: "#ECFDF5", color: "#00875F" }}
                      >
                        na região
                      </span>
                    )}
                  </div>
                  <p className="text-[10px]" style={{ color: "#7A8896" }}>
                    {t.municipio ?? "—"} · {t.atribuidas} atrib · {t.concluidasHoje} hoje
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: "#A0ACBA" }} />
              </button>
            );
          })}
          {ativos.length === 0 && (
            <p className="py-4 text-center text-[12px]" style={{ color: "#94A3B8" }}>
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
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

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
        painelService.fetchFila({ status: "A_VISTORIAR", limit: 2000 }),
        painelService.fetchFila({ status: "AGUARDANDO_REVISITA", limit: 2000 }),
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
      if (!q) return true;
      return (
        i.equipamento.toLowerCase().includes(q) ||
        i.municipio.toLowerCase().includes(q) ||
        i.glpiId.toLowerCase().includes(q) ||
        (i.endereco ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, filtroMunicipio, filtroTecnico, filtroTipo, filtroAtrib]);

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
        const percentAtribuido =
          total > 0 ? Math.round(((total - semAtribuicao) / total) * 100) : 100;
        return { municipio, items: its, total, revisitas, semAtribuicao, percentAtribuido };
      })
      .sort((a, b) => {
        const sa = a.revisitas * 3 + a.semAtribuicao;
        const sb = b.revisitas * 3 + b.semAtribuicao;
        return sb !== sa ? sb - sa : b.total - a.total;
      });
  }, [filtrados]);

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
    filtroAtrib !== "todos"
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

  // Atribuir grupo inteiro (seleciona todos + abre drawer)
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
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.18em]"
                style={{
                  background: "#ECFDF5",
                  color: "#00875F",
                  border: "1px solid rgba(0,179,136,0.22)",
                }}
              >
                <Zap className="h-2.5 w-2.5" /> Central de distribuição
              </span>
              {loading && (
                <RefreshCcw className="h-3 w-3 animate-spin" style={{ color: "#A0ACBA" }} />
              )}
            </div>
            <h1
              className="text-[28px] font-semibold tracking-[-0.5px]"
              style={{ color: "#063B3B" }}
            >
              Fila de Vistorias
            </h1>
            <p className="mt-0.5 text-[12.5px]" style={{ color: "#566773" }}>
              Distribuição regional · {kpis.municipios} municípios ativos · atualiza a cada 30s
            </p>
          </div>

          {/* KPI strip */}
          <div className="flex shrink-0 items-center gap-5">
            <div className="flex flex-col items-end">
              <span
                className="text-[22px] font-semibold tabular-nums tracking-tight"
                style={{ color: "#063B3B" }}
              >
                {kpis.total}
              </span>
              <span
                className="text-[9px] font-bold uppercase tracking-[0.14em]"
                style={{ color: "#7A8896" }}
              >
                total
              </span>
            </div>
            <div className="h-10 w-px" style={{ background: "rgba(6,59,59,0.08)" }} />
            <div className="flex flex-col items-end">
              <span
                className="text-[22px] font-semibold tabular-nums tracking-tight"
                style={{ color: "#B45309" }}
              >
                {kpis.revisitas}
              </span>
              <span
                className="text-[9px] font-bold uppercase tracking-[0.14em]"
                style={{ color: "#B45309" }}
              >
                revisitas
              </span>
            </div>
            <div className="h-10 w-px" style={{ background: "rgba(6,59,59,0.08)" }} />
            <div className="flex flex-col items-end">
              <span
                className="text-[22px] font-semibold tabular-nums tracking-tight"
                style={{ color: "#B91C1C" }}
              >
                {kpis.semAtrib}
              </span>
              <span
                className="text-[9px] font-bold uppercase tracking-[0.14em]"
                style={{ color: "#94A3B8" }}
              >
                sem atrib
              </span>
            </div>
            <div className="h-10 w-px" style={{ background: "rgba(6,59,59,0.08)" }} />
            <div className="flex flex-col items-end">
              <span
                className="text-[22px] font-semibold tabular-nums tracking-tight"
                style={{ color: "#4338CA" }}
              >
                {kpis.municipios}
              </span>
              <span
                className="text-[9px] font-bold uppercase tracking-[0.14em]"
                style={{ color: "#7A8896" }}
              >
                municípios
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* BUSCA + FILTROS */}
      <div className="flex items-center gap-2">
        <div
          className="flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.06)",
            boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
          }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: "#A0ACBA" }} strokeWidth={2.2} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar equipamento, município, endereço, GIOC ID…"
            className="flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-[#C0C8D2]"
            style={{ color: "#063B3B" }}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} style={{ color: "#A0ACBA" }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className="flex h-10 items-center gap-1.5 rounded-2xl px-3 text-[12px] font-semibold transition"
          style={{
            background: temFiltros ? "rgba(0,179,136,0.08)" : "#fff",
            border: temFiltros
              ? "1px solid rgba(0,179,136,0.25)"
              : "1px solid rgba(6,59,59,0.06)",
            color: temFiltros ? "#00875F" : "#566773",
            boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
          }}
        >
          <Filter className="h-3.5 w-3.5" strokeWidth={2.2} />
          Filtros
          {temFiltros && (
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white"
              style={{ background: "#00B388" }}
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
                background: "#fff",
                border: "1px solid rgba(6,59,59,0.06)",
                boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
              }}
            >
              <select
                value={filtroMunicipio}
                onChange={(e) => setFiltroMunicipio(e.target.value)}
                className="h-8 rounded-xl px-2.5 text-[12px] font-medium outline-none"
                style={{
                  background: filtroMunicipio ? "rgba(0,179,136,0.08)" : "#F8FAFC",
                  border: filtroMunicipio
                    ? "1px solid rgba(0,179,136,0.25)"
                    : "1px solid rgba(6,59,59,0.08)",
                  color: filtroMunicipio ? "#00875F" : "#566773",
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
                  background: filtroTecnico ? "rgba(0,179,136,0.08)" : "#F8FAFC",
                  border: filtroTecnico
                    ? "1px solid rgba(0,179,136,0.25)"
                    : "1px solid rgba(6,59,59,0.08)",
                  color: filtroTecnico ? "#00875F" : "#566773",
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
                style={{ border: "1px solid rgba(6,59,59,0.08)" }}
              >
                {(["todos", "nova", "revisita"] as FiltroTipo[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFiltroTipo(v)}
                    className="h-8 px-3 text-[11px] font-semibold transition"
                    style={{
                      background:
                        filtroTipo === v
                          ? v === "revisita"
                            ? "#FFFBEB"
                            : "rgba(0,179,136,0.1)"
                          : "transparent",
                      color:
                        filtroTipo === v
                          ? v === "revisita"
                            ? "#B45309"
                            : "#00875F"
                          : "#566773",
                    }}
                  >
                    {v === "todos" ? "Todos" : v === "nova" ? "Novas" : "Revisitas"}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setFiltroAtrib(filtroAtrib === "sem" ? "todos" : "sem")}
                className="flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold transition"
                style={{
                  background: filtroAtrib === "sem" ? "#FEF2F2" : "#F8FAFC",
                  border:
                    filtroAtrib === "sem"
                      ? "1px solid rgba(239,68,68,0.25)"
                      : "1px solid rgba(6,59,59,0.08)",
                  color: filtroAtrib === "sem" ? "#B91C1C" : "#566773",
                }}
              >
                Sem atribuição
              </button>

              {temFiltros && (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroMunicipio("");
                    setFiltroTecnico("");
                    setFiltroTipo("todos");
                    setFiltroAtrib("todos");
                  }}
                  className="ml-auto flex h-8 items-center gap-1 rounded-xl px-2.5 text-[11px] font-medium transition hover:bg-black/5"
                  style={{ color: "#94A3B8" }}
                >
                  <X className="h-3 w-3" /> Limpar filtros
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GRUPOS DE MUNICÍPIOS */}
      <div className="space-y-3">
        {loading && grupos.length === 0 && (
          <div
            className="flex flex-col items-center py-20 rounded-[20px]"
            style={{ background: "#fff", border: "1px solid rgba(6,59,59,0.05)" }}
          >
            <RefreshCcw
              className="mb-3 h-6 w-6 animate-spin"
              style={{ color: "#00B388" }}
            />
            <p className="text-[12px]" style={{ color: "#94A3B8" }}>
              Carregando fila operacional…
            </p>
          </div>
        )}
        {!loading && grupos.length === 0 && (
          <div
            className="flex flex-col items-center py-20 rounded-[20px]"
            style={{ background: "#fff", border: "1px solid rgba(6,59,59,0.05)" }}
          >
            <Sparkles
              className="mb-3 h-8 w-8"
              style={{ color: "#00B388" }}
              strokeWidth={1.5}
            />
            <p className="text-[13px] font-semibold" style={{ color: "#063B3B" }}>
              Fila operacional limpa
            </p>
            <p className="mt-0.5 text-[11.5px]" style={{ color: "#94A3B8" }}>
              {query || temFiltros
                ? "Nenhum resultado para os filtros aplicados."
                : "Nenhuma vistoria pendente na fila."}
            </p>
          </div>
        )}
        {grupos.map((grupo) => (
          <MunicipioCard
            key={grupo.municipio}
            grupo={grupo}
            selecionados={selecionados}
            onToggleAll={toggleMunicipio}
            onToggleItem={toggleItem}
            onAtribuirItem={(item) => setAtribuirItem(item)}
            onAtribuirGrupo={() => handleAtribuirGrupo(grupo)}
            onEditar={(item) => setEditarOpen(item)}
          />
        ))}
      </div>

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
              style={{
                background: "#063B3B",
                boxShadow: "0 8px 32px rgba(6,59,59,0.32)",
              }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-bold"
                style={{ background: "#00B388", color: "#fff" }}
              >
                {selecionados.size}
              </span>
              <span className="text-[12.5px] font-medium text-white/90">
                equipamento{selecionados.size !== 1 ? "s" : ""} selecionado
                {selecionados.size !== 1 ? "s" : ""}
              </span>
              <div
                className="mx-1 h-4 w-px"
                style={{ background: "rgba(255,255,255,0.15)" }}
              />
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
                style={{ background: "#00B388", color: "#fff" }}
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
            className="fixed bottom-8 left-1/2 z-[210] flex items-center gap-2 rounded-2xl px-4 py-2.5"
            style={{
              background: "#fff",
              border: "1px solid rgba(0,179,136,0.28)",
              boxShadow: "0 12px 32px rgba(0,179,136,0.16)",
            }}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#00B388" }} />
            <span className="text-[12.5px] font-medium" style={{ color: "#063B3B" }}>
              {toast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
