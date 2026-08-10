"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban, CheckCircle2, ChevronDown, RefreshCw, Search, UserCheck, X,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { RECUSA_MOTIVO_LABEL, type RecusaMotivo } from "@/lib/glpi/recusaMotivos";

interface Recusa {
  id: number;
  vistoriaId: number;
  equipamento: string;
  tecnicoId: number;
  tecnicoNome: string;
  motivo: string;
  respostas: Record<string, string>;
  justificativa: string;
  fotoUrl: string | null;
  status: "PENDENTE" | "APROVADO" | "REPROVADO" | "REABERTA";
  motivoReprovacao: string | null;
  criadoEm: string;
  resolvidoEm: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface Tecnico {
  users_id: number;
  nome: string;
  status_operacional: string;
}

function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const ACCENT = "#6B7280";
const fieldStyle = { background: "var(--vm-tile)", borderColor: "var(--vm-border)", color: "var(--vm-text)" } as const;

export default function RejeitadasPage() {
  const { session } = useAuthStore();
  const [rejeitadas, setRejeitadas] = useState<Recusa[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroMotivo, setFiltroMotivo] = useState<string>("");
  const [expandido, setExpandido] = useState<number | null>(null);

  // Reatribuir
  const [reatrib, setReatrib] = useState<Recusa | null>(null);
  const [novoTecnico, setNovoTecnico] = useState<number | "">("");
  const [motivoReatrib, setMotivoReatrib] = useState("");
  const [novaLat, setNovaLat] = useState("");
  const [novaLng, setNovaLng] = useState("");
  const [reatribLoading, setReatribLoading] = useState(false);

  const headers = { Authorization: `Bearer ${session?.token}` };

  const fetchData = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const [rRes, tRes] = await Promise.all([
        api.get<{ rejeitadas: Recusa[] }>("/painel/rejeitadas", { headers }),
        api.get<{ tecnicos: Tecnico[] }>("/painel/mapa", { headers }),
      ]);
      setRejeitadas(rRes.data.rejeitadas);
      setTecnicos(tRes.data.tecnicos ?? []);
    } catch { /* ignora */ }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtradas = useMemo(() => rejeitadas.filter((r) => {
    if (filtroMotivo && r.motivo !== filtroMotivo) return false;
    const q = busca.toLowerCase();
    return (
      r.equipamento.toLowerCase().includes(q) ||
      r.tecnicoNome.toLowerCase().includes(q) ||
      r.justificativa.toLowerCase().includes(q)
    );
  }), [rejeitadas, busca, filtroMotivo]);

