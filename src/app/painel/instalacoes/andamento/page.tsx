"use client";

/**
 * /painel/instalacoes/andamento — postes travados por um instalador em campo
 * agora (states_id = EM_INSTALACAO). Monitoramento somente-leitura, mesmo
 * padrão de /painel/andamento (Vistoria).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ChevronDown, MapPin, RefreshCw, Search, User, Wifi, WifiOff } from "lucide-react";
import { fetchInstalacoesLista } from "@/services/painel-instalacoes";
import type { InstalacaoPainelItem } from "@/types/painel-instalacoes";

const POLL_INTERVAL_MS = 30_000;
const ROXO = "#7C3AED";

function formatHorario(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function initials(nome: string): string {
  const p = nome.trim().split(/[\s._-]+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase();
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-[100px] animate-pulse rounded-xl" style={{ background: "var(--vm-fill-2)" }} />
      ))}
    </div>
  );
}

export default function InstalacoesAndamentoPage() {
  const [items, setItems] = useState<InstalacaoPainelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMunicipio, setFilterMunicipio] = useState("all");
  const [filterInstalador, setFilterInstalador] = useState("all");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const { items: data } = await fetchInstalacoesLista({ status: "em-instalacao", limit: 500 });
      setItems(data);
      setLastUpdate(new Date());
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  const municipios = Array.from(new Set(items.map((i) => i.municipio).filter(Boolean))).sort();
  const instaladores = Array.from(
    new Map(items.filter((i) => i.instalador).map((i) => [i.instalador!.id, i.instalador!.nome])).entries()
  );

  const filtered = items.filter((item) => {
    if (filterMunicipio !== "all" && item.municipio !== filterMunicipio) return false;
    if (filterInstalador !== "all" && String(item.instalador?.id) !== filterInstalador) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.equipamento.toLowerCase().includes(q) ||
        item.endereco.toLowerCase().includes(q) ||
        item.municipio.toLowerCase().includes(q) ||
        (item.instalador?.nome ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--vm-text)" }}>
            Instalações em Andamento
          </h1>
          <p className="mt-0.5 text-xs" style={{ color: "var(--vm-text-muted)" }}>
            Postes travados por um instalador em campo agora — atualiza a cada 30 segundos
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {lastUpdate && (
            <span className="text-[11px] text-gray-400">Atualizado às {formatHorario(lastUpdate)}</span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
            title="Atualizar agora"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-wider"
            style={
              online
                ? { background: "rgba(124,58,237,0.10)", color: ROXO, border: "1px solid rgba(124,58,237,0.22)" }
                : { background: "rgba(239,68,68,0.10)", color: "#DC2626", border: "1px solid rgba(239,68,68,0.22)" }
            }
          >
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Ao vivo" : "Offline"}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm">
          <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar equipamento, endereço, instalador…"
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

        {filtered.length !== items.length && (
          <span className="ml-1 text-[12px] text-gray-400">
            {filtered.length} de {items.length}
          </span>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <Skeleton />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-16">
          <Activity className="h-10 w-10 text-gray-200" />
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-400">
              {items.length === 0 ? "Nenhuma instalação em andamento" : "Nenhum resultado para os filtros selecionados"}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-300">
              {items.length === 0
                ? "Quando um instalador assumir um poste, ele aparece aqui"
                : "Ajuste os filtros para ver mais resultados"}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {filtered.map((item) => (
            <PosteCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function PosteCard({ item }: { item: InstalacaoPainelItem }) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl bg-white transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      <div style={{ height: 3, background: ROXO, flexShrink: 0 }} />
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(124,58,237,0.10)" }}
          >
            <Activity className="h-[18px] w-[18px]" style={{ color: ROXO }} />
          </span>
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
        </div>

        <div className="flex flex-col gap-1 text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
          {item.municipio && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 shrink-0" />
              {item.municipio}
            </span>
          )}
          {item.endereco && (
            <span className="truncate" title={item.endereco}>
              {item.endereco}
            </span>
          )}
        </div>

        <div
          className="mt-3 flex items-center gap-2.5 border-t pt-2.5"
          style={{ borderColor: "var(--vm-border-soft)" }}
        >
          {item.instalador ? (
            <>
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                style={{ background: "linear-gradient(145deg, #A78BFA, #7C3AED)" }}
              >
                {initials(item.instalador.nome)}
              </span>
              <span className="truncate text-[12px] font-semibold" style={{ color: "var(--vm-text)" }}>
                {item.instalador.nome}
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--vm-faint)" }}>
              <User className="h-3 w-3" /> Instalador não identificado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
