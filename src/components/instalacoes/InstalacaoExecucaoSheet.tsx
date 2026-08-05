"use client";

/**
 * Tela de execução da instalação: contexto herdado da vistoria (leitura),
 * "assumir" quando ainda Liberado, checklist + 7 fotos guiadas quando já é
 * minha (Em Instalação), finalizar ou rejeitar. Espelha a experiência do
 * VistoriaExecucaoSheet, mas com regras e campos totalmente novos — nenhum
 * componente da vistoria é reaproveitado aqui além dos primitivos de UI
 * (Button, Card).
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronLeft,
  MapPin,
  Navigation,
  Send,
  ShieldQuestion,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/utils/cn";
import type { Instalacao, InstalacaoChecklistKey } from "@/types";
import { instalacoesService } from "@/services/instalacoes";
import { RejeitarInstalacaoModal } from "./RejeitarInstalacaoModal";
import { NavigationOptionsSheet } from "@/components/vistorias/NavigationOptionsSheet";

const STATE_LIBERADO = 3;
const STATE_EM_INSTALACAO = 4;

interface InstalacaoExecucaoSheetProps {
  instalacao: Instalacao | null;
  meuUserId: number;
  onClose: () => void;
  onAssumida: (atualizada: Instalacao) => void;
  onFinalizada: (id: string) => void;
  onRejeitada: (id: string) => void;
}

const CHECKLIST_ITEMS: Array<{ key: InstalacaoChecklistKey; label: string }> = [
  { key: "cintaInstalada", label: "Cinta corretamente instalada" },
  { key: "equipamentoFixado", label: "Equipamento fixado adequadamente" },
  { key: "cabeamentoOrganizado", label: "Cabeamento organizado" },
  { key: "alimentacaoValidada", label: "Alimentação validada" },
  { key: "equipamentoEnergizado", label: "Equipamento energizado" },
];

const FOTO_LABELS = [
  "Chegada e inspeção do local",
  "Preparação do material",
  "Fixação da cinta",
  "Fixação do Access Point",
  "Teste de tensão",
  "Vista frontal do equipamento",
  "Vista geral da instalação",
];

interface FotoSlot {
  blob: Blob | null;
  preview: string | null;
}

function contextoRow(label: string, value: string | boolean | null | undefined) {
  const display =
    typeof value === "boolean" ? (value ? "Sim" : "Não") : value?.trim() ? value : "—";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-brand-steel/40 py-2 text-[13px] last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className="font-semibold text-ink">{display}</span>
    </div>
  );
}

export function InstalacaoExecucaoSheet({
  instalacao,
  meuUserId,
  onClose,
  onAssumida,
  onFinalizada,
  onRejeitada,
}: InstalacaoExecucaoSheetProps) {
  const [assumindo, setAssumindo] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [rejeitarOpen, setRejeitarOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [checklist, setChecklist] = useState<Partial<Record<InstalacaoChecklistKey, boolean>>>({});
  const [tensaoId, setTensaoId] = useState<number | null>(null);
  const [fotos, setFotos] = useState<FotoSlot[]>(() => FOTO_LABELS.map(() => ({ blob: null, preview: null })));

  const open = !!instalacao;

  function resetForm() {
    setChecklist({});
    setTensaoId(null);
    fotos.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFotos(FOTO_LABELS.map(() => ({ blob: null, preview: null })));
    setErro(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  if (!instalacao) return null;

  const ehMinha = instalacao.instalador?.id === meuUserId;
  const podeAssumir = instalacao.statusGeralId === STATE_LIBERADO;
  const podeExecutar = instalacao.statusGeralId === STATE_EM_INSTALACAO && ehMinha;
  const travadaPorOutro = instalacao.statusGeralId === STATE_EM_INSTALACAO && !ehMinha;

  async function handleAssumir() {
    if (!instalacao) return;
    setAssumindo(true);
    setErro(null);
    try {
      const res = await instalacoesService.assumirInstalacao(instalacao.id);
      onAssumida(res.instalacao);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setErro(
        status === 409
          ? "Essa instalação acabou de ser assumida por outra pessoa."
          : "Falha ao assumir a instalação."
      );
    } finally {
      setAssumindo(false);
    }
  }

  function handleFoto(index: number, file: File | null) {
    setFotos((prev) => {
      const next = [...prev];
      if (next[index].preview) URL.revokeObjectURL(next[index].preview!);
      next[index] = file ? { blob: file, preview: URL.createObjectURL(file) } : { blob: null, preview: null };
      return next;
    });
  }

  const checklistCompleto = CHECKLIST_ITEMS.every((item) => checklist[item.key] != null);
  const fotosCompletas = fotos.every((f) => f.blob != null);
  const podeFinalizar = checklistCompleto && tensaoId != null && fotosCompletas;

  async function handleFinalizar() {
    if (!instalacao || !podeFinalizar || !tensaoId) return;
    setFinalizando(true);
    setErro(null);
    try {
      const fotosPayload: Record<string, Blob> = {};
      fotos.forEach((f, i) => {
        if (f.blob) fotosPayload[`foto${i + 1}`] = f.blob;
      });
      await instalacoesService.finalizarInstalacao(instalacao.id, {
        checklist,
        tensaoIdentificadaId: tensaoId,
        fotos: fotosPayload,
      });
      resetForm();
      onFinalizada(instalacao.id);
    } catch {
      setErro("Falha ao finalizar a instalação. Verifique a conexão e tente de novo.");
    } finally {
      setFinalizando(false);
    }
  }

  async function handleRejeitar(input: { motivo: string; justificativa: string; foto1: Blob; foto2?: Blob; foto3?: Blob }) {
    if (!instalacao) return;
    await instalacoesService.rejeitarInstalacao(instalacao.id, input);
    resetForm();
    onRejeitada(instalacao.id);
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 0.7, 0.2, 1] }}
              className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-brand-ice sm:max-w-[480px] sm:rounded-3xl"
            >
              <header className="flex items-center gap-3 border-b border-brand-steel/50 bg-white px-4 py-3.5">
                <button
                  onClick={handleClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-brand-steel/40"
                  aria-label="Voltar"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[15px] font-bold text-ink">{instalacao.equipamento}</h2>
                  <p className="flex items-center gap-1 text-[11.5px] text-ink-muted">
                    <MapPin className="h-3 w-3" /> {instalacao.contexto.municipio || "—"}
                    {instalacao.tipoEquipamento ? ` · ${instalacao.tipoEquipamento}` : ""}
                  </p>
                </div>
                {instalacao.latitude != null && instalacao.longitude != null && (
                  <button
                    onClick={() => setNavOpen(true)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-emerald/12 text-brand-emerald hover:bg-brand-emerald/20"
                    aria-label="Navegar até o local"
                  >
                    <Navigation className="h-4 w-4" />
                  </button>
                )}
              </header>

              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {travadaPorOutro && (
                  <div className="flex items-start gap-2 rounded-2xl bg-status-rejected/10 px-3 py-2.5 text-[12.5px] font-medium text-status-rejected">
                    <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" />
                    Essa instalação já está com {instalacao.instalador?.nome ?? "outro instalador"}.
                  </div>
                )}

                <Card className="p-4">
                  <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-muted">
                    Dados da vistoria (contexto)
                  </h3>
                  {contextoRow("PSPoste", instalacao.contexto.psPoste)}
                  {contextoRow("Altura do poste (m)", instalacao.contexto.alturaPoste)}
                  {contextoRow("Formato", instalacao.contexto.formato)}
                  {contextoRow("Material", instalacao.contexto.material)}
                  {contextoRow("Alimentação do equipamento", instalacao.contexto.alimentacao)}
                  {contextoRow("Tensão", instalacao.contexto.tensao)}
                  {contextoRow("Local de instalação", instalacao.contexto.localInstalacao)}
                  {contextoRow("DAN", instalacao.contexto.dan)}
                  {contextoRow("Chave", instalacao.contexto.chave)}
                  {contextoRow("Rede primária", instalacao.contexto.redePrimaria)}
                  {contextoRow("Rede secundária", instalacao.contexto.redeSecundaria)}
                  {contextoRow("Religador", instalacao.contexto.religador)}
                  {contextoRow("Transformador", instalacao.contexto.transformador)}
                  {contextoRow("Instalar TP", instalacao.contexto.instalarTp)}
                  {contextoRow("Aterramento", instalacao.contexto.aterramento)}
                  {contextoRow("Empresa", instalacao.empresa)}
                  {instalacao.contexto.endereco && (
                    <p className="mt-2 text-[12.5px] text-ink-muted">{instalacao.contexto.endereco}</p>
                  )}
                  {instalacao.contexto.observacao && (
                    <p className="mt-1 text-[12.5px] italic text-ink-muted">"{instalacao.contexto.observacao}"</p>
                  )}
                </Card>

                {podeAssumir && (
                  <Button
                    variant="primary"
                    fullWidth
                    size="lg"
                    loading={assumindo}
                    leftIcon={<Wrench className="h-4 w-4" />}
                    onClick={handleAssumir}
                  >
                    Assumir esta instalação
                  </Button>
                )}

                {podeExecutar && (
                  <>
                    <Card className="p-4">
                      <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-ink-muted">
                        Checklist de validação
                      </h3>
                      <div className="flex flex-col gap-2">
                        {CHECKLIST_ITEMS.map((item) => (
                          <div key={item.key} className="flex items-center justify-between gap-2">
                            <span className="text-[13px] text-ink">{item.label}</span>
                            <div className="flex gap-1.5">
                              {(["Sim", "Não"] as const).map((opt) => {
                                const val = opt === "Sim";
                                const selected = checklist[item.key] === val;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() =>
                                      setChecklist((prev) => ({ ...prev, [item.key]: val }))
                                    }
                                    className={cn(
                                      "h-8 min-w-[52px] rounded-lg text-[12px] font-bold transition",
                                      selected
                                        ? val
                                          ? "bg-brand-emerald text-white"
                                          : "bg-status-rejected text-white"
                                        : "bg-brand-steel/40 text-ink-muted hover:bg-brand-steel/60"
                                    )}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        <div className="mt-1 flex items-center justify-between gap-2 border-t border-brand-steel/40 pt-2.5">
                          <span className="text-[13px] text-ink">Tensão identificada</span>
                          <div className="flex gap-1.5">
                            {[
                              { id: 1, label: "127V" },
                              { id: 2, label: "220V" },
                            ].map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setTensaoId(opt.id)}
                                className={cn(
                                  "h-8 min-w-[52px] rounded-lg text-[12px] font-bold transition",
                                  tensaoId === opt.id
                                    ? "bg-brand-deep text-white"
                                    : "bg-brand-steel/40 text-ink-muted hover:bg-brand-steel/60"
                                )}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-ink-muted">
                        Registro fotográfico (7 fotos)
                      </h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        {FOTO_LABELS.map((label, idx) => (
                          <label
                            key={idx}
                            className={cn(
                              "relative flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border-2 border-dashed p-2 text-center text-[10.5px] font-semibold",
                              fotos[idx]?.preview
                                ? "border-brand-emerald/60"
                                : "border-brand-steel/60 text-ink-muted hover:border-brand-emerald/50"
                            )}
                          >
                            {fotos[idx]?.preview ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={fotos[idx].preview!} alt="" className="absolute inset-0 h-full w-full object-cover" />
                                <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-1 text-[9.5px] font-semibold text-white">
                                  Foto {idx + 1}
                                </span>
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
                                <Camera className="h-5 w-5" />
                                <span>
                                  Foto {idx + 1}
                                  <br />
                                  {label}
                                </span>
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
                    </Card>

                    {erro && (
                      <p className="rounded-xl bg-status-rejected/10 px-3 py-2 text-[12.5px] font-medium text-status-rejected">
                        {erro}
                      </p>
                    )}

                    <div className="flex flex-col gap-2">
                      <Button
                        variant="primary"
                        fullWidth
                        size="lg"
                        disabled={!podeFinalizar}
                        loading={finalizando}
                        leftIcon={<Check className="h-4 w-4" />}
                        onClick={handleFinalizar}
                      >
                        Finalizar instalação
                      </Button>
                      <Button
                        variant="outline"
                        fullWidth
                        leftIcon={<AlertTriangle className="h-4 w-4" />}
                        onClick={() => setRejeitarOpen(true)}
                      >
                        Rejeitar instalação
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RejeitarInstalacaoModal
        open={rejeitarOpen}
        equipamento={instalacao.equipamento}
        onClose={() => setRejeitarOpen(false)}
        onEnviar={handleRejeitar}
      />

      {instalacao.latitude != null && instalacao.longitude != null && (
        <NavigationOptionsSheet
          open={navOpen}
          onClose={() => setNavOpen(false)}
          lat={instalacao.latitude}
          lng={instalacao.longitude}
          label={instalacao.equipamento}
        />
      )}
    </>
  );
}