  async function handleReatribuir() {
    if (!reatrib || !novoTecnico || !motivoReatrib.trim()) return;
    setReatribLoading(true);
    try {
      const body: { tecnicoId: number; motivo: string; latitude?: number; longitude?: number } = {
        tecnicoId: novoTecnico,
        motivo: motivoReatrib.trim(),
      };
      // Só manda coordenada se o engenheiro realmente mexeu em alguma das
      // duas — mas manda o par completo (o backend grava as duas juntas
      // numa UPDATE só; mandar só metade deixaria a outra sem sentido).
      const latNum = novaLat.trim() ? Number(novaLat) : null;
      const lngNum = novaLng.trim() ? Number(novaLng) : null;
      const coordMudou =
        (latNum != null && Number.isFinite(latNum) && latNum !== reatrib.latitude) ||
        (lngNum != null && Number.isFinite(lngNum) && lngNum !== reatrib.longitude);
      if (coordMudou && latNum != null && Number.isFinite(latNum) && lngNum != null && Number.isFinite(lngNum)) {
        body.latitude = latNum;
        body.longitude = lngNum;
      }
      await api.post(`/painel/rejeitadas/${reatrib.id}/reabrir`, body, { headers });
      setReatrib(null);
      setNovoTecnico("");
      setMotivoReatrib("");
      setNovaLat("");
      setNovaLng("");
      await fetchData();
    } catch { /* TODO: toast */ }
    finally { setReatribLoading(false); }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: tint(ACCENT, 0.15), color: ACCENT }}
          >
            <Ban className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: "var(--vm-text)" }}>Vistorias Rejeitadas</h1>
            <p className="text-[13px]" style={{ color: "var(--vm-muted)" }}>
              Recusas aprovadas — vistorias fora de circulação, sem técnico atribuído.
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
            placeholder="Buscar equipamento, técnico, justificativa…"
            className="w-full rounded-xl py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[#6B7280] focus:ring-1 focus:ring-[#6B7280]"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          />
        </div>
        <div className="relative">
          <select
            value={filtroMotivo}
            onChange={(e) => setFiltroMotivo(e.target.value)}
            className="appearance-none rounded-xl py-2 pl-3 pr-8 text-[13px] outline-none focus:border-[#6B7280]"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          >
            <option value="">Todos os motivos</option>
            {Object.entries(RECUSA_MOTIVO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--vm-faint)" }} />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[13px]" style={{ color: "var(--vm-faint)" }}>
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : filtradas.length === 0 ? (
        <div
          className="rounded-2xl py-16 text-center text-[13px]"
          style={{ border: "1px solid var(--vm-border)", background: "var(--vm-card)", color: "var(--vm-faint)" }}
        >
          Nenhuma vistoria rejeitada {rejeitadas.length > 0 ? "com esse filtro" : "por enquanto"}.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtradas.map((r) => {
            const aberto = expandido === r.id;
            return (
              <div
                key={r.id}
                className="overflow-hidden rounded-2xl"
                style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}
              >
                <button
                  type="button"
                  onClick={() => setExpandido(aberto ? null : r.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: tint(ACCENT, 0.14), color: ACCENT }}
                  >
                    <Ban className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold" style={{ color: "var(--vm-text)" }}>{r.equipamento}</p>
                    <p className="mt-0.5 truncate text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
                      {r.tecnicoNome} · {RECUSA_MOTIVO_LABEL[r.motivo as RecusaMotivo] ?? r.motivo} · rejeitada em {fmtDate(r.resolvidoEm)}
                    </p>
                  </div>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 transition"
                    style={{ color: "var(--vm-faint)", transform: aberto ? "rotate(180deg)" : undefined }}
                  />
                </button>

                {aberto && (
                  <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--vm-border-soft)" }}>
                    <p
                      className="mt-3 rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed"
                      style={{ background: "var(--vm-tile)", color: "var(--vm-text-soft)" }}
                    >
                      {r.justificativa}
                    </p>
                    {r.fotoUrl && (
                      <a href={r.fotoUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                        <img
                          src={r.fotoUrl}
                          alt="Evidência da recusa"
                          className="h-40 w-full rounded-xl object-cover"
                          style={{ border: "1px solid var(--vm-border)" }}
                        />
                      </a>
                    )}
                    {session?.role !== "leitura" && (
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setReatrib(r);
                            setNovoTecnico("");
                            setMotivoReatrib("");
                            setNovaLat(r.latitude != null ? String(r.latitude) : "");
                            setNovaLng(r.longitude != null ? String(r.longitude) : "");
                          }}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition hover:brightness-95"
                          style={{ border: `1px solid ${tint("#3B82F6", 0.35)}`, background: tint("#3B82F6", 0.12), color: "#3B82F6" }}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Reatribuir e reabrir
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Reatribuir */}
      {reatrib && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
            style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tint("#3B82F6", 0.15), color: "#3B82F6" }}>
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>Reatribuir e reabrir</h2>
                  <p className="text-[11px]" style={{ color: "var(--vm-muted)" }}>{reatrib.equipamento}</p>
                </div>
              </div>
              <button type="button" onClick={() => setReatrib(null)} style={{ color: "var(--vm-faint)" }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-3 rounded-xl px-3 py-2 text-[12px]" style={{ background: tint(ACCENT, 0.12), color: "var(--vm-text-soft)" }}>
              Volta pra fila (situação "A Vistoriar") com o técnico escolhido e ele recebe uma notificação avisando. Se a rejeição foi por coordenada errada, corrija abaixo antes de reabrir.
            </p>

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
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--vm-faint)" }} />
            </div>

            <label className="mb-1 block text-[12px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Corrigir coordenadas (opcional)</label>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                value={novaLat}
                onChange={(e) => setNovaLat(e.target.value)}
                placeholder="Latitude"
                className="w-full rounded-xl px-3 py-2 text-[13px] outline-none focus:border-blue-400"
                style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
              />
              <input
                type="number"
                step="any"
                value={novaLng}
                onChange={(e) => setNovaLng(e.target.value)}
                placeholder="Longitude"
                className="w-full rounded-xl px-3 py-2 text-[13px] outline-none focus:border-blue-400"
                style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
              />
            </div>

            <label className="mb-1 block text-[12px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Motivo da reabertura *</label>
            <textarea
              value={motivoReatrib}
              onChange={(e) => setMotivoReatrib(e.target.value)}
              placeholder="Ex: Concessionária liberou acesso ao terreno…"
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
                disabled={!novoTecnico || !motivoReatrib.trim() || reatribLoading}
                onClick={handleReatribuir}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-[13px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {reatribLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
