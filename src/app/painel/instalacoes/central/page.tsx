"use client";

/**
 * /painel/instalacoes/central — console de ações administrativas do módulo
 * de Instalação (reatribuir/devolver/cancelar, com motivo obrigatório e
 * trilha de auditoria), espelhando /painel/central-vistorias. Diferente das
 * telas de leitura (Pendentes/Em Andamento/Instaladas): aqui o
 * ADMIN/MODERADOR toma ação corretiva sobre um poste já tocado.
 *
 * Só lista states_id EM_INSTALACAO(4)/INSTALADO(5) — REJEITADA(6) já tem
 * fila própria em /painel/instalacoes/rejeitadas, não entra aqui pra não
 * duplicar gestão da mesma fila em duas telas.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Calendar, Camera, Check, CheckCircle2, ChevronDown, ClipboardList,
  MapPin, RefreshCw, Search, ShieldCheck, Trash2, Undo2, User, UserCheck, Wrench, X,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { fetchInstaladoresAtivos } from "@/services/painel-instalacoes";
import type { TecnicoAtivo } from "@/types";

const ROXO = "#7C3AED";

interface Instalacao {
  id: number;
  equipamento: string;
  municipio: string | null;
  statesId: number;
  statusGeralNome: string | null;
  instaladorId: number | null;
  instaladorNome: string | null;
  dataInstalacao: string | null;
}

const STATE_EM_INSTALACAO = 4;
const STATE_INSTALADO = 5;

const STATE_LABEL: Record<number, string> = {
  [STATE_EM_INSTALACAO]: "Em Instalação",
  [STATE_INSTALADO]: "Instalado",
};
const STATE_COLOR: Record<number, string> = {
  [STATE_EM_INSTALACAO]: ROXO,
  [STATE_INSTALADO]: "#00B388",
};

const CHECKLIST_ITEMS: Array<{ key: string; label: string }> = [
  { key: "cintaInstalada", label: "Cinta corretamente instalada" },
  { key: "equipamentoFixado", label: "Equipamento fixado adequadamente" },
  { key: "cabeamentoOrganizado", label: "Cabeamento organizado" },
  { key: "alimentacaoValidada", label: "Alimentação validada" },
  { key: "equipamentoEnergizado", label: "Equipamento energizado" },
  { key: "registroFotografico", label: "Registro fotográfico completo" },
];

const FOTO_ITEMS: Array<{ n: number; label: string }> = [
  { n: 1, label: "Chegada e inspeção" },
  { n: 2, label: "Preparação do material" },
  { n: 3, label: "Fixação da cinta" },
  { n: 4, label: "Fixação do Access Point" },
  { n: 5, label: "Teste de tensão" },
  { n: 6, label: "Vista frontal" },
  { n: 7, label: "Vista geral final" },
];

/** Cor + fundo translúcido consistentes nos dois temas. */
function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function StateBadge({ id }: { id: number }) {
  const label = STATE_LABEL[id] ?? "?";
  const color = STATE_COLOR[id] ?? "#9AA7B4";
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: tint(color, 0.15), color, border: `1px solid ${tint(color, 0.32)}` }}
    >
      {label}
    </span>
  );
}

const fieldStyle = {
  background: "var(--vm-tile)",
  borderColor: "var(--vm-border)",
  color: "var(--vm-text)",
} as const;

function ModalShell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className={`${wide ? "max-w-xl" : "max-w-md"} max-h-[90vh] w-full overflow-y-auto rounded-2xl p-6`}
        style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }}
      >
        {children}
      </div>
    </div>
  );
}

