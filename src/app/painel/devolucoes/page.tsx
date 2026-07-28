"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, Clock, RefreshCw,
  Trophy, Undo2, Users,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { DevolucaoDetalheModal } from "@/components/painel/DevolucaoDetalheModal";

interface Devolucao {
  id: number;
  vistoriaId: number;
  equipamento: string;
  tecnicoId: number | null;
  tecnicoNome: string | null;
  analistaNome: string;
  itens: string[];
  motivos: string[];
  motivoOutro: string | null;
  precisaDeslocamento: boolean;
  status: "PENDENTE" | "RESOLVIDA";
  criadoEm: string;
  resolvidoEm: string | null;
}

interface DevolucoesStats {
  total: number;
  pendentes: number;
  rankMotivos: Array<{ motivo: string; total: number }>;
  rankTecnicos: Array<{ tecnicoId: number; tecnicoNome: string; total: number }>;
}

type Periodo = "7" | "30" | "90" | "all";

const PERIODOS: Array<{ id: Periodo; label: string }> = [
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
  { id: "90", label: "90 dias" },
  { id: "all", label: "Tudo" },
];

function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function initials(nome: string) {
  const p = nome.trim().split(/[\s._-]+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

function relativo(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function desdeDe(periodo: Periodo): string | undefined {
  if (periodo === "all") return undefined;
  const d = new Date();
  d.setDate(d.getDate() - Number(periodo));
  return d.toISOString().slice(0, 19).replace("T", " ");
}

const ACCENT = "#D97706";

function StatCard({
  icon: Icon, label, value, color,
}: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl p-4"
      style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: tint(color, 0.14), color }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-[20px] font-bold leading-none tabular-nums" style={{ color: "var(--vm-text)" }}>{value}</div>
        <div className="mt-1 text-[11px] font-medium" style={{ color: "var(--vm-muted)" }}>{label}</div>
      </div>
    </div>
  );
}

export default function DevolucoesPage() {
  const { session } = useAuthStore();
  const [stats, setStats] = useState<DevolucoesStats | null>(null);
  const [recentes, setRecentes] = useState<Devolucao[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [detalheDevolucao, setDetalheDevolucao] = useState<Devolucao | null>(null);

  const headers = { Authorization: `Bearer ${session?.token}` };

  const fetchData = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const desde = desdeDe(periodo);
      const { data } = await api.get<{ stats: DevolucoesStats; recentes: Devolucao[] }>(
        "/painel/devolucoes",
        { headers, params: desde ? { desde } : {} }
      );
      setStats(data.stats);
      setRecentes(data.recentes);
    } catch { /* ignora */ }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, periodo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resolvidas = stats ? stats.total - stats.pendentes : 0;
  const taxaResolucao = stats && stats.total > 0 ? Math.round((resolvidas / stats.total) * 100) : 0;

  const maxMotivo = useMemo(
    () => Math.max(...(stats?.rankMotivos.map((r) => r.total) ?? [1]), 1),
    [stats]
  );
  const maxTecnico = useMemo(
    () => Math.max(...(stats?.rankTecnicos.map((r) => r.total) ?? [1]), 1),
    [stats]
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: tint(ACCENT, 0.15), color: ACCENT }}
          >
            <Undo2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: "var(--vm-text)" }}>Devoluções</h1>
            <p className="text-[13px]" style={{ color: "var(--vm-muted)" }}>
              Vistorias devolvidas pro técnico corrigir — volume, motivos e ranking.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl p-1" style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)" }}>
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                className="rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition"
                style={
                  periodo === p.id
                    ? { background: ACCENT, color: "#fff" }
                    : { color: "var(--vm-muted)" }
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition hover:brightness-95"
            style={{ border: "1px solid var(--vm-border)", background: "var(--vm-card)" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} style={{ color: "var(--vm-muted)" }} />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <StatCard icon={Undo2} label="Total de devoluções" value={String(stats?.total ?? "—")} color={ACCENT} />
        <StatCard icon={Clock} label="Pendentes de correção" value={String(stats?.pendentes ?? "—")} color="#DC2626" />
        <StatCard icon={CheckCircle2} label="Corrigidas" value={String(resolvidas)} color="#059669" />
        <StatCard icon={Trophy} label="Taxa de resolução" value={`${taxaResolucao}%`} color="#3B82F6" />
      </div>

      {/* Ranks */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        {/* Rank de motivos */}
        <div className="rounded-2xl p-5" style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" style={{ color: ACCENT }} />
            <h2 className="text-[13.5px] font-bold" style={{ color: "var(--vm-text)" }}>Rank de motivos</h2>
          </div>
          {loading ? (
            <p className="py-6 text-center text-[12px]" style={{ color: "var(--vm-faint)" }}>Carregando…</p>
          ) : !stats || stats.rankMotivos.length === 0 ? (
            <p className="py-6 text-center text-[12px]" style={{ color: "var(--vm-faint)" }}>Nenhuma devolução no período.</p>
          ) : (
            <ul className="space-y-2.5">
              {stats.rankMotivos.map((r) => (
                <li key={r.motivo}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-medium" style={{ color: "var(--vm-text-soft)" }}>{r.motivo}</span>
                    <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: ACCENT }}>{r.total}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--vm-tile)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(r.total / maxMotivo) * 100}%`, background: ACCENT }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Rank de técnicos */}
        <div className="rounded-2xl p-5" style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: "#3B82F6" }} />
            <h2 className="text-[13.5px] font-bold" style={{ color: "var(--vm-text)" }}>Rank de técnicos</h2>
          </div>
          {loading ? (
            <p className="py-6 text-center text-[12px]" style={{ color: "var(--vm-faint)" }}>Carregando…</p>
          ) : !stats || stats.rankTecnicos.length === 0 ? (
            <p className="py-6 text-center text-[12px]" style={{ color: "var(--vm-faint)" }}>Nenhuma devolução no período.</p>
          ) : (
            <ul className="space-y-2">
              {stats.rankTecnicos.map((r, i) => (
                <li key={r.tecnicoId} className="flex items-center gap-2.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                    style={{ background: i === 0 ? "linear-gradient(135deg,#F59E0B,#D97706)" : "linear-gradient(135deg,#60A5FA,#3B82F6)" }}
                  >
                    {initials(r.tecnicoNome)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-medium" style={{ color: "var(--vm-text-soft)" }}>{r.tecnicoNome}</span>
                      <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: "#3B82F6" }}>{r.total}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--vm-tile)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(r.total / maxTecnico) * 100}%`, background: "#3B82F6" }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recentes */}
      <div className="rounded-2xl p-5" style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}>
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4" style={{ color: "var(--vm-muted)" }} />
          <h2 className="text-[13.5px] font-bold" style={{ color: "var(--vm-text)" }}>Devoluções recentes</h2>
        </div>
        {loading ? (
          <p className="py-8 text-center text-[12px]" style={{ color: "var(--vm-faint)" }}>Carregando…</p>
        ) : recentes.length === 0 ? (
          <p className="py-8 text-center text-[12px]" style={{ color: "var(--vm-faint)" }}>Nenhuma devolução no período.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--vm-border-soft)" }}>
            {recentes.map((d) => (
              <li key={d.id} className="py-3 first:pt-0 last:pb-0">
              <button
                type="button"
                onClick={() => setDetalheDevolucao(d)}
                className="flex w-full items-center gap-3 text-left transition hover:brightness-95"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: tint(d.status === "PENDENTE" ? "#DC2626" : "#059669", 0.14), color: d.status === "PENDENTE" ? "#DC2626" : "#059669" }}
                >
                  {d.status === "PENDENTE" ? <Clock className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[12.5px] font-semibold" style={{ color: "var(--vm-text)" }}>{d.equipamento}</span>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-px text-[9.5px] font-bold"
                      style={{
                        background: tint(d.status === "PENDENTE" ? "#DC2626" : "#059669", 0.14),
                        color: d.status === "PENDENTE" ? "#DC2626" : "#059669",
                      }}
                    >
                      {d.status === "PENDENTE" ? "Pendente" : "Corrigida"}
                    </span>
                  </div>
                  <p className="truncate text-[11px]" style={{ color: "var(--vm-muted)" }}>
                    {d.tecnicoNome ?? "—"} · {d.motivos.join(", ")}
                  </p>
                </div>
                <span className="shrink-0 text-[10.5px]" style={{ color: "var(--vm-faint)" }}>{relativo(d.criadoEm)}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--vm-faint)" }} />
              </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DevolucaoDetalheModal devolucao={detalheDevolucao} onClose={() => setDetalheDevolucao(null)} />
    </div>
  );
}
