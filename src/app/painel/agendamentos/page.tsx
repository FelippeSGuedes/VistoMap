"use client";

/**
 * /painel/agendamentos — gestão dos agendamentos criados no drawer de
 * atribuição em lote (src/app/painel/vistorias/page.tsx, campo "Agendar
 * para"). Lista só o que está com status AGENDADA (GET já filtra isso),
 * agrupado por data → técnico, na ordem sugerida pelo roteirizador.
 * Cancelar aqui só desmarca a data — a vistoria continua com o técnico
 * atribuído e volta a aparecer na fila dele imediatamente.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronDown,
  CloudRain,
  MapPin,
  RefreshCw,
  Search,
  User,
  X,
} from "lucide-react";
import { painelService, type AgendamentoItem } from "@/services/painel";

function formatHora(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function formatDataLonga(data: string): string {
  const d = new Date(`${data}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

export default function AgendamentosPage() {
  const [items, setItems] = useState<AgendamentoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTecnico, setFilterTecnico] = useState<string>("all");
  const [cancelando, setCancelando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await painelService.fetchAgendamentos();
      setItems(data);
      setErro(null);
    } catch {
      setErro("Falha ao carregar agendamentos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tecnicos = useMemo(
    () =>
      Array.from(new Map(items.map((i) => [i.tecnico_id, i.tecnico_nome])).entries()),
    [items]
  );

  const filtrados = useMemo(() => {
    return items.filter((i) => {
      if (filterTecnico !== "all" && String(i.tecnico_id) !== filterTecnico) return false;
      if (search) {
        const q = search.toLowerCase();
        return i.equipamento.toLowerCase().includes(q) || i.tecnico_nome.toLowerCase().includes(q);
      }
      return true;
    });
  }, [items, filterTecnico, search]);

  const porData = useMemo(() => {
    const map = new Map<string, Map<number, AgendamentoItem[]>>();
    for (const it of filtrados) {
      const porTecnico = map.get(it.data_agendada) ?? new Map<number, AgendamentoItem[]>();
      const lista = porTecnico.get(it.tecnico_id) ?? [];
      lista.push(it);
      porTecnico.set(it.tecnico_id, lista);
      map.set(it.data_agendada, porTecnico);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtrados]);

  const handleCancelar = async (id: number) => {
    setCancelando(id);
    try {
      await painelService.cancelarAgendamento(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setErro("Falha ao cancelar — tente de novo.");
    } finally {
      setCancelando(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--vm-text)]">Agendamentos</h1>
          <p className="mt-0.5 text-xs text-[var(--vm-muted)]">
            Vistorias marcadas pra data futura, com ordem de visita sugerida pelo roteirizador
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); void load(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg border text-[var(--vm-muted)] transition hover:bg-black/5"
          style={{ borderColor: "var(--vm-border)" }}
          title="Atualizar"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <label
          className="flex h-9 flex-1 min-w-[200px] items-center gap-2 rounded-lg border px-3 text-sm"
          style={{ borderColor: "var(--vm-border)", background: "var(--vm-card)" }}
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--vm-faint)]" />
          <input
            type="search"
            placeholder="Buscar equipamento ou técnico…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[12.5px] outline-none"
          />
        </label>
        <div className="relative">
          <select
            value={filterTecnico}
            onChange={(e) => setFilterTecnico(e.target.value)}
            className="h-9 appearance-none rounded-lg border pl-3 pr-8 text-[12.5px] font-medium outline-none"
            style={{ borderColor: "var(--vm-border)", background: "var(--vm-card)", color: "var(--vm-text)" }}
          >
            <option value="all">Todos os técnicos</option>
            {tecnicos.map(([id, nome]) => (
              <option key={id} value={String(id)}>{nome}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--vm-faint)]" />
        </div>
      </div>

      {erro && (
        <p className="rounded-lg px-3 py-2 text-[12px] font-medium" style={{ background: "#FEF2F2", color: "#B91C1C" }}>
          {erro}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl" style={{ background: "var(--vm-fill-2)" }} />
          ))}
        </div>
      ) : porData.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-16" style={{ borderColor: "var(--vm-border)" }}>
          <Calendar className="h-10 w-10 text-[var(--vm-faint)]" />
          <p className="text-sm font-semibold text-[var(--vm-muted)]">Nenhum agendamento</p>
          <p className="text-[11px] text-[var(--vm-faint)]">
            Agende pela tela de Vistorias Pendentes → seleção em lote → "Agendar para"
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {porData.map(([data, porTecnico]) => (
            <div key={data}>
              <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold capitalize" style={{ color: "var(--vm-text)" }}>
                <Calendar className="h-3.5 w-3.5" style={{ color: "#00875F" }} />
                {formatDataLonga(data)}
              </p>
              <div className="space-y-3">
                {Array.from(porTecnico.entries()).map(([tecId, lista]) => (
                  <div
                    key={tecId}
                    className="overflow-hidden rounded-2xl"
                    style={{ border: "1px solid var(--vm-border)", background: "var(--vm-card)" }}
                  >
                    <div
                      className="flex items-center gap-2 px-4 py-2.5"
                      style={{ background: "var(--vm-fill-2)" }}
                    >
                      <User className="h-3.5 w-3.5" style={{ color: "var(--vm-muted)" }} />
                      <p className="text-[12.5px] font-semibold" style={{ color: "var(--vm-text)" }}>
                        {lista[0].tecnico_nome}
                      </p>
                      <span className="text-[11px]" style={{ color: "var(--vm-faint)" }}>
                        · {lista.length} parada{lista.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="divide-y" style={{ borderColor: "var(--vm-border-soft)" }}>
                      {lista
                        .sort((a, b) => a.ordem - b.ordem)
                        .map((it) => (
                          <div key={it.id} className="flex items-start gap-3 px-4 py-3">
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ background: "#00875F" }}
                            >
                              {it.ordem}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[12.5px] font-semibold" style={{ color: "var(--vm-text)" }}>
                                {it.equipamento}
                              </p>
                              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: "var(--vm-muted)" }}>
                                <span>Chegada {formatHora(it.chegada_prevista)} · Saída {formatHora(it.saida_prevista)}</span>
                                {it.distancia_desde_anterior_m != null && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-2.5 w-2.5" />
                                    {(it.distancia_desde_anterior_m / 1000).toFixed(1)}km
                                  </span>
                                )}
                              </p>
                              {it.risco_chuva_alerta && (
                                <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#B91C1C" }}>
                                  <CloudRain className="h-3 w-3" /> Risco de chuva {it.risco_chuva_pct}%
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCancelar(it.id)}
                              disabled={cancelando === it.id}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition hover:bg-red-50 disabled:opacity-50"
                              style={{ color: "#B91C1C" }}
                              title="Cancelar agendamento"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
