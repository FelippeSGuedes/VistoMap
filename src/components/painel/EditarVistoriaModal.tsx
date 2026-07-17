"use client";

/**
 * Modal de edição de dados de vistoria — Central de Revisitas + Fila.
 *
 * Admin altera campos chave (endereço, motivo, etc) e opcionalmente
 * marca `project_status='PENDENTE'` para o worker regerar o PDF.
 * Diff é registrado em audit.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Pencil, RefreshCcw, Save, X } from "lucide-react";
import { painelService } from "@/services/painel";

export interface EditarVistoriaModalProps {
  open: boolean;
  vistoriaId: number | string | null;
  equipamento?: string;
  municipio?: string;
  initial?: {
    endereofield?: string;
    motivofield?: string;
    alturadaantenafield?: string;
    aterramentofield?: string;
    observaofield?: string;
  };
  onClose: () => void;
  onSaved?: (result: { affected: number; regeneradoPdf: boolean }) => void;
}

const FIELDS: Array<{
  key: keyof NonNullable<EditarVistoriaModalProps["initial"]>;
  label: string;
  multiline?: boolean;
  placeholder?: string;
}> = [
  { key: "endereofield", label: "Endereço", placeholder: "Rua, número, bairro…" },
  { key: "motivofield", label: "Motivo", placeholder: "Motivo operacional…" },
  { key: "alturadaantenafield", label: "Altura da antena", placeholder: "12 m" },
  { key: "aterramentofield", label: "Aterramento", placeholder: "1 (Sim) / 0 (Não)" },
  { key: "observaofield", label: "Observações", placeholder: "Notas adicionais…", multiline: true },
];

export function EditarVistoriaModal({
  open,
  vistoriaId,
  equipamento,
  municipio,
  initial,
  onClose,
  onSaved,
}: EditarVistoriaModalProps) {
  const [campos, setCampos] = useState<NonNullable<EditarVistoriaModalProps["initial"]>>(initial ?? {});
  const [regenerarPdf, setRegenerarPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCampos(initial ?? {});
      setRegenerarPdf(false);
      setError(null);
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleSave = async () => {
    if (vistoriaId == null) return;
    setSaving(true);
    setError(null);
    try {
      const r = await painelService.editarVistoria({
        vistoria_id: vistoriaId,
        campos,
        regenerar_pdf: regenerarPdf,
      });
      onSaved?.({ affected: r.affected, regeneradoPdf: regenerarPdf });
      onClose();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Falha ao salvar alterações.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[220] flex items-center justify-center p-6"
          style={{
            background: "rgba(247,249,251,0.78)",
            backdropFilter: "blur(10px)",
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] overflow-hidden rounded-[24px]"
            style={{
              background: "#fff",
              border: "1px solid rgba(6,59,59,0.08)",
              boxShadow: "0 22px 56px rgba(6,59,59,0.18)",
            }}
          >
            <header
              className="flex items-start justify-between gap-3 border-b px-5 py-4"
              style={{ borderColor: "rgba(6,59,59,0.05)" }}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-2xl text-white"
                  style={{
                    background:
                      "linear-gradient(145deg, #00C99B 0%, #00875F 100%)",
                    boxShadow: "0 4px 12px rgba(0,179,136,0.28)",
                  }}
                >
                  <Pencil className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <div>
                  <p
                    className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: "#00B388" }}
                  >
                    Editar vistoria
                  </p>
                  <h3
                    className="mt-0.5 text-[17px] font-semibold tracking-[-0.3px]"
                    style={{ color: "#063B3B" }}
                  >
                    {equipamento ?? `NE-${vistoriaId}`}
                  </h3>
                  {municipio && (
                    <p className="text-[11.5px]" style={{ color: "#7A8896" }}>
                      {municipio}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-black/5"
                style={{ color: "#7A8896" }}
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="max-h-[60dvh] overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <label
                    key={f.key}
                    className={`flex flex-col gap-1 ${f.multiline ? "col-span-2" : ""}`}
                  >
                    <span
                      className="text-[9.5px] font-bold uppercase tracking-[0.16em]"
                      style={{ color: "#7A8896" }}
                    >
                      {f.label}
                    </span>
                    {f.multiline ? (
                      <textarea
                        value={campos[f.key] ?? ""}
                        onChange={(e) =>
                          setCampos((c) => ({ ...c, [f.key]: e.target.value }))
                        }
                        placeholder={f.placeholder}
                        rows={3}
                        className="rounded-xl px-3 py-2 text-[13px] font-medium outline-none"
                        style={{
                          background: "#F7F9FB",
                          border: "1px solid rgba(6,59,59,0.08)",
                          color: "#063B3B",
                        }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={campos[f.key] ?? ""}
                        onChange={(e) =>
                          setCampos((c) => ({ ...c, [f.key]: e.target.value }))
                        }
                        placeholder={f.placeholder}
                        className="rounded-xl px-3 py-2 text-[13px] font-medium outline-none"
                        style={{
                          background: "#F7F9FB",
                          border: "1px solid rgba(6,59,59,0.08)",
                          color: "#063B3B",
                        }}
                      />
                    )}
                  </label>
                ))}
              </div>

              <label
                className="mt-4 flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition cursor-pointer"
                style={{
                  background: regenerarPdf ? "#ECFDF5" : "#F7F9FB",
                  border: `1px solid ${regenerarPdf ? "rgba(0,179,136,0.32)" : "rgba(6,59,59,0.08)"}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={regenerarPdf}
                  onChange={(e) => setRegenerarPdf(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-emerald-600"
                />
                <span className="flex-1">
                  <span
                    className="block text-[12px] font-semibold"
                    style={{ color: "#063B3B" }}
                  >
                    Regenerar PDF
                  </span>
                  <span
                    className="block text-[10.5px]"
                    style={{ color: "#7A8896" }}
                  >
                    Marca <code className="rounded bg-black/5 px-1">project_status='PENDENTE'</code> e o worker recria o projeto.
                  </span>
                </span>
                {regenerarPdf && <RefreshCcw className="h-4 w-4" style={{ color: "#00875F" }} />}
              </label>

              {error && (
                <div
                  className="mt-3 rounded-xl px-3 py-2 text-[11.5px] font-medium"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.22)",
                    color: "#B91C1C",
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            <footer
              className="flex items-center justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: "rgba(6,59,59,0.05)" }}
            >
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-3 py-2 text-[12.5px] font-semibold transition hover:bg-black/5"
                style={{ color: "#566773" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #00C99B 0%, #00875F 100%)",
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.25) inset, 0 4px 12px rgba(0,179,136,0.28)",
                }}
              >
                <Save className="h-3.5 w-3.5" strokeWidth={2.4} />
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
