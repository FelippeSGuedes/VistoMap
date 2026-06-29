"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, RefreshCw, Search,
  Trash2, UserCheck, X, ChevronDown,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";

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
  4: "Ag. Revisita", 5: "Em Revisita", 6: "Revisitado",
};
const SITUACAO_COLOR: Record<number, string> = {
  0: "#9CA3AF", 1: "#F59E0B", 2: "#3B82F6", 3: "#00B388",
  4: "#F97316", 5: "#0EA5E9", 6: "#10B981",
};

function SituacaoBadge({ id }: { id: number }) {
  const label = SITUACAO_LABEL[id] ?? "?";
  const color = SITUACAO_COLOR[id] ?? "#9CA3AF";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: color + "22", color, border: `1px solid ${color}44` }}
    >
      {label}
    </span>
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900">Central de Vistorias</h1>
          <p className="text-[13px] text-gray-500">Cancele ou reatribua vistorias com registro de motivo.</p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-white transition hover:bg-gray-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar equipamento, município, técnico…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
          />
        </div>
        <div className="relative">
          <select
            value={filtroSit}
            onChange={(e) => setFiltroSit(e.target.value === "" ? "" : Number(e.target.value))}
            className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-3 pr-8 text-[13px] outline-none focus:border-[#00B388]"
          >
            <option value="">Todas situações</option>
            {Object.entries(SITUACAO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-[13px]">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-gray-400">Nenhuma vistoria encontrada.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 text-left">Equipamento</th>
                <th className="px-4 py-3 text-left">Município</th>
                <th className="px-4 py-3 text-left">Situação</th>
                <th className="px-4 py-3 text-left">Técnico</th>
                <th className="px-4 py-3 text-left">Data vistoria</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((v, i) => (
                <tr
                  key={v.id}
                  className={`border-b border-gray-50 transition hover:bg-gray-50/60 ${i % 2 === 0 ? "" : "bg-gray-50/30"}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{v.equipamento}</td>
                  <td className="px-4 py-3 text-gray-500">{v.municipio ?? "—"}</td>
                  <td className="px-4 py-3"><SituacaoBadge id={v.situacao_id} /></td>
                  <td className="px-4 py-3 text-gray-600">{v.tecnico_nome ?? <span className="text-gray-300">sem técnico</span>}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {v.data_vistoria
                      ? new Date(v.data_vistoria).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setReatrib(v); setNovoTecnico(""); setMotivo(""); }}
                        className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Reatribuir
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCancelando(v); setCancelConfirm(""); }}
                        className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Cancelar */}
      {cancelando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-gray-900">Cancelar vistoria</h2>
                <p className="mt-0.5 text-[12px] text-gray-500">
                  Esta ação é irreversível. A situação volta para <strong>A Vistoriar</strong>, o técnico é desvinculado e todos os arquivos (fotos, vídeos, PDF) são deletados.
                </p>
              </div>
            </div>
            <div className="mb-4 rounded-xl bg-gray-50 px-3 py-2 text-[12px]">
              <span className="font-semibold text-gray-700">{cancelando.equipamento}</span>
              {cancelando.municipio && <span className="ml-2 text-gray-400">{cancelando.municipio}</span>}
            </div>
            <p className="mb-2 text-[12px] text-gray-600">
              Digite <strong>CANCELAR</strong> para confirmar:
            </p>
            <input
              value={cancelConfirm}
              onChange={(e) => setCancelConfirm(e.target.value)}
              placeholder="CANCELAR"
              className="mb-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCancelando(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50"
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
          </div>
        </div>
      )}

      {/* Modal Reatribuir */}
      {reatrib && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                  <UserCheck className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-gray-900">Reatribuir vistoria</h2>
                  <p className="text-[11px] text-gray-500">{reatrib.equipamento}</p>
                </div>
              </div>
              <button type="button" onClick={() => setReatrib(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {reatrib.tecnico_nome && (
              <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
                Técnico atual: <strong>{reatrib.tecnico_nome}</strong>
              </div>
            )}

            <label className="mb-1 block text-[12px] font-semibold text-gray-700">Novo técnico</label>
            <div className="relative mb-3">
              <select
                value={novoTecnico}
                onChange={(e) => setNovoTecnico(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-3 pr-8 text-[13px] outline-none focus:border-blue-400"
              >
                <option value="">Selecione um técnico…</option>
                {tecnicos.map((t) => (
                  <option key={t.users_id} value={t.users_id}>
                    {t.nome} {t.status_operacional !== "offline" ? "●" : "○"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>

            <label className="mb-1 block text-[12px] font-semibold text-gray-700">Motivo da reatribuição *</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Técnico anterior em licença médica…"
              rows={3}
              className="mb-4 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-[12px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReatrib(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50"
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
          </div>
        </div>
      )}
    </div>
  );
}
