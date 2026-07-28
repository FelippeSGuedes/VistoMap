"use client";

/**
 * DevolucaoDetalheModal — mostra SÓ o que foi apontado numa devolução: as
 * fotos questionadas (com preview real) e/ou os campos do formulário
 * questionados (com o valor atual). Nada do resto da vistoria aparece aqui —
 * é justamente pra focar no que o analista precisa reavaliar.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CheckCircle2, Clock, FileText, Loader2, X } from "lucide-react";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth";
import { DEVOLUCAO_ITENS, DEVOLUCAO_ITEM_LABEL } from "@/lib/glpi/devolucaoItens";

interface Devolucao {
  id: number;
  vistoriaId: number;
  equipamento: string;
  tecnicoNome: string | null;
  motivos: string[];
  motivoOutro: string | null;
  itens: string[];
  status: "PENDENTE" | "RESOLVIDA";
  criadoEm: string;
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
  onClose,
}: {
  devolucao: Devolucao | null;
  onClose: () => void;
}) {
  const { session } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [vistoria, setVistoria] = useState<VistoriaDetalhe | null>(null);
  const [fotos, setFotos] = useState<FileItem[]>([]);

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

  if (!devolucao) return null;

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
                  style={{ color: devolucao.status === "PENDENTE" ? "#DC2626" : "#059669" }}
                >
                  {devolucao.status === "PENDENTE" ? "Pendente" : "Corrigida"}
                </span>
              </p>
            </div>
            <button type="button" onClick={onClose} style={{ color: "var(--vm-faint)" }}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-5 py-4">
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
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
