"use client";

/**
 * Tela de execução da instalação: contexto herdado da vistoria (leitura),
 * "assumir" quando ainda Liberado, checklist + 7 fotos guiadas quando já é
 * minha (Em Instalação), finalizar ou rejeitar. Espelha a experiência do
 * VistoriaExecucaoSheet (checklist com progresso + câmera guiada em tela
 * cheia), mas com regras e campos totalmente novos — nenhum componente da
 * vistoria é reaproveitado aqui além dos primitivos de UI (Button, Card).
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Cable,
  Camera,
  Check,
  ChevronLeft,
  Link2,
  MapPin,
  Navigation,
  PackageCheck,
  PlugZap,
  Send,
  ShieldQuestion,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/utils/cn";
import type { Instalacao, InstalacaoCaptureBundle, InstalacaoChecklistKey } from "@/types";
import { instalacoesService } from "@/services/instalacoes";
import { RejeitarInstalacaoModal } from "./RejeitarInstalacaoModal";
import { InstalacaoCameraModal } from "./InstalacaoCameraModal";
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

const CHECKLIST_ITEMS: Array<{ key: InstalacaoChecklistKey; label: string; icon: typeof Link2 }> = [
  { key: "cintaInstalada", label: "Cinta corretamente instalada", icon: Link2 },
  { key: "equipamentoFixado", label: "Equipamento fixado adequadamente", icon: PackageCheck },
  { key: "cabeamentoOrganizado", label: "Cabeamento organizado", icon: Cable },
  { key: "alimentacaoValidada", label: "Alimentação validada", icon: Zap },
  { key: "equipamentoEnergizado", label: "Equipamento energizado", icon: PlugZap },
];

const FOTO_THUMBS: Array<{ key: keyof InstalacaoCaptureBundle; label: string }> = [
  { key: "foto1", label: "Chegada" },
  { key: "foto2", label: "Preparação" },
  { key: "foto3", label: "Cinta" },
  { key: "foto4", label: "Fixação" },
  { key: "foto5", label: "Tensão" },
  { key: "foto6", label: "Frontal" },
  { key: "foto7", label: "Geral" },
];

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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [checklist, setChecklist] = useState<Partial<Record<InstalacaoChecklistKey, boolean>>>({});
  const [tensaoId, setTensaoId] = useState<number | null>(null);
  const [captures, setCaptures] = useState<InstalacaoCaptureBundle>({});

  const open = !!instalacao;

  function resetForm() {
    setChecklist({});
    setTensaoId(null);
    setCaptures({});
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

  const checklistDone = CHECKLIST_ITEMS.filter((item) => checklist[item.key] != null).length;
  const checklistCompleto = checklistDone === CHECKLIST_ITEMS.length;
  const captureCount = FOTO_THUMBS.filter((f) => !!captures[f.key]).length;
  const fotosCompletas = captureCount === FOTO_THUMBS.length;
  const podeFinalizar = checklistCompleto && tensaoId != null && fotosCompletas;

  async function handleFinalizar() {
    if (!instalacao || !podeFinalizar || !tensaoId) return;
    setFinalizando(true);
    setErro(null);
    try {
      const fotosPayload: Record<string, Blob> = {};
      FOTO_THUMBS.forEach(({ key }) => {
        const blob = captures[key];
        if (blob) fotosPayload[key] = blob;
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
                      <header className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                            Checklist de validação
                          </h3>
                          <p className="text-[11.5px] text-ink-muted">
                            {checklistDone}/{CHECKLIST_ITEMS.length} itens verificados
                          </p>
                        </div>
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-emerald/12 text-brand-emerald">
                          <Check className="h-4 w-4" />
                        </span>
                      </header>

                      <ChecklistProgressBar count={checklistDone} total={CHECKLIST_ITEMS.length} />

                      <div className="mt-3 flex flex-col gap-2">
                        {CHECKLIST_ITEMS.map((item) => {
                          const Icon = item.icon;
                          const value = checklist[item.key];
                          return (
                            <div
                              key={item.key}
                              className={cn(
                                "flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition",
                                value === true
                                  ? "border-brand-emerald/30 bg-brand-emerald/[0.06]"
                                  : value === false
                                  ? "border-status-rejected/30 bg-status-rejected/[0.05]"
                                  : "border-brand-steel/50 bg-white"
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                                  value === true
                                    ? "bg-brand-emerald/15 text-brand-emerald"
                                    : value === false
                                    ? "bg-status-rejected/15 text-status-rejected"
                                    : "bg-brand-steel/50 text-ink-muted"
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="flex-1 text-[13px] font-medium text-ink">{item.label}</span>
                              <div className="flex gap-1.5">
                                {(["Sim", "Não"] as const).map((opt) => {
                                  const val = opt === "Sim";
                                  const selected = checklist[item.key] === val;
                                  return (
                                    <motion.button
                                      key={opt}
                                      type="button"
                                      whileTap={{ scale: 0.92 }}
                                      onClick={() => setChecklist((prev) => ({ ...prev, [item.key]: val }))}
                                      className={cn(
                                        "h-8 min-w-[48px] rounded-lg text-[12px] font-bold transition",
                                        selected
                                          ? val
                                            ? "bg-brand-emerald text-white"
                                            : "bg-status-rejected text-white"
                                          : "bg-brand-steel/40 text-ink-muted hover:bg-brand-steel/60"
                                      )}
                                    >
                                      {opt}
                                    </motion.button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-3 border-t border-brand-steel/40 pt-3">
                        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                          <Zap className="h-3.5 w-3.5 text-brand-amber" />
                          Tensão identificada
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 1, label: "127V" },
                            { id: 2, label: "220V" },
                          ].map((opt) => (
                            <motion.button
                              key={opt.id}
                              type="button"
                              whileTap={{ scale: 0.96 }}
                              onClick={() => setTensaoId(opt.id)}
                              className={cn(
                                "flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 font-bold transition",
                                tensaoId === opt.id
                                  ? "border-brand-deep bg-brand-deep text-white"
                                  : "border-brand-steel/50 bg-white text-ink-muted hover:border-brand-deep/40"
                              )}
                            >
                              <Zap className={cn("h-4 w-4", tensaoId === opt.id ? "text-brand-amber" : "text-ink-muted")} />
                              <span className="text-[15px]">{opt.label}</span>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <header className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                            Registro fotográfico
                          </h3>
                          <p className="text-[11.5px] text-ink-muted">{captureCount}/7 fotos validadas</p>
                        </div>
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-amber/20 text-[#8a5a00]">
                          <Camera className="h-4 w-4" />
                        </span>
                      </header>

                      <ChecklistProgressBar count={captureCount} total={FOTO_THUMBS.length} />

                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {FOTO_THUMBS.map((t) => {
                          const blob = captures[t.key];
                          return (
                            <div
                              key={t.key}
                              className={cn(
                                "relative aspect-square overflow-hidden rounded-xl border",
                                blob ? "border-brand-emerald/50 bg-black" : "border-dashed border-brand-steel/70 bg-brand-ice/80"
                              )}
                            >
                              {blob ? (
                                <ThumbPreview blob={blob} />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <Camera className="h-3.5 w-3.5 text-ink-muted" />
                                </div>
                              )}
                              <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-center text-[8px] font-semibold text-white">
                                {t.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <Button
                        fullWidth
                        size="lg"
                        className="mt-3"
                        leftIcon={<Camera className="h-4 w-4" />}
                        onClick={() => setCameraOpen(true)}
                      >
                        {captureCount === 0 ? "Abrir câmera guiada" : captureCount < 7 ? "Continuar captura" : "Revisar fotos"}
                      </Button>
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
                        leftIcon={<Send className="h-4 w-4" />}
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

      <InstalacaoCameraModal
        open={cameraOpen}
        bundle={captures}
        onChange={setCaptures}
        onClose={() => setCameraOpen(false)}
        equipmentName={instalacao.equipamento}
      />

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

function ChecklistProgressBar({ count, total }: { count: number; total: number }) {
  return (
    <div className="flex h-1.5 gap-1 overflow-hidden rounded-full bg-brand-steel/50">
      {Array.from({ length: total }).map((_, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={{ backgroundColor: i < count ? "#06D6A0" : "rgba(229,231,235,0)" }}
          transition={{ duration: 0.35 }}
          className="h-full flex-1 rounded-full"
        />
      ))}
    </div>
  );
}

function ThumbPreview({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />;
}
