"use client";

/**
 * RecusarVistoriaFlow — técnico declara que a vistoria é impossível de
 * fazer (propriedade privada, risco, poste removido, sem alternativa nas
 * redondezas, etc.) e pede aprovação do analista.
 *
 * Dois pontos de entrada (ver GuidedArrival):
 *  • `motivoFixo="SEM_POSTES"` — gate automático não achou nenhum poste
 *    num raio de 100m. Pula direto pra revisão, sem perguntas extras.
 *  • sem motivoFixo — veio do "Nenhum poste aqui é acessível" dentro do
 *    MudarPosteFlow. Técnico escolhe o motivo (2–7) e responde o Q&A.
 *
 * Depois de enviar, faz polling do status (mesma ideia do override de
 * "iniciar fora do raio", mas tabela própria) até aprovar/reprovar.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, ChevronRight, Clock, Send, Trash2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api, type ApiError } from "@/services/api";
import { cn } from "@/utils/cn";
import {
  RECUSA_MOTIVOS_MANUAIS,
  RECUSA_MOTIVO_LABEL,
  RECUSA_PERGUNTAS,
  gerarJustificativaRecusa,
  recusaRespostasCompletas,
  type RecusaMotivo,
} from "@/lib/glpi/recusaMotivos";

type Fase = "motivo" | "perguntas" | "revisao" | "enviando" | "aguardando" | "aprovado" | "reprovado" | "erro";

interface RecusarVistoriaFlowProps {
  open: boolean;
  vistoriaId: string;
  equipamento: string;
  /** Quando definido, pula a etapa de escolha de motivo (caso do gate automático). */
  motivoFixo?: RecusaMotivo;
  onClose: () => void;
  /** Chamado quando a recusa é APROVADA — a vistoria saiu de circulação. */
  onAprovada: () => void;
}

