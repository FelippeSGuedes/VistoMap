"use client";

/**
 * DevolucaoDetalheModal — mostra SÓ o que foi apontado numa devolução: as
 * fotos questionadas (com preview real) e/ou os campos do formulário
 * questionados (com o valor atual). Nada do resto da vistoria aparece aqui —
 * é justamente pra focar no que o analista precisa reavaliar.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban, Camera, CheckCircle2, ChevronDown, Clock, FileText, Loader2, Pencil, Save, X,
} from "lucide-react";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth";
import { DEVOLUCAO_ITENS, DEVOLUCAO_ITEM_LABEL, DEVOLUCAO_MOTIVOS } from "@/lib/glpi/devolucaoItens";

interface Devolucao {
  id: number;
  vistoriaId: number;
  equipamento: string;
  tecnicoId: number | null;
  tecnicoNome: string | null;
  motivos: string[];
  motivoOutro: string | null;
  itens: string[];
  status: "PENDENTE" | "RESOLVIDA" | "CANCELADA";
  criadoEm: string;
}

interface Tecnico {
  users_id: number;
  nome: string;
}

interface VistoriaFields {
  [key: string]: string | undefined;
}

interface VistoriaDetalhe {
  cidade?: string;
  fields?: VistoriaFields;
}

interface FileItem {
  name: string;
  url: string;
  kind: "image" | "video" | "pdf" | "other";
}

/** item de devolução → nome do arquivo salvo (mesma convenção do finalizar/corrigir-devolucao). */
const PHOTO_FILENAME: Record<string, string> = {
  imagem1: "imagem1.png",
  imagem2: "imagem2.png",
  imagem3: "imagem3.png",
  video360: "video360.mp4",
  imagem4: "imagem4.png",
  imagem5: "imagem5.png",
};

function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Resolve o valor ATUAL de um campo apontado — a maioria bate 1:1 com VistoriaFields,
 * só município (vem de `cidade`, não de `fields`) e observação (`observaofield`) fogem da regra. */
function valorAtual(itemKey: string, v: VistoriaDetalhe): string {
  if (itemKey === "municipiofield") return v.cidade || "—";
  if (itemKey === "observacao") return v.fields?.observaofield || "—";
  return v.fields?.[itemKey] || "—";
}

const ACCENT = "#D97706";

