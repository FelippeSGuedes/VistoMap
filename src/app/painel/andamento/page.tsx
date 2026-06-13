"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Activity,
  ChevronDown,
  Clock,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  User,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { VistoriaAndamento } from "@/app/api/painel/andamento/route";

const POLL_INTERVAL_MS = 30_000;

function formatTempo(min: number | null): string {
  if (min === null) return "—";
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatHorario(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

const STATUS_CONFIG: Record<
  VistoriaAndamento["situacao"],
  { label: string; color: string; bg: string; dot: string }
> = {
  "Em Deslocamento": {
    label: "Em Deslocamento",
    color: "#D97706",
    bg: "rgba(245,158,11,0.12)",
    dot: "#F59E0B",
  },
  "Em Vistoria": {
    label: "Em Vistoria",
    color: "#2563EB",
    bg: "rgba(59,130,246,0.12)",
    dot: "#3B82F6",
  },
  "Em Revisita": {
    label: "Em Revisita",
    color: "#0891B2",
    bg: "rgba(14,165,233,0.12)",
    dot: "#0EA5E9",
  },
};

function StatusChip({ situacao }: { situacao: VistoriaAndamento["situacao"] }) {
  const cfg = STATUS_CONFIG[situacao];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full animate-pulse"
        style={{ background: cfg.dot }}
      />
      {cfg.label}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="h-[88px] animate-pulse rounded-xl"
          style={{ background: "rgba(0,0,0,0.05)" }}
        />
      ))}
    </div>
  );
}

export default function AndamentoPage() {
  const [items, setItems] = useState<VistoriaAndamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTecnico, setFilterTecnico] = useState<string>("all");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/painel/api/painel/andamento", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data: VistoriaAndamento[] = await res.json();
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

  // Técnicos únicos para o filtro
  const tecnicos = Array.from(
    new Map(
      items
        .filter((i) => i.tecnico_id && i.tecnico_nome)
        .map((i) => [i.tecnico_id, i.tecnico_nome!])
    ).entries()
  );

  const filtered = items.filter((item) => {
    if (filterStatus !== "all" && item.situacao !== filterStatus) return false;
    if (filterTecnico !== "all" && String(item.tecnico_id) !== filterTecnico) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.equipamento.toLowerCase().includes(q) ||
        (item.municipio ?? "").toLowerCase().includes(q) ||
        (item.tecnico_nome ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const countByStatus = {
    "Em Deslocamento": items.filter((i) => i.situacao === "Em Deslocamento").length,
    "Em Vistoria": items.filter((i) => i.situacao === "Em Vistoria").length,
    "Em Revisita": items.filter((i) => i.situacao === "Em Revisita").length,
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Vistorias em Andamento
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            Técnicos em campo agora — atualiza a cada 30 segundos
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {lastUpdate && (
            <span className="text-[11px] text-gray-400">
              Atualizado às {formatHorario(lastUpdate.toISOString())}
            </span>
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
                ? { background: "rgba(0,179,136,0.10)", color: "#059669", border: "1px solid rgba(0,179,136,0.22)" }
                : { background: "rgba(239,68,68,0.10)", color: "#DC2626", border: "1px solid rgba(239,68,68,0.22)" }
            }
          >
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Ao vivo" : "Offline"}
          </div>
        </div>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            { key: "Em Deslocamento", icon: Navigation, color: "#D97706", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.20)" },
            { key: "Em Vistoria",     icon: Activity,   color: "#2563EB", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.20)" },
            { key: "Em Revisita",     icon: RefreshCw,  color: "#0891B2", bg: "rgba(14,165,233,0.08)", border: "rgba(14,165,233,0.20)" },
          ] as const
        ).map(({ key, icon: Icon, color, bg, border }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterStatus(filterStatus === key ? "all" : key)}
            className="flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition hover:opacity-80"
            style={{
              background: filterStatus === key ? bg : "#fff",
              borderColor: filterStatus === key ? border : "#E5E7EB",
            }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: bg }}
            >
              <Icon className="h-[18px] w-[18px]" style={{ color }} />
            </span>
            <div>
              <div className="text-2xl font-bold" style={{ color }}>
                {countByStatus[key as keyof typeof countByStatus]}
              </div>
              <div className="text-[10px] font-semibold text-gray-500">{key}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 flex-1 min-w-[200px] items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm">
          <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar equipamento, município, técnico…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-gray-400"
          />
        </label>

        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-[12.5px] font-medium text-gray-700 outline-none"
          >
            <option value="all">Todos os status</option>
            <option value="Em Deslocamento">Em Deslocamento</option>
            <option value="Em Vistoria">Em Vistoria</option>
            <option value="Em Revisita">Em Revisita</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="relative">
          <select
            value={filterTecnico}
            onChange={(e) => setFilterTecnico(e.target.value)}
            className="h-9 appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-[12.5px] font-medium text-gray-700 outline-none"
          >
            <option value="all">Todos os técnicos</option>
            {tecnicos.map(([id, nome]) => (
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
              {items.length === 0
                ? "Nenhuma vistoria em andamento"
                : "Nenhum resultado para os filtros selecionados"}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-300">
              {items.length === 0
                ? "Quando um técnico iniciar uma vistoria, ela aparecerá aqui"
                : "Ajuste os filtros para ver mais resultados"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => (
            <VistoriaCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function VistoriaCard({ item }: { item: VistoriaAndamento }) {
  const cfg = STATUS_CONFIG[item.situacao];
  const inicioTs = item.iniciado_em ?? item.deslocamento_em;

  return (
    <div
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border bg-white px-5 py-4 transition-shadow hover:shadow-md"
      style={{ borderColor: "#E5E7EB", borderLeftWidth: 3, borderLeftColor: cfg.dot }}
    >
      {/* Status icon */}
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: cfg.bg }}
      >
        {item.situacao === "Em Deslocamento" ? (
          <Navigation className="h-5 w-5" style={{ color: cfg.color }} />
        ) : (
          <Activity className="h-5 w-5" style={{ color: cfg.color }} />
        )}
      </span>

      {/* Info principal */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold text-gray-900 truncate">
            {item.equipamento}
          </span>
          <span className="text-[11px] font-medium text-gray-400">{item.glpiId}</span>
          <StatusChip situacao={item.situacao} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {item.municipio && (
            <span className="flex items-center gap-1 text-[11.5px] text-gray-500">
              <MapPin className="h-3 w-3 shrink-0" />
              {item.municipio}
            </span>
          )}
          {item.tecnico_nome && (
            <span className="flex items-center gap-1 text-[11.5px] text-gray-500">
              <User className="h-3 w-3 shrink-0" />
              {item.tecnico_nome}
            </span>
          )}
          {inicioTs && (
            <span className="flex items-center gap-1 text-[11.5px] text-gray-500">
              <Clock className="h-3 w-3 shrink-0" />
              Início: {formatHorario(inicioTs)}
            </span>
          )}
        </div>
      </div>

      {/* Tempo decorrido */}
      <div className="shrink-0 text-right">
        <div className="text-[22px] font-bold tabular-nums" style={{ color: cfg.color }}>
          {formatTempo(item.tempo_decorrido_min)}
        </div>
        <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
          em campo
        </div>
      </div>
    </div>
  );
}
