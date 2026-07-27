"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Calendar, CheckCircle2, ClipboardList, MapPin, RefreshCw, Search,
  Trash2, Undo2, User, UserCheck, X, ChevronDown,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { DEVOLUCAO_ITENS, DEVOLUCAO_MOTIVOS, devolucaoPrecisaDeslocamento } from "@/lib/glpi/devolucaoItens";

interface Vistoria {
  id: number;
  equipamento: string;
  municipio: string | null;
  situacao_id: number;
  situacao: string;
  status_name: string | null;
  tecnico_id: number | null;
  tecnico_nome: string | null;
  data_vistoria: string | null;
  is_repeat: number;
}

interface Tecnico {
  users_id: number;
  nome: string;
  email: string | null;
  status_operacional: string;
}

const SITUACAO_LABEL: Record<number, string> = {
  0: "Indefinido", 1: "A Vistoriar", 2: "Em Vistoria", 3: "Vistoriado",
  4: "Ag. Revisita", 5: "Em Revisita", 6: "Revisitado", 8: "Devolvida",
};
const SITUACAO_COLOR: Record<number, string> = {
  0: "#9AA7B4", 1: "#F59E0B", 2: "#3B82F6", 3: "#00B388",
  4: "#F97316", 5: "#0EA5E9", 6: "#10B981", 8: "#DC2626",
};

/** Cor + fundo translúcido consistentes nos dois temas (opacidade absorve o contraste). */
function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function SituacaoBadge({ id }: { id: number }) {
  const label = SITUACAO_LABEL[id] ?? "?";
  const color = SITUACAO_COLOR[id] ?? "#9AA7B4";
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: tint(color, 0.15), color, border: `1px solid ${tint(color, 0.32)}` }}
    >
      {label}
    </span>
  );
}

/* ── Estilo compartilhado: inputs/selects/textarea legíveis nos 2 temas ── */
const fieldStyle = {
  background: "var(--vm-tile)",
  borderColor: "var(--vm-border)",
  color: "var(--vm-text)",
} as const;