export function DevolucaoDetalheModal({
  devolucao,
  tecnicos = [],
  onClose,
  onChanged,
}: {
  devolucao: Devolucao | null;
  tecnicos?: Tecnico[];
  onClose: () => void;
  /** Chamado após editar/cancelar com sucesso — parent recarrega a lista. */
  onChanged?: () => void;
}) {
  const { session } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [vistoria, setVistoria] = useState<VistoriaDetalhe | null>(null);
  const [fotos, setFotos] = useState<FileItem[]>([]);

  const [editMode, setEditMode] = useState(false);
  const [editItens, setEditItens] = useState<string[]>([]);
  const [editMotivos, setEditMotivos] = useState<string[]>([]);
  const [editMotivoOutro, setEditMotivoOutro] = useState("");
  const [editTecnicoId, setEditTecnicoId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [confirmCancelar, setConfirmCancelar] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!devolucao || !session?.token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${session.token}` };
    Promise.all([
      api.get<{ vistoria: VistoriaDetalhe }>(`/painel/vistoria/${devolucao.vistoriaId}`, { headers }),
      api.get<{ items: FileItem[] }>(`/painel/vistoria/${devolucao.vistoriaId}/files`, { headers }).catch(() => ({ data: { items: [] } })),
    ])
      .then(([v, f]) => {
        setVistoria(v.data.vistoria);
        setFotos(f.data.items ?? []);
      })
      .catch(() => setVistoria(null))
      .finally(() => setLoading(false));
  }, [devolucao, session?.token]);

  useEffect(() => {
    setEditMode(false);
    setConfirmCancelar(false);
    setActionError(null);
    if (devolucao) {
      setEditItens(devolucao.itens);
      setEditMotivos(devolucao.motivos);
      setEditMotivoOutro(devolucao.motivoOutro ?? "");
      setEditTecnicoId(devolucao.tecnicoId ?? "");
    }
  }, [devolucao]);

  if (!devolucao) return null;

  function toggleEditItem(key: string) {
    setEditItens((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }
  function toggleEditMotivo(m: string) {
    setEditMotivos((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  async function handleSalvarEdicao() {
    if (!devolucao || !session?.token) return;
    if (editItens.length === 0 || editMotivos.length === 0) return;
    if (editMotivos.includes("Outro") && !editMotivoOutro.trim()) return;
    setSaving(true);
    setActionError(null);
    try {
      await api.post(
        `/painel/devolucoes/${devolucao.id}/editar`,
        {
          itens: editItens,
          motivos: editMotivos,
          motivoOutro: editMotivoOutro.trim() || undefined,
          tecnicoId: editTecnicoId || undefined,
        },
        { headers: { Authorization: `Bearer ${session.token}` } }
      );
      onChanged?.();
      onClose();
    } catch (err) {
      setActionError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Falha ao salvar edição"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelarDevolucao() {
    if (!devolucao || !session?.token) return;
    if (!confirmCancelar) { setConfirmCancelar(true); return; }
    setSaving(true);
    setActionError(null);
    try {
      await api.post(
        `/painel/devolucoes/${devolucao.id}/cancelar`,
        {},
        { headers: { Authorization: `Bearer ${session.token}` } }
      );
      onChanged?.();
      onClose();
    } catch (err) {
      setActionError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Falha ao cancelar devolução"
      );
    } finally {
      setSaving(false);
    }
  }

  const tipoDe = (key: string) => DEVOLUCAO_ITENS.find((i) => i.key === key)?.tipo;
  const fotosApontadas = devolucao.itens.filter((k) => tipoDe(k) === "foto");
  const camposApontados = devolucao.itens.filter((k) => tipoDe(k) === "campo");
  const motivosTexto = devolucao.motivos
    .map((m) => (m === "Outro" ? devolucao.motivoOutro || "Outro" : m))
    .join(" · ");

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl"
          style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 pb-3 pt-4" style={{ background: "var(--vm-card)", borderBottom: "1px solid var(--vm-border-soft)" }}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>{devolucao.equipamento}</p>
              <p className="mt-0.5 truncate text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
                {devolucao.tecnicoNome ?? "—"} ·{" "}
                <span
                  className="font-semibold"
                  style={{
                    color:
                      devolucao.status === "PENDENTE" ? "#DC2626" :
                      devolucao.status === "CANCELADA" ? "#6B7280" : "#059669",
                  }}
                >
                  {devolucao.status === "PENDENTE" ? "Pendente" : devolucao.status === "CANCELADA" ? "Cancelada" : "Corrigida"}
                </span>
              </p>
            </div>
            {devolucao.status === "PENDENTE" && !editMode && (
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:brightness-95"
                  style={{ border: `1px solid ${tint("#3B82F6", 0.35)}`, background: tint("#3B82F6", 0.12), color: "#3B82F6" }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  type="button"
                  onClick={handleCancelarDevolucao}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:brightness-95 disabled:opacity-60"
                  style={{ border: `1px solid ${tint("#DC2626", 0.35)}`, background: tint("#DC2626", 0.12), color: "#DC2626" }}
                >
                  <Ban className="h-3.5 w-3.5" /> {confirmCancelar ? "Confirmar?" : "Cancelar"}
                </button>
              </div>
            )}
            <button type="button" onClick={onClose} style={{ color: "var(--vm-faint)" }}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-5 py-4">
            {actionError && (
              <div className="mb-4 rounded-xl px-3 py-2 text-[11.5px] font-medium" style={{ background: tint("#DC2626", 0.1), color: "#DC2626", border: "1px solid rgba(220,38,38,0.25)" }}>
                {actionError}
              </div>
            )}

            {editMode ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--vm-muted)" }}>Itens apontados</p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {DEVOLUCAO_ITENS.map((i) => (
                      <label
                        key={i.key}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]"
                        style={{
                          background: editItens.includes(i.key) ? tint(ACCENT, 0.12) : "var(--vm-tile)",
                          color: editItens.includes(i.key) ? "var(--vm-text)" : "var(--vm-muted)",
                        }}
                      >
                        <input type="checkbox" checked={editItens.includes(i.key)} onChange={() => toggleEditItem(i.key)} className="h-3.5 w-3.5" style={{ accentColor: ACCENT }} />
                        {i.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--vm-muted)" }}>Motivos</p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {DEVOLUCAO_MOTIVOS.map((m) => (
                      <label
                        key={m}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]"
                        style={{
                          background: editMotivos.includes(m) ? tint("#DC2626", 0.1) : "var(--vm-tile)",
                          color: editMotivos.includes(m) ? "var(--vm-text)" : "var(--vm-muted)",
                        }}
                      >
                        <input type="checkbox" checked={editMotivos.includes(m)} onChange={() => toggleEditMotivo(m)} className="h-3.5 w-3.5" style={{ accentColor: "#DC2626" }} />
                        {m}
                      </label>
                    ))}
                  </div>
                  {editMotivos.includes("Outro") && (
                    <textarea
                      value={editMotivoOutro}
                      onChange={(e) => setEditMotivoOutro(e.target.value)}
                      placeholder="Descreva o motivo…"
                      rows={2}
                      className="mt-2 w-full resize-none rounded-lg px-3 py-2 text-[12px] outline-none"
                      style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)", color: "var(--vm-text)" }}
                    />
                  )}
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--vm-muted)" }}>Técnico responsável</p>
                  <div className="relative">
                    <select
                      value={editTecnicoId}
                      onChange={(e) => setEditTecnicoId(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full appearance-none rounded-lg px-3 py-2 text-[12px] outline-none"
                      style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)", color: "var(--vm-text)" }}
                    >
                      <option value="">— nenhum —</option>
                      {tecnicos.map((t) => (
                        <option key={t.users_id} value={t.users_id}>{t.nome}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--vm-faint)" }} />
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="flex-1 rounded-xl py-2.5 text-[12.5px] font-semibold transition"
                    style={{ border: "1px solid var(--vm-border)", color: "var(--vm-muted)" }}
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    disabled={saving || editItens.length === 0 || editMotivos.length === 0 || (editMotivos.includes("Outro") && !editMotivoOutro.trim())}
                    onClick={handleSalvarEdicao}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-bold text-white transition disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#2563EB,#1D4ED8)" }}
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Salvar alterações
                  </button>
                </div>
              </div>
            ) : (
            <>
            <div className="mb-4 rounded-xl p-3" style={{ background: tint(ACCENT, 0.1), border: "1px solid rgba(217,119,6,0.2)" }}>
              <p className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>Motivo</p>
              <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--vm-text-soft)" }}>{motivosTexto}</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-[13px]" style={{ color: "var(--vm-faint)" }}>
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : (
              <>
                {fotosApontadas.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-2 flex items-center gap-1.5">
                      <Camera className="h-3.5 w-3.5" style={{ color: "#8B5CF6" }} />
                      <p className="text-[11.5px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Fotos/vídeo questionados</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {fotosApontadas.map((k) => {
                        const filename = PHOTO_FILENAME[k];
                        const file = fotos.find((f) => f.name === filename);
                        return (
                          <div key={k} className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--vm-border)" }}>
                            {file && file.kind === "image" ? (
                              <a href={file.url} target="_blank" rel="noreferrer">
                                <img src={file.url} alt={DEVOLUCAO_ITEM_LABEL[k]} className="h-20 w-full object-cover" loading="lazy" />
                              </a>
                            ) : (
                              <div className="flex h-20 w-full items-center justify-center" style={{ background: "var(--vm-tile)" }}>
                                <Camera className="h-5 w-5" style={{ color: "var(--vm-faint)" }} />
                              </div>
                            )}
                            <p className="truncate px-1.5 py-1 text-[9.5px] font-medium" style={{ color: "var(--vm-muted)", background: "var(--vm-tile)" }}>
                              {DEVOLUCAO_ITEM_LABEL[k] ?? k}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {camposApontados.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" style={{ color: "#3B82F6" }} />
                      <p className="text-[11.5px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Campos do formulário questionados</p>
                    </div>
                    <div className="space-y-1.5">
                      {camposApontados.map((k) => (
                        <div key={k} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: "var(--vm-tile)" }}>
                          <span className="text-[11.5px] font-medium" style={{ color: "var(--vm-muted)" }}>{DEVOLUCAO_ITEM_LABEL[k] ?? k}</span>
                          <span className="truncate text-[12px] font-semibold" style={{ color: "var(--vm-text)", maxWidth: "55%" }}>
                            {vistoria ? valorAtual(k, vistoria) : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-[10.5px]" style={{ color: "var(--vm-faint)" }}>
                      {devolucao.status === "PENDENTE" ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      {devolucao.status === "PENDENTE" ? "Valor atual (ainda não corrigido)" : "Valor já corrigido pelo técnico"}
                    </p>
                  </div>
                )}
              </>
            )}
            </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