function CheckItem({ label, checked, onToggle, accent }: { label: string; checked: boolean; onToggle: () => void; accent: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[12.5px] font-medium transition"
      style={{
        borderColor: checked ? tint(accent, 0.5) : "var(--vm-border)",
        background: checked ? tint(accent, 0.1) : "var(--vm-tile)",
        color: checked ? accent : "var(--vm-text-soft)",
      }}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border"
        style={{ borderColor: checked ? accent : "var(--vm-border)", background: checked ? accent : "transparent" }}
      >
        {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

export default function CentralInstalacoesPage() {
  const { session } = useAuthStore();
  const [instalacoes, setInstalacoes] = useState<Instalacao[]>([]);
  const [instaladores, setInstaladores] = useState<TecnicoAtivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroState, setFiltroState] = useState<number | "">("");

  // Cancelar
  const [cancelando, setCancelando] = useState<Instalacao | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  // Reatribuir
  const [reatrib, setReatrib] = useState<Instalacao | null>(null);
  const [novoInstalador, setNovoInstalador] = useState<number | "">("");
  const [motivo, setMotivo] = useState("");
  const [reatribLoading, setReatribLoading] = useState(false);

  // Devolver
  const [devolvendo, setDevolvendo] = useState<Instalacao | null>(null);
  const [devItensChecklist, setDevItensChecklist] = useState<string[]>([]);
  const [devFotos, setDevFotos] = useState<number[]>([]);
  const [devMotivo, setDevMotivo] = useState("");
  const [devLoading, setDevLoading] = useState(false);

  // Erro de ação (reatribuir/devolver/cancelar) — sem isso uma falha na API
  // fica muda pro operador (loading para, nada acontece, sem pista do porquê).
  const [erro, setErro] = useState<string | null>(null);

  const headers = useMemo(() => ({ Authorization: `Bearer ${session?.token}` }), [session?.token]);

  function extrairErro(err: unknown): string {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return msg || "Falha inesperada. Tente de novo em alguns segundos.";
  }

  const fetchData = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const [iRes, instRes] = await Promise.all([
        api.get<{ instalacoes: Instalacao[] }>("/painel/instalacoes/central", { headers }),
        fetchInstaladoresAtivos().catch(() => [] as TecnicoAtivo[]),
      ]);
      setInstalacoes(iRes.data.instalacoes);
      setInstaladores(instRes);
    } catch {
      /* ignora */
    } finally {
      setLoading(false);
    }
  }, [session?.token, headers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtradas = useMemo(
    () =>
      instalacoes.filter((v) => {
        if (filtroState !== "" && v.statesId !== filtroState) return false;
        const q = busca.toLowerCase();
        return (
          v.equipamento.toLowerCase().includes(q) ||
          (v.municipio ?? "").toLowerCase().includes(q) ||
          (v.instaladorNome ?? "").toLowerCase().includes(q)
        );
      }),
    [instalacoes, busca, filtroState]
  );

  async function handleCancelar() {
    if (!cancelando || cancelConfirm !== "CANCELAR") return;
    setCancelLoading(true);
    setErro(null);
    try {
      await api.post(`/painel/instalacoes/central/${cancelando.id}/cancelar`, {}, { headers });
      setCancelando(null);
      setCancelConfirm("");
      await fetchData();
    } catch (err) {
      setErro(extrairErro(err));
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleReatribuir() {
    if (!reatrib || !novoInstalador || !motivo.trim()) return;
    setReatribLoading(true);
    setErro(null);
    try {
      await api.post(
        `/painel/instalacoes/central/${reatrib.id}/reatribuir`,
        { instaladorId: novoInstalador, motivo: motivo.trim() },
        { headers }
      );
      setReatrib(null);
      setNovoInstalador("");
      setMotivo("");
      await fetchData();
    } catch (err) {
      setErro(extrairErro(err));
    } finally {
      setReatribLoading(false);
    }
  }

  function toggleChecklist(key: string) {
    setDevItensChecklist((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }
  function toggleFoto(n: number) {
    setDevFotos((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
  }

  async function handleDevolver() {
    if (!devolvendo || (devItensChecklist.length === 0 && devFotos.length === 0) || !devMotivo.trim()) return;
    setDevLoading(true);
    setErro(null);
    try {
      await api.post(
        `/painel/instalacoes/central/${devolvendo.id}/devolver`,
        { itensChecklist: devItensChecklist, fotos: devFotos, motivo: devMotivo.trim() },
        { headers }
      );
      setDevolvendo(null);
      setDevItensChecklist([]);
      setDevFotos([]);
      setDevMotivo("");
      await fetchData();
    } catch (err) {
      setErro(extrairErro(err));
    } finally {
      setDevLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: tint(ROXO, 0.12), color: ROXO }}
          >
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: "var(--vm-text)" }}>Central das Instalações</h1>
            <p className="text-[13px]" style={{ color: "var(--vm-muted)" }}>
              Cancele, reatribua ou devolva instalações com registro de motivo.
            </p>
          </div>
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

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--vm-faint)" }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar equipamento, município, instalador…"
            className="w-full rounded-xl py-2 pl-9 pr-3 text-[13px] outline-none"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          />
        </div>
        <div className="relative">
          <select
            value={filtroState}
            onChange={(e) => setFiltroState(e.target.value === "" ? "" : Number(e.target.value))}
            className="appearance-none rounded-xl py-2 pl-3 pr-8 text-[13px] outline-none"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          >
            <option value="">Todos os estados</option>
            {Object.entries(STATE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--vm-faint)" }} />
        </div>
      </div>

      {/* Grid de cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[13px]" style={{ color: "var(--vm-faint)" }}>
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : filtradas.length === 0 ? (
        <div
          className="rounded-2xl py-16 text-center text-[13px]"
          style={{ border: "1px solid var(--vm-border)", background: "var(--vm-card)", color: "var(--vm-faint)" }}
        >
          Nenhuma instalação encontrada.
        </div>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {filtradas.map((v) => {
            const cor = STATE_COLOR[v.statesId] ?? "#9AA7B4";
            const semAcoes = !v.instaladorNome && v.statesId < STATE_EM_INSTALACAO;
            return (
              <div
                key={v.id}
                className="flex flex-col overflow-hidden rounded-2xl transition hover:-translate-y-0.5"
                style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 6px 18px rgba(0,0,0,0.06)" }}
              >
                <div style={{ height: 3, background: cor, flexShrink: 0 }} />
                <div className="flex flex-1 flex-col p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[14px] font-bold" style={{ color: "var(--vm-text)" }} title={v.equipamento}>
                        {v.equipamento}
                      </h3>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
                        <MapPin className="h-3 w-3 shrink-0" />
                        {v.municipio ?? "—"}
                      </p>
                    </div>
                    <StateBadge id={v.statesId} />
                  </div>

                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 shrink-0" />
                      {v.instaladorNome ?? <span style={{ color: "var(--vm-faint)" }}>sem instalador</span>}
                    </span>
                    {v.dataInstalacao && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {new Date(v.dataInstalacao).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto flex items-center gap-1.5 pt-3" style={{ borderTop: "1px solid var(--vm-border-soft)" }}>
                    {v.instaladorNome && (
                      <button
                        type="button"
                        onClick={() => { setReatrib(v); setNovoInstalador(""); setMotivo(""); setErro(null); }}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:brightness-95"
                        style={{ border: `1px solid ${tint("#3B82F6", 0.35)}`, background: tint("#3B82F6", 0.12), color: "#3B82F6" }}
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Reatribuir
                      </button>
                    )}
                    {v.statesId === STATE_INSTALADO && (
                      <button
                        type="button"
                        onClick={() => { setDevolvendo(v); setDevItensChecklist([]); setDevFotos([]); setDevMotivo(""); setErro(null); }}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:brightness-95"
                        style={{ border: `1px solid ${tint("#D97706", 0.4)}`, background: tint("#D97706", 0.14), color: "#D97706" }}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Devolver
                      </button>
                    )}
                    {/* Cancelar é admin-only — moderador tem o resto do escopo aqui. */}
                    {session?.role === "admin" && v.statesId >= STATE_EM_INSTALACAO && (
                      <button
                        type="button"
                        onClick={() => { setCancelando(v); setCancelConfirm(""); setErro(null); }}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:brightness-95"
                        style={{ border: `1px solid ${tint("#DC2626", 0.35)}`, background: tint("#DC2626", 0.12), color: "#DC2626" }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Cancelar
                      </button>
                    )}
                    {semAcoes && (
                      <span className="text-[11px]" style={{ color: "var(--vm-faint)" }}>Sem ações disponíveis</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Cancelar */}
      {cancelando && (
        <ModalShell>
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tint("#DC2626", 0.15), color: "#DC2626" }}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>Cancelar instalação</h2>
              <p className="mt-0.5 text-[12px]" style={{ color: "var(--vm-muted)" }}>
                Esta ação é irreversível. O poste volta para <strong>Liberado</strong>, o instalador é desvinculado, checklist e tensão identificada são resetados, e as fotos da instalação são deletadas.
              </p>
            </div>
          </div>
          <div className="mb-4 rounded-xl px-3 py-2 text-[12px]" style={{ background: "var(--vm-fill)" }}>
            <span className="font-semibold" style={{ color: "var(--vm-text-soft)" }}>{cancelando.equipamento}</span>
            {cancelando.municipio && <span className="ml-2" style={{ color: "var(--vm-faint)" }}>{cancelando.municipio}</span>}
          </div>
          <p className="mb-2 text-[12px]" style={{ color: "var(--vm-muted)" }}>
            Digite <strong style={{ color: "var(--vm-text)" }}>CANCELAR</strong> para confirmar:
          </p>
          <input
            value={cancelConfirm}
            onChange={(e) => setCancelConfirm(e.target.value)}
            placeholder="CANCELAR"
            className="mb-4 w-full rounded-xl px-3 py-2 text-[13px] outline-none"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          />
          {erro && (
            <p className="mb-4 rounded-xl px-3 py-2 text-[12px] font-medium" style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
              {erro}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setCancelando(null); setErro(null); }}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition hover:brightness-95"
              style={{ border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={cancelConfirm !== "CANCELAR" || cancelLoading}
              onClick={handleCancelar}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-[13px] font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {cancelLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Confirmar cancelamento
            </button>
          </div>
        </ModalShell>
      )}

      {/* Modal Reatribuir */}
      {reatrib && (
        <ModalShell>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tint("#3B82F6", 0.15), color: "#3B82F6" }}>
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>Reatribuir instalação</h2>
                <p className="text-[11px]" style={{ color: "var(--vm-muted)" }}>{reatrib.equipamento}</p>
              </div>
            </div>
            <button type="button" onClick={() => { setReatrib(null); setErro(null); }} style={{ color: "var(--vm-faint)" }}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {reatrib.instaladorNome && (
            <div className="mb-3 rounded-xl px-3 py-2 text-[12px]" style={{ background: tint("#D97706", 0.13), color: "#D97706" }}>
              Instalador atual: <strong>{reatrib.instaladorNome}</strong>
            </div>
          )}

          <label className="mb-1 block text-[12px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Novo instalador</label>
          <div className="relative mb-3">
            <select
              value={novoInstalador}
              onChange={(e) => setNovoInstalador(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full appearance-none rounded-xl py-2 pl-3 pr-8 text-[13px] outline-none"
              style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
            >
              <option value="">Selecione um instalador…</option>
              {instaladores.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} {t.status !== "offline" ? "●" : "○"}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--vm-faint)" }} />
          </div>

          <label className="mb-1 block text-[12px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Motivo da reatribuição *</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: Instalador anterior em licença médica…"
            rows={3}
            className="mb-4 w-full resize-none rounded-xl px-3 py-2 text-[12px] outline-none"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          />

          {erro && (
            <p className="mb-4 rounded-xl px-3 py-2 text-[12px] font-medium" style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
              {erro}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setReatrib(null); setErro(null); }}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition hover:brightness-95"
              style={{ border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!novoInstalador || !motivo.trim() || reatribLoading}
              onClick={handleReatribuir}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-[13px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {reatribLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar reatribuição
            </button>
          </div>
        </ModalShell>
      )}

      {/* Modal Devolver */}
      {devolvendo && (
        <ModalShell wide>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tint("#D97706", 0.15), color: "#D97706" }}>
                <Undo2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>Devolver para correção</h2>
                <p className="text-[11px]" style={{ color: "var(--vm-muted)" }}>
                  {devolvendo.equipamento} — vai voltar pra fila de {devolvendo.instaladorNome ?? "instalador responsável"}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => { setDevolvendo(null); setErro(null); }} style={{ color: "var(--vm-faint)" }}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-4">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
              <ShieldCheck className="h-3.5 w-3.5" /> Itens do checklist errados
            </h3>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {CHECKLIST_ITEMS.map((item) => (
                <CheckItem
                  key={item.key}
                  label={item.label}
                  checked={devItensChecklist.includes(item.key)}
                  onToggle={() => toggleChecklist(item.key)}
                  accent="#D97706"
                />
              ))}
            </div>
          </div>

          <div className="mb-4">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
              <Camera className="h-3.5 w-3.5" /> Fotos que precisam ser refeitas
            </h3>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {FOTO_ITEMS.map((f) => (
                <CheckItem
                  key={f.n}
                  label={`${f.n}. ${f.label}`}
                  checked={devFotos.includes(f.n)}
                  onToggle={() => toggleFoto(f.n)}
                  accent={ROXO}
                />
              ))}
            </div>
          </div>

          <label className="mb-1 block text-[12px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Motivo da devolução *</label>
          <textarea
            value={devMotivo}
            onChange={(e) => setDevMotivo(e.target.value)}
            placeholder="Ex: Foto do registro fotográfico veio desfocada…"
            rows={3}
            className="mb-4 w-full resize-none rounded-xl px-3 py-2 text-[12px] outline-none"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          />

          {erro && (
            <p className="mb-4 rounded-xl px-3 py-2 text-[12px] font-medium" style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
              {erro}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setDevolvendo(null); setErro(null); }}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition hover:brightness-95"
              style={{ border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={(devItensChecklist.length === 0 && devFotos.length === 0) || !devMotivo.trim() || devLoading}
              onClick={handleDevolver}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-50"
              style={{ background: "linear-gradient(90deg, #D97706, #F59E0B)" }}
            >
              {devLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              Confirmar devolução
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
