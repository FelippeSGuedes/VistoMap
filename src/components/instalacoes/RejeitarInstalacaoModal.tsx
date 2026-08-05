"use client";

/**
 * Rejeição de instalação — mesma ideia do RecusarVistoriaFlow (motivo +
 * justificativa + foto, mesma tabela de recusas no backend), só que num
 * modal mais simples (sem o Q&A de múltiplas etapas): a instalação já tem
 * o contexto todo na tela, o instalador só precisa dizer o motivo e provar
 * com foto. 1 foto obrigatória, até 2 opcionais.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";

const MOTIVOS = [
  { value: "poste_inacessivel", label: "Poste inacessível" },
  { value: "material_incompativel", label: "Material incompatível com a instalação" },
  { value: "risco_seguranca", label: "Risco de segurança" },
  { value: "dados_vistoria_incorretos", label: "Dados da vistoria incorretos/desatualizados" },
  { value: "outro", label: "Outro motivo" },
] as const;

interface RejeitarInstalacaoModalProps {
  open: boolean;
  equipamento: string;
  onClose: () => void;
  onEnviar: (input: { motivo: string; justificativa: string; foto1: Blob; foto2?: Blob; foto3?: Blob }) => Promise<void>;
}

interface FotoSlot {
  blob: Blob | null;
  preview: string | null;
}

const EMPTY_SLOT: FotoSlot = { blob: null, preview: null };

export function RejeitarInstalacaoModal({ open, equipamento, onClose, onEnviar }: RejeitarInstalacaoModalProps) {
  const [motivo, setMotivo] = useState<string>("");
  const [justificativa, setJustificativa] = useState("");
  const [fotos, setFotos] = useState<[FotoSlot, FotoSlot, FotoSlot]>([EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function resetAndClose() {
    setMotivo("");
    setJustificativa("");
    fotos.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFotos([EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT]);
    setErro(null);
    onClose();
  }

  function handleFoto(index: 0 | 1 | 2, file: File | null) {
    setFotos((prev) => {
      const next = [...prev] as [FotoSlot, FotoSlot, FotoSlot];
      if (next[index].preview) URL.revokeObjectURL(next[index].preview!);
      next[index] = file ? { blob: file, preview: URL.createObjectURL(file) } : EMPTY_SLOT;
      return next;
    });
  }

  async function handleEnviar() {
    setErro(null);
    if (!motivo) return setErro("Selecione o motivo");
    if (!justificativa.trim()) return setErro("Descreva o que aconteceu");
    if (!fotos[0].blob) return setErro("A 1ª foto é obrigatória");

    setEnviando(true);
    try {
      await onEnviar({
        motivo: MOTIVOS.find((m) => m.value === motivo)?.label ?? motivo,
        justificativa: justificativa.trim(),
        foto1: fotos[0].blob,
        foto2: fotos[1].blob ?? undefined,
        foto3: fotos[2].blob ?? undefined,
      });
      resetAndClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao enviar rejeição");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[250] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={resetAndClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 0.7, 0.2, 1] }}
            className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white sm:max-w-[440px] sm:rounded-3xl"
          >
            <header className="flex items-center justify-between border-b border-brand-steel/60 px-5 py-4">
              <div>
                <h2 className="text-[15px] font-bold text-ink">Rejeitar instalação</h2>
                <p className="text-[12px] text-ink-muted">{equipamento}</p>
              </div>
              <button
                onClick={resetAndClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-brand-steel/40"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Motivo
                </label>
                <div className="flex flex-col gap-1.5">
                  {MOTIVOS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMotivo(m.value)}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium transition",
                        motivo === m.value
                          ? "border-status-rejected bg-status-rejected/8 text-status-rejected"
                          : "border-brand-steel/60 text-ink hover:border-brand-steel"
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  O que aconteceu?
                </label>
                <textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  rows={3}
                  placeholder="Descreva o motivo da rejeição"
                  className="w-full resize-none rounded-xl border border-brand-steel/60 px-3 py-2.5 text-[13px] text-ink outline-none focus:border-brand-emerald"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Fotos (1ª obrigatória, até 3)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([0, 1, 2] as const).map((idx) => (
                    <label
                      key={idx}
                      className={cn(
                        "relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed text-[10px] font-semibold",
                        fotos[idx].preview
                          ? "border-brand-emerald/60"
                          : "border-brand-steel/60 text-ink-muted hover:border-brand-emerald/50"
                      )}
                    >
                      {fotos[idx].preview ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fotos[idx].preview!} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              handleFoto(idx, null);
                            }}
                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <Camera className="h-4 w-4" />
                          {idx === 0 ? "Obrigatória" : "Opcional"}
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleFoto(idx, e.target.files?.[0] ?? null)}
                      />
                    </label>
                  ))}
                </div>
              </div>

              {erro && (
                <p className="rounded-xl bg-status-rejected/10 px-3 py-2 text-[12.5px] font-medium text-status-rejected">
                  {erro}
                </p>
              )}
            </div>

            <footer className="border-t border-brand-steel/60 px-5 py-4">
              <Button
                variant="danger"
                fullWidth
                size="lg"
                loading={enviando}
                leftIcon={<Send className="h-4 w-4" />}
                onClick={handleEnviar}
              >
                Enviar rejeição
              </Button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
