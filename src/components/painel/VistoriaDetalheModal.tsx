"use client";

/**
 * VistoriaDetalheModal — visão completa e somente-leitura de um equipamento
 * (todos os campos + fotos), acionada a partir do pino no mapa do painel.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Image as ImageIcon, Loader2, MapPin, X } from "lucide-react";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth";

interface VistoriaFields {
  pspostefield?: string;
  alturadopostemfield?: string;
  instalartpfield?: string;
  danfield?: string;
  rsrpifield?: string;
  rsrpllfield?: string;
  tipoifield?: string;
  tipollfield?: string;
  tensovfield?: string;
  endereofield?: string;
  observaofield?: string;
  aterramentofield?: string;
  motivofield?: string;
  equipamentofield?: string;
  tipodeantena?: string;
  ganhodbi?: string;
  mododeoperacao?: string;
  operadorafourg?: string;
  tipodematerial?: string;
  tensao?: string;
  alimentacaodoequipamento?: string;
  localdeinstalacao?: string;
}

interface VistoriaDetalhe {
  id: string;
  glpiId: string;
  equipamento: string;
  cidade: string;
  estado?: string | null;
  endereco?: string | null;
  status: string;
  latitude: number;
  longitude: number;
  dataVistoria?: string | null;
  fields?: VistoriaFields;
}

interface FileItem {
  name: string;
  url: string;
  kind: "image" | "video" | "pdf" | "other";
}

const FIELD_LABELS: Array<{ key: keyof VistoriaFields; label: string }> = [
  { key: "pspostefield", label: "PS do poste" },
  { key: "tipodematerial", label: "Material / Tipo" },
  { key: "alturadopostemfield", label: "Altura do poste" },
  { key: "aterramentofield", label: "Aterramento" },
  { key: "instalartpfield", label: "Instalação de TP" },
  { key: "danfield", label: "Resistência (daN)" },
  { key: "equipamentofield", label: "Modo de operação" },
  { key: "tipodeantena", label: "Tipo de antena" },
  { key: "ganhodbi", label: "Ganho (dBi)" },
  { key: "tensovfield", label: "Tensão" },
  { key: "rsrpifield", label: "RSRP Claro" },
  { key: "tipoifield", label: "Tipo de rede Claro" },
  { key: "rsrpllfield", label: "RSRP Vivo" },
  { key: "tipollfield", label: "Tipo de rede Vivo" },
  { key: "motivofield", label: "Motivo" },
];

function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function VistoriaDetalheModal({
  open,
  vistoriaId,
  equipamentoLabel,
  onClose,
}: {
  open: boolean;
  vistoriaId: number | string | null;
  equipamentoLabel?: string;
  onClose: () => void;
}) {
  const { session } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [vistoria, setVistoria] = useState<VistoriaDetalhe | null>(null);
  const [fotos, setFotos] = useState<FileItem[]>([]);

  useEffect(() => {
    if (!open || vistoriaId == null || !session?.token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${session.token}` };
    Promise.all([
      api.get<{ vistoria: VistoriaDetalhe }>(`/painel/vistoria/${vistoriaId}`, { headers }),
      api.get<{ items: FileItem[] }>(`/painel/vistoria/${vistoriaId}/files`, { headers }).catch(() => ({ data: { items: [] } })),
    ])
      .then(([v, f]) => {
        setVistoria(v.data.vistoria);
        setFotos((f.data.items ?? []).filter((it) => it.kind === "image"));
      })
      .catch(() => { setVistoria(null); })
      .finally(() => setLoading(false));
  }, [open, vistoriaId, session?.token]);

  const preenchidos = vistoria?.fields
    ? FIELD_LABELS.filter(({ key }) => (vistoria.fields?.[key] ?? "").toString().trim().length > 0)
    : [];

  return (
    <AnimatePresence>
      {open && (
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
                <p className="truncate text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>
                  {vistoria?.equipamento ?? equipamentoLabel ?? "Equipamento"}
                </p>
                {vistoria && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
                    <MapPin className="h-3 w-3 shrink-0" />
                    {vistoria.cidade || "—"}{vistoria.endereco ? ` · ${vistoria.endereco}` : ""}
                  </p>
                )}
              </div>
              <button type="button" onClick={onClose} style={{ color: "var(--vm-faint)" }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-4">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-14 text-[13px]" style={{ color: "var(--vm-faint)" }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
              ) : !vistoria ? (
                <p className="py-10 text-center text-[13px]" style={{ color: "var(--vm-faint)" }}>Não foi possível carregar os detalhes.</p>
              ) : (
                <>
                  {preenchidos.length > 0 && (
                    <div className="mb-4 grid grid-cols-2 gap-2.5">
                      {preenchidos.map(({ key, label }) => (
                        <div key={key} className="rounded-xl p-2.5" style={{ background: "var(--vm-tile)" }}>
                          <p className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>{label}</p>
                          <p className="mt-0.5 truncate text-[12.5px] font-medium" style={{ color: "var(--vm-text-soft)" }}>
                            {vistoria.fields?.[key]}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {vistoria.fields?.observaofield && (
                    <div className="mb-4 rounded-xl p-3" style={{ background: tint("#3B82F6", 0.08), border: "1px solid rgba(59,130,246,0.16)" }}>
                      <p className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: "#3B82F6" }}>Observações</p>
                      <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--vm-text-soft)" }}>{vistoria.fields.observaofield}</p>
                    </div>
                  )}

                  <div className="mb-1 flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" style={{ color: "var(--vm-muted)" }} />
                    <p className="text-[11.5px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>
                      Fotos {fotos.length > 0 ? `(${fotos.length})` : ""}
                    </p>
                  </div>
                  {fotos.length === 0 ? (
                    <p className="py-4 text-center text-[12px]" style={{ color: "var(--vm-faint)" }}>Nenhuma foto encontrada.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {fotos.map((f) => (
                        <a key={f.name} href={f.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg" style={{ border: "1px solid var(--vm-border)" }}>
                          <img src={f.url} alt={f.name} className="h-20 w-full object-cover" loading="lazy" />
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