function ModalShell({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className={`${wide ? "max-w-lg" : "max-w-md"} max-h-[90vh] w-full overflow-y-auto rounded-2xl p-6`}
        style={{
          background: "var(--vm-card)",
          border: "1px solid var(--vm-border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onToggle,
  accent,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  accent: string;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px] transition"
      style={{
        border: `1px solid ${checked ? tint(accent, 0.5) : "var(--vm-border)"}`,
        background: checked ? tint(accent, 0.12) : "var(--vm-tile)",
        color: checked ? accent : "var(--vm-text-soft)",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 shrink-0 rounded"
        style={{ accentColor: accent }}
      />
      {label}
    </label>
  );
}

export default function CentralVistoriasPage() {
  const { session } = useAuthStore();
  const [vistorias, setVistorias] = useState<Vistoria[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroSit, setFiltroSit] = useState<number | "">("");

  // Cancelar
  const [cancelando, setCancelando] = useState<Vistoria | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  // Reatribuir
  const [reatrib, setReatrib] = useState<Vistoria | null>(null);
  const [novoTecnico, setNovoTecnico] = useState<number | "">("");
  const [motivo, setMotivo] = useState("");
  const [reatribLoading, setReatribLoading] = useState(false);

  // Devolver
  const [devolvendo, setDevolvendo] = useState<Vistoria | null>(null);
  const [devItens, setDevItens] = useState<string[]>([]);
  const [devMotivos, setDevMotivos] = useState<string[]>([]);
  const [devMotivoOutro, setDevMotivoOutro] = useState("");
  const [devLoading, setDevLoading] = useState(false);

  const headers = { Authorization: `Bearer ${session?.token}` };

  const fetchData = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const [vRes, tRes] = await Promise.all([
        api.get<{ vistorias: Vistoria[] }>("/painel/central-vistorias", { headers }),
        api.get<{ tecnicos: Tecnico[] }>("/painel/mapa", { headers }),
      ]);
      setVistorias(vRes.data.vistorias);
      setTecnicos(tRes.data.tecnicos ?? []);
    } catch { /* ignora */ }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtradas = useMemo(() => vistorias.filter((v) => {
    if (filtroSit !== "" && v.situacao_id !== filtroSit) return false;
    const q = busca.toLowerCase();
    return (
      v.equipamento.toLowerCase().includes(q) ||
      (v.municipio ?? "").toLowerCase().includes(q) ||
      (v.tecnico_nome ?? "").toLowerCase().includes(q)
    );
  }), [vistorias, busca, filtroSit]);

  async function handleCancelar() {
    if (!cancelando || cancelConfirm !== "CANCELAR") return;
    setCancelLoading(true);
    try {
      await api.post(`/painel/central-vistorias/${cancelando.id}/cancelar`, {}, { headers });
      setCancelando(null);
      setCancelConfirm("");
      await fetchData();
    } catch { /* TODO: toast */ }
    finally { setCancelLoading(false); }
  }

  async function handleReatribuir() {
    if (!reatrib || !novoTecnico || !motivo.trim()) return;
    setReatribLoading(true);
    try {
      await api.post(
        `/painel/central-vistorias/${reatrib.id}/reatribuir`,
        { tecnicoId: novoTecnico, motivo: motivo.trim() },
        { headers }
      );
      setReatrib(null);
      setNovoTecnico("");
      setMotivo("");
      await fetchData();
    } catch { /* TODO: toast */ }
    finally { setReatribLoading(false); }
  }

  function toggleDevItem(key: string) {
    setDevItens((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  function toggleDevMotivo(m: string) {
    setDevMotivos((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  async function handleDevolver() {
    if (!devolvendo || devItens.length === 0 || devMotivos.length === 0) return;
    if (devMotivos.includes("Outro") && !devMotivoOutro.trim()) return;
    setDevLoading(true);
    try {
      await api.post(
        `/painel/central-vistorias/${devolvendo.id}/devolver`,
        { itens: devItens, motivos: devMotivos, motivoOutro: devMotivoOutro.trim() || undefined },
        { headers }
      );
      setDevolvendo(null);
      setDevItens([]);
      setDevMotivos([]);
      setDevMotivoOutro("");
      await fetchData();
    } catch { /* TODO: toast */ }
    finally { setDevLoading(false); }
  }

  const precisaDeslocFlag = devItens.length > 0 ? devolucaoPrecisaDeslocamento(devItens) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--vm-accent-tint)", color: "#00875F" }}
          >
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: "var(--vm-text)" }}>Central de Vistorias</h1>
            <p className="text-[13px]" style={{ color: "var(--vm-muted)" }}>
              Cancele, reatribua ou devolva vistorias com registro de motivo.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="flex h-9 w-9 items-center justify-center rounded-xl transition hover:brightness-95"
          style={{ border: "1px solid var(--vm-border)", background: "var(--vm-card)" }}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            style={{ color: "var(--vm-muted)" }}
          />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: "var(--vm-faint)" }}
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar equipamento, município, técnico…"
            className="w-full rounded-xl py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          />
        </div>
        <div className="relative">
          <select
            value={filtroSit}
            onChange={(e) => setFiltroSit(e.target.value === "" ? "" : Number(e.target.value))}
            className="appearance-none rounded-xl py-2 pl-3 pr-8 text-[13px] outline-none focus:border-[#00B388]"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          >
            <option value="">Todas situações</option>
            {Object.entries(SITUACAO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: "var(--vm-faint)" }}
          />
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
          Nenhuma vistoria encontrada.
        </div>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {filtradas.map((v) => {
            const cor = SITUACAO_COLOR[v.situacao_id] ?? "#9AA7B4";
            const semAcoes = !v.tecnico_nome && v.situacao_id <= 1;
            return (
              <div
                key={v.id}
                className="flex flex-col overflow-hidden rounded-2xl transition hover:-translate-y-0.5"
                style={{
                  background: "var(--vm-card)",
                  border: "1px solid var(--vm-border)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 6px 18px rgba(0,0,0,0.06)",
                }}
              >
                {/* faixa de situação */}
                <div style={{ height: 3, background: cor, flexShrink: 0 }} />

                <div className="flex flex-1 flex-col p-4">
                  {/* equipamento + badge */}
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
                    <SituacaoBadge id={v.situacao_id} />
                  </div>

                  {/* técnico + data */}
                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 shrink-0" />
                      {v.tecnico_nome ?? <span style={{ color: "var(--vm-faint)" }}>sem técnico</span>}
                    </span>
                    {v.data_vistoria && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {new Date(v.data_vistoria).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>

                  {/* ações */}
                  <div className="mt-auto flex items-center gap-1.5 pt-3" style={{ borderTop: "1px solid var(--vm-border-soft)" }}>
                    {v.tecnico_nome && (
                      <button
                        type="button"
                        onClick={() => { setReatrib(v); setNovoTecnico(""); setMotivo(""); }}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:brightness-95"
                        style={{ border: `1px solid ${tint("#3B82F6", 0.35)}`, background: tint("#3B82F6", 0.12), color: "#3B82F6" }}
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Reatribuir
                      </button>
                    )}
                    {(v.situacao_id === 3 || v.situacao_id === 6) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDevolvendo(v);
                          setDevItens([]);
                          setDevMotivos([]);
                          setDevMotivoOutro("");
                        }}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:brightness-95"
                        style={{ border: `1px solid ${tint("#D97706", 0.4)}`, background: tint("#D97706", 0.14), color: "#D97706" }}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Devolver
                      </button>
                    )}
                    {v.situacao_id > 1 && (
                      <button
                        type="button"
                        onClick={() => { setCancelando(v); setCancelConfirm(""); }}
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
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: tint("#DC2626", 0.15), color: "#DC2626" }}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>Cancelar vistoria</h2>
              <p className="mt-0.5 text-[12px]" style={{ color: "var(--vm-muted)" }}>
                Esta ação é irreversível. A situação volta para <strong>A Vistoriar</strong>, o técnico é desvinculado e todos os arquivos (fotos, vídeos, PDF) são deletados.
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
            className="mb-4 w-full rounded-xl px-3 py-2 text-[13px] outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCancelando(null)}
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
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: tint("#3B82F6", 0.15), color: "#3B82F6" }}
              >
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>Reatribuir vistoria</h2>
                <p className="text-[11px]" style={{ color: "var(--vm-muted)" }}>{reatrib.equipamento}</p>
              </div>
            </div>
            <button type="button" onClick={() => setReatrib(null)} style={{ color: "var(--vm-faint)" }}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {reatrib.tecnico_nome && (
            <div
              className="mb-3 rounded-xl px-3 py-2 text-[12px]"
              style={{ background: tint("#D97706", 0.13), color: "#D97706" }}
            >
              Técnico atual: <strong>{reatrib.tecnico_nome}</strong>
            </div>
          )}

          <label className="mb-1 block text-[12px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Novo técnico</label>
          <div className="relative mb-3">
            <select
              value={novoTecnico}
              onChange={(e) => setNovoTecnico(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full appearance-none rounded-xl py-2 pl-3 pr-8 text-[13px] outline-none focus:border-blue-400"
              style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
            >
              <option value="">Selecione um técnico…</option>
              {tecnicos.map((t) => (
                <option key={t.users_id} value={t.users_id}>
                  {t.nome} {t.status_operacional !== "offline" ? "●" : "○"}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: "var(--vm-faint)" }}
            />
          </div>

          <label className="mb-1 block text-[12px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Motivo da reatribuição *</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: Técnico anterior em licença médica…"
            rows={3}
            className="mb-4 w-full resize-none rounded-xl px-3 py-2 text-[12px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setReatrib(null)}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition hover:brightness-95"
              style={{ border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!novoTecnico || !motivo.trim() || reatribLoading}
              onClick={handleReatribuir}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-[13px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {reatribLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
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
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: tint("#D97706", 0.15), color: "#D97706" }}
              >
                <Undo2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>Devolver para correção</h2>
                <p className="text-[11px]" style={{ color: "var(--vm-muted)" }}>{devolvendo.equipamento}</p>
              </div>
            </div>
            <button type="button" onClick={() => setDevolvendo(null)} style={{ color: "var(--vm-faint)" }}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {devolvendo.tecnico_nome && (
            <p className="mb-3 text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
              Vai voltar pra fila de <strong style={{ color: "var(--vm-text-soft)" }}>{devolvendo.tecnico_nome}</strong> corrigir.
            </p>
          )}

          <p className="mb-2 text-[12px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>O que está errado? *</p>

          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
            Fotos e vídeo
          </div>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {DEVOLUCAO_ITENS.filter((i) => i.tipo === "foto").map((i) => (
              <CheckboxRow
                key={i.key}
                label={i.label}
                checked={devItens.includes(i.key)}
                onToggle={() => toggleDevItem(i.key)}
                accent="#D97706"
              />
            ))}
          </div>

          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
            Campos do formulário
          </div>
          <div className="mb-4 grid grid-cols-2 gap-1.5">
            {DEVOLUCAO_ITENS.filter((i) => i.tipo === "campo").map((i) => (
              <CheckboxRow
                key={i.key}
                label={i.label}
                checked={devItens.includes(i.key)}
                onToggle={() => toggleDevItem(i.key)}
                accent="#D97706"
              />
            ))}
          </div>

          <p className="mb-2 text-[12px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>
            Motivo * <span className="font-normal" style={{ color: "var(--vm-faint)" }}>(pode marcar mais de um)</span>
          </p>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {DEVOLUCAO_MOTIVOS.map((m) => (
              <CheckboxRow
                key={m}
                label={m}
                checked={devMotivos.includes(m)}
                onToggle={() => toggleDevMotivo(m)}
                accent="#D97706"
              />
            ))}
          </div>

          {devMotivos.includes("Outro") && (
            <textarea
              value={devMotivoOutro}
              onChange={(e) => setDevMotivoOutro(e.target.value)}
              placeholder="Descreva o motivo…"
              rows={2}
              className="mb-4 w-full resize-none rounded-xl px-3 py-2 text-[12px] outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
              style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
            />
          )}

          {precisaDeslocFlag != null && (
            precisaDeslocFlag ? (
              <p
                className="mb-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11.5px] font-medium"
                style={{ border: `1px solid ${tint("#D97706", 0.4)}`, background: tint("#D97706", 0.13), color: "#D97706" }}
              >
                <span>📍</span>
                <span>Vai exigir deslocamento até o equipamento (tem item de foto/vídeo apontado).</span>
              </p>
            ) : (
              <p
                className="mb-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11.5px] font-medium"
                style={{ border: `1px solid ${tint("#059669", 0.4)}`, background: tint("#059669", 0.13), color: "#059669" }}
              >
                <span>✏️</span>
                <span>Correção só de formulário — não exige deslocamento por padrão.</span>
              </p>
            )
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDevolvendo(null)}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition hover:brightness-95"
              style={{ border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={
                devItens.length === 0 ||
                devMotivos.length === 0 ||
                (devMotivos.includes("Outro") && !devMotivoOutro.trim()) ||
                devLoading
              }
              onClick={handleDevolver}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              style={{ background: "#D97706" }}
            >
              {devLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Confirmar devolução
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
