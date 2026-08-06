"use client";

/**
 * /painel/instalacoes/instaladas — postes com instalação concluída
 * (states_id = INSTALADO). Lista histórica que só cresce — diferente de
 * Pendentes/Andamento (estado atual, sempre pequeno), aqui o total real
 * importa: a API sempre roda a mesma WHERE como COUNT(*) sem LIMIT
 * (listInstalacoesPainel + countInstalacoesPainel em
 * src/lib/glpi/instalacoes.ts), então o header nunca mostra um total
 * fictício por causa do cap da lista — mesma classe de bug já corrigida em
 * /painel/realizadas (Vistoria).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, MapPin, RefreshCw, Search, User, XCircle } from "lucide-react";
import { fetchInstalacoesLista } from "@/services/painel-instalacoes";
import { DateRangeFilter, type DateRange } from "@/components/painel/DateRangeFilter";
import type { InstalacaoPainelItem } from "@/types/painel-instalacoes";

const FETCH_LIMIT = 500;
const SEARCH_DEBOUNCE_MS = 400;
const ROXO = "#7C3AED";

const CHECKLIST_LABELS: Array<{ key: keyof InstalacaoPainelItem["checklist"]; label: string }> = [
  { key: "cintaInstalada", label: "Cinta" },
  { key: "equipamentoFixado", label: "Fixação" },
  { key: "cabeamentoOrganizado", label: "Cabeamento" },
  { key: "alimentacaoValidada", label: "Alimentação" },
  { key: "equipamentoEnergizado", label: "Energizado" },
  { key: "registroFotografico", label: "Registro foto" },
];

function formatData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-[140px] animate-pulse rounded-xl" style={{ background: "var(--vm-fill-2)" }} />
      ))}
    </div>
  );
}

export default function InstalacoesInstaladasPage() {
  const [items, setItems] = useState<InstalacaoPainelItem[]>([]);
  const [optionsBase, setOptionsBase] = useState<InstalacaoPainelItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterMunicipio, setFilterMunicipio] = useState("all");
  const [filterInstalador, setFilterInstalador] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>({ de: null, ate: null });
  const firstLoad = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items: data, total: totalReal } = await fetchInstalacoesLista({
        status: "instalado",
        limit: FETCH_LIMIT,
        municipio: filterMunicipio !== "all" ? filterMunicipio : undefined,
        instaladorId: filterInstalador !== "all" ? Number(filterInstalador) : undefined,
        query: debouncedSearch || undefined,
        desde: dateRange.de ?? undefined,
        ate: dateRange.ate ?? undefined,
      });
      setItems(data);
      setTotal(totalReal);
      if (firstLoad.current) {
        setOptionsBase(data);
        firstLoad.current = false;
      }
    } finally {
      setLoading(false);
    }
  }, [filterMunicipio, filterInstalador, debouncedSearch, dateRange]);

  useEffect(() => {
    void load();
  }, [load]);

  const municipios = Array.from(new Set(optionsBase.map((i) => i.municipio).filter(Boolean))).sort();
  const instaladores = Array.from(
    new Map(optionsBase.filter((i) => i.instalador).map((i) => [i.instalador!.id, i.instalador!.nome])).entries()
  );

  const filtrosAtivos =
    filterMunicipio !== "all" || filterInstalador !== "all" || !!debouncedSearch || !!dateRange.de || !!dateRange.ate;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--vm-text)" }}>
            Instalações Concluídas
          </h1>
          <p className="mt-0.5 text-xs" style={{ color: "var(--vm-text-muted)" }}>
            <span className="font-semibold tabular-nums" style={{ color: ROXO }}>
              {total}
            </span>{" "}
            {total === 1 ? "poste instalado" : "postes instalados"}
            {filtrosAtivos ? " (com filtros aplicados)" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          title="Atualizar agora"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm">
          <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar equipamento, endereço, PS-poste…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-gray-400"
          />
        </label>

        <div className="relative">
          <select
            value={filterMunicipio}
            onChange={(e) => setFilterMunicipio(e.target.value)}
            className="h-9 appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-[12.5px] font-medium text-gray-700 outline-none"
          >
            <option value="all">Todos os municípios</option>
            {municipios.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="relative">
          <select
            value={filterInstalador}
            onChange={(e) => setFilterInstalador(e.target.value)}
            className="h-9 appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-[12.5px] font-medium text-gray-700 outline-none"
          >
            <option value="all">Todos os instaladores</option>
            {instaladores.map(([id, nome]) => (
              <option key={id} value={String(id)}>
                {nome}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>

        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Lista */}
      {loading && items.length === 0 ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-16">
          <CheckCircle2 className="h-10 w-10 text-gray-200" />
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-400">Nenhuma instalação concluída no período</p>
            <p className="mt-0.5 text-[11px] text-gray-300">
              {filtrosAtivos ? "Ajuste os filtros para ver mais resultados" : "As instalações concluídas aparecerão aqui"}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {items.map((item) => (
            <PosteCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {items.length >= FETCH_LIMIT && total > FETCH_LIMIT && (
        <p className="text-center text-[11.5px]" style={{ color: "var(--vm-faint)" }}>
          Mostrando os {FETCH_LIMIT} mais recentes de {total} — use os filtros pra refinar.
        </p>
      )}
    </div>
  );
}

function ChecklistBadge({ label, value }: { label: string; value: boolean | null }) {
  const color = value === true ? "#00875F" : value === false ? "#DC2626" : "var(--vm-faint)";
  const bg = value === true ? "rgba(0,179,136,0.10)" : value === false ? "rgba(220,38,38,0.10)" : "var(--vm-tile)";
  const Icon = value === true ? CheckCircle2 : XCircle;
  return (
    <span
      className="flex items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-semibold"
      style={{ background: bg, color }}
    >
      {value != null && <Icon className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

function PosteCard({ item }: { item: InstalacaoPainelItem }) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl bg-white transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      <div style={{ height: 3, background: "#00B388", flexShrink: 0 }} />
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[13.5px] font-bold" style={{ color: "var(--vm-text)" }} title={item.equipamento}>
              {item.equipamento}
            </h3>
            {item.tipoEquipamento && (
              <p className="truncate text-[10.5px] font-medium" style={{ color: "var(--vm-faint)" }}>
                {item.tipoEquipamento}
              </p>
            )}
          </div>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: "var(--vm-faint)" }}>
            {formatData(item.dataInstalacao)}
          </span>
        </div>

        <div className="flex flex-col gap-1 text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
          {item.municipio && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 shrink-0" />
              {item.municipio}
            </span>
          )}
          {item.instalador ? (
            <span className="flex items-center gap-1.5">
              <User className="h-3 w-3 shrink-0" />
              {item.instalador.nome}
            </span>
          ) : (
            <span className="flex items-center gap-1.5" style={{ color: "var(--vm-faint)" }}>
              <User className="h-3 w-3 shrink-0" />
              Instalador não identificado
            </span>
          )}
          {item.validadorCpfl && (
            <span className="flex items-center gap-1.5">
              Validação CPFL: <strong>{item.validadorCpfl.status ?? "—"}</strong> ({item.validadorCpfl.nome})
            </span>
          )}
        </div>

        <div
          className="mt-3 flex flex-wrap gap-1.5 border-t pt-2.5"
          style={{ borderColor: "var(--vm-border-soft)" }}
        >
          {CHECKLIST_LABELS.map(({ key, label }) => (
            <ChecklistBadge key={key} label={label} value={item.checklist[key]} />
          ))}
        </div>
      </div>
    </div>
  );
}