export function RecusarVistoriaFlow({
  open,
  vistoriaId,
  equipamento,
  motivoFixo,
  onClose,
  onAprovada,
}: RecusarVistoriaFlowProps) {
  const [fase, setFase] = useState<Fase>("motivo");
  const [motivo, setMotivo] = useState<RecusaMotivo | null>(motivoFixo ?? null);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [recusaId, setRecusaId] = useState<number | null>(null);
  const [motivoReprovacao, setMotivoReprovacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setFase(motivoFixo ? "revisao" : "motivo");
    setMotivo(motivoFixo ?? null);
    setRespostas({});
    setRecusaId(null);
    setMotivoReprovacao("");
    setErro(null);
    setFoto(null);
    setFotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [open, motivoFixo]);

  function handleFotoChange(file: File | null) {
    setFotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setFoto(file);
  }

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    if (fase !== "aguardando" || !recusaId) return;
    const poll = async () => {
      try {
        const { data } = await api.get<{ status: string; motivoReprovacao?: string | null }>(
          `/vistorias/recusa-status?recusaId=${recusaId}`
        );
        if (data.status === "APROVADO") {
          window.clearInterval(pollRef.current!);
          setFase("aprovado");
          window.setTimeout(onAprovada, 2200);
        } else if (data.status === "REPROVADO") {
          window.clearInterval(pollRef.current!);
          setMotivoReprovacao(data.motivoReprovacao ?? "");
          setFase("reprovado");
        }
      } catch {
        /* rede ruim — tenta no próximo ciclo */
      }
    };
    pollRef.current = window.setInterval(poll, 3000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [fase, recusaId, onAprovada]);

  const perguntas = motivo ? RECUSA_PERGUNTAS[motivo] : [];
  const podeRevisar = motivo != null && recusaRespostasCompletas(motivo, respostas);
  const justificativa = motivo ? gerarJustificativaRecusa(motivo, respostas) : "";

  async function enviar() {
    if (!motivo) return;
    setFase("enviando");
    setErro(null);
    try {
      const form = new FormData();
      form.append("payload", JSON.stringify({ motivo, respostas, justificativa }));
      if (foto) form.append("foto", foto, foto.name || "recusa.jpg");
      // Content-Type: undefined remove o default json da instância `api` e
      // deixa o browser calcular o boundary do multipart/form-data sozinho
      // (mesmo bug/fix do corrigirDevolucao em services/vistorias.ts).
      const { data } = await api.post<{ ok: true; recusaId: number }>(
        `/vistorias/${vistoriaId}/recusar`,
        form,
        { headers: { "Content-Type": undefined } }
      );
      setRecusaId(data.recusaId);
      setFase("aguardando");
    } catch (err) {
      const msg = (err as ApiError).response?.data?.message;
      setErro(msg ?? "Falha ao enviar a recusa. Verifique a conexão e tente de novo.");
      setFase("revisao");
    }
  }

  const BG_RED = "linear-gradient(160deg,#DC2626 0%,#B91C1C 60%,#7F1D1D 100%)";
  const BG_GREEN = "linear-gradient(160deg,#059669 0%,#047857 60%,#065F46 100%)";
  const BG_NEUTRAL = "linear-gradient(160deg,#1F2937 0%,#111827 60%,#0B1220 100%)";

  const bg =
    fase === "aprovado" ? BG_GREEN
    : fase === "reprovado" ? BG_RED
    : fase === "aguardando" ? "linear-gradient(160deg,#EA580C 0%,#C2410C 60%,#9A3412 100%)"
    : BG_NEUTRAL;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[230] flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, background: bg }}
          exit={{ opacity: 0 }}
          transition={{ background: { duration: 0.5 }, opacity: { duration: 0.2 } }}
          style={{ background: bg, color: "#fff" }}
        >
          {/* header */}
          <div className="flex items-start justify-between px-5 pt-[max(env(safe-area-inset-top),18px)]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                Recusar vistoria
              </p>
              <h2 className="truncate text-[18px] font-bold tracking-tight">{equipamento}</h2>
            </div>
            {fase !== "enviando" && fase !== "aguardando" && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* corpo */}
          <div className="flex-1 overflow-y-auto px-5 py-6">
            {fase === "motivo" && (
              <>
                <p className="mb-4 text-[14px] text-white/75">
                  Nenhum dos postes próximos serve. Qual o motivo real da recusa?
                </p>
                <ul className="space-y-2">
                  {RECUSA_MOTIVOS_MANUAIS.map((m) => {
                    const active = motivo === m.key;
                    return (
                      <li key={m.key}>
                        <button
                          type="button"
                          onClick={() => setMotivo(m.key)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                            active ? "border-white bg-white/15" : "border-white/15 bg-white/5 hover:bg-white/10"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                              active ? "border-white bg-white text-red-700" : "border-white/40"
                            )}
                          >
                            {active && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          <span className="text-[14px] font-medium">{m.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {fase === "perguntas" && motivo && (
              <div className="space-y-4">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-white/60">
                  {RECUSA_MOTIVO_LABEL[motivo]}
                </p>
                {perguntas.map((p) => (
                  <div key={p.key}>
                    <p className="mb-2 text-[14px] font-medium">
                      {p.pergunta}
                      {!p.obrigatoria && <span className="text-white/50"> (opcional)</span>}
                    </p>
                    {p.tipo === "opcoes" ? (
                      <div className="space-y-1.5">
                        {p.opcoes?.map((op) => {
                          const active = respostas[p.key] === op;
                          return (
                            <button
                              key={op}
                              type="button"
                              onClick={() => setRespostas((r) => ({ ...r, [p.key]: op }))}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-medium transition",
                                active ? "border-white bg-white/15" : "border-white/15 bg-white/5 hover:bg-white/10"
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                                  active ? "border-white bg-white text-red-700" : "border-white/40"
                                )}
                              >
                                {active && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                              </span>
                              {op}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <textarea
                        value={respostas[p.key] ?? ""}
                        onChange={(e) => setRespostas((r) => ({ ...r, [p.key]: e.target.value }))}
                        rows={2}
                        placeholder="Escreva aqui…"
                        className="w-full resize-none rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-[14px] text-white outline-none placeholder:text-white/40"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {fase === "revisao" && motivo && (
              <>
                <div className="rounded-2xl bg-white/10 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">Justificativa gerada</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed">{justificativa}</p>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-[13px] font-medium">
                    Foto de evidência <span className="text-white/50">(opcional)</span>
                  </p>
                  {fotoPreview ? (
                    <div className="relative overflow-hidden rounded-2xl border border-white/15">
                      <img src={fotoPreview} alt="Evidência" className="h-40 w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleFotoChange(null)}
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
                        aria-label="Remover foto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/25 bg-white/5 text-white/60 transition hover:bg-white/10">
                      <Camera className="h-5 w-5" />
                      <span className="text-[12px] font-medium">Tirar ou escolher foto</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleFotoChange(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>

                {erro && (
                  <p className="mt-3 rounded-xl bg-black/25 px-3 py-2 text-[13px] font-medium text-amber-200">
                    {erro}
                  </p>
                )}
                <p className="mt-4 flex items-start gap-2 text-[12.5px] text-white/60">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  A vistoria sai da sua fila até o analista aprovar ou reprovar a recusa.
                </p>
              </>
            )}

            {(fase === "enviando" || fase === "aguardando") && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="flex h-32 w-32 items-center justify-center rounded-full"
                  style={{ background: "rgba(255,255,255,0.15)", boxShadow: "0 0 0 10px rgba(255,255,255,0.07)" }}
                >
                  <Clock className="h-16 w-16" strokeWidth={1.5} />
                </motion.div>
                <p className="mt-7 text-[13px] font-bold uppercase tracking-[0.2em] text-white/60">
                  {fase === "enviando" ? "Enviando" : "Aguardando aprovação"}
                </p>
                <p className="mt-2 max-w-[260px] text-[14px] text-white/70">
                  O analista precisa confirmar que a vistoria realmente não é possível.
                </p>
              </div>
            )}

            {fase === "aprovado" && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 14 }}
                  className="flex h-32 w-32 items-center justify-center rounded-full bg-white/20"
                >
                  <Check className="h-20 w-20" strokeWidth={3} />
                </motion.div>
                <p className="mt-7 text-[22px] font-bold">Recusa aprovada</p>
                <p className="mt-1 text-[14px] text-white/80">Essa vistoria saiu da sua fila.</p>
              </div>
            )}

            {fase === "reprovado" && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 14 }}
                  className="flex h-32 w-32 items-center justify-center rounded-full bg-white/15"
                >
                  <XCircle className="h-20 w-20" strokeWidth={2} />
                </motion.div>
                <p className="mt-7 text-[22px] font-bold">Recusa não aceita</p>
                <p className="mt-1 text-[14px] text-white/80">A vistoria voltou pra sua fila.</p>
                {motivoReprovacao && (
                  <div className="mt-4 max-w-[300px] rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">Motivo</p>
                    <p className="mt-1 text-[14px] text-white/90">{motivoReprovacao}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* rodapé */}
          <div className="px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
            {fase === "motivo" && (
              <Button
                fullWidth
                size="lg"
                variant="secondary"
                disabled={!motivo}
                rightIcon={<ChevronRight className="h-4 w-4" />}
                onClick={() => setFase("perguntas")}
              >
                Continuar
              </Button>
            )}
            {fase === "perguntas" && (
              <Button
                fullWidth
                size="lg"
                variant="secondary"
                disabled={!podeRevisar}
                rightIcon={<ChevronRight className="h-4 w-4" />}
                onClick={() => setFase("revisao")}
              >
                Revisar
              </Button>
            )}
            {fase === "revisao" && (
              <Button fullWidth size="lg" variant="secondary" leftIcon={<Send className="h-4 w-4" />} onClick={enviar}>
                Enviar recusa
              </Button>
            )}
            {fase === "reprovado" && (
              <Button fullWidth size="lg" variant="secondary" onClick={onClose}>
                Entendi
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
