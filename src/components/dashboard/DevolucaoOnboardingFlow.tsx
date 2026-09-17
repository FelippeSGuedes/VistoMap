"use client";

/**
 * DevolucaoOnboardingFlow — substitui o balão persistente "Vistoria
 * devolvida" (DevolucaoBanner, aposentado). Aparece só na tela inicial,
 * uma vez por lote de pendências ainda sem dia marcado: primeiro um
 * resumo ("Estou ciente!"), depois a escolha do dia (próximos 7 dias
 * úteis). Depois de agendado, fica em silêncio até o dia escolhido — ver
 * DevolucaoRotaPrompt.
 *
 * Unifica 2 mecanismos diferentes de "isso voltou pro técnico": Devolução
 * (analista aponta itens específicos) e Revisita (CPFL reprovou a
 * vistoria inteira) — ver resumo/route.ts. Cada card mostra uma etiqueta
 * indicando qual é qual, já que o tipo de trabalho é diferente (corrigir
 * um item vs refazer a vistoria completa).
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Calendar, Camera, ClipboardEdit, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api } from "@/services/api";
import { DEVOLUCAO_ITENS } from "@/lib/glpi/devolucaoItens";

export interface DevolucaoResumoItem {
  tipo: "devolucao" | "revisita";
  chaveId: number;
  vistoriaId: number;
  equipamento: string;
  cidade: string;
  itens: string[];
  motivos: string[];
  motivoOutro: string | null;
  precisaDeslocamento: boolean;
}

interface DevolucaoOnboardingFlowProps {
  itens: DevolucaoResumoItem[];
  diasDisponiveis: string[];
  onAgendado: () => void;
}

function tipoDoItem(key: string): "foto" | "campo" | undefined {
  return DEVOLUCAO_ITENS.find((i) => i.key === key)?.tipo;
}

function labelDoDia(iso: string): { titulo: string; sub: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const data = new Date(y, m - 1, d);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  const diffDias = Math.round((data.getTime() - hoje.getTime()) / 86_400_000);
  const dataFmt = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (diffDias === 0) return { titulo: "Hoje", sub: dataFmt };
  if (diffDias === 1) return { titulo: "Amanhã", sub: dataFmt };
  const semana = data.toLocaleDateString("pt-BR", { weekday: "long" });
  return { titulo: semana.charAt(0).toUpperCase() + semana.slice(1), sub: dataFmt };
}

const TAG_POR_TIPO = {
  devolucao: { label: "Devolução", className: "bg-red-100 text-red-700" },
  revisita: { label: "Revisita", className: "bg-amber-100 text-amber-800" },
} as const;

function ItemResumoCard({ item }: { item: DevolucaoResumoItem }) {
  const fotos = item.itens.filter((k) => tipoDoItem(k) === "foto").length;
  const campos = item.itens.filter((k) => tipoDoItem(k) === "campo").length;
  const motivosTexto = item.motivos
    .map((m) => (m === "Outro" ? item.motivoOutro || "Outro" : m))
    .join(" · ");
  const tag = TAG_POR_TIPO[item.tipo];
  return (
    <li className="rounded-2xl border border-brand-steel/60 bg-brand-ice/60 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tag.className}`}>
          {tag.label}
        </span>
        <p className="truncate text-[13.5px] font-semibold text-ink">
          {item.equipamento}
          {item.cidade ? <span className="font-normal text-ink-muted"> · {item.cidade}</span> : null}
        </p>
      </div>
      {motivosTexto && <p className="mt-1.5 text-[12px] text-red-700">{motivosTexto}</p>}
      {item.tipo === "revisita" ? (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-muted">
          <RotateCw className="h-3 w-3" /> Vistoria completa a refazer
        </div>
      ) : (
        (fotos > 0 || campos > 0) && (
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-muted">
            {fotos > 0 && (
              <span className="inline-flex items-center gap-1">
                <Camera className="h-3 w-3" /> {fotos} foto{fotos > 1 ? "s" : ""}
              </span>
            )}
            {campos > 0 && (
              <span className="inline-flex items-center gap-1">
                <ClipboardEdit className="h-3 w-3" /> {campos} campo{campos > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )
      )}
    </li>
  );
}

export function DevolucaoOnboardingFlow({
  itens,
  diasDisponiveis,
  onAgendado,
}: DevolucaoOnboardingFlowProps) {
  const [passo, setPasso] = useState<"resumo" | "dia">("resumo");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const visivel = itens.length > 0;

  const escolherDia = async (dia: string) => {
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await api.post("/vistorias/devolucoes/agendar", { dia });
      onAgendado();
    } catch {
      setErro("Não deu pra agendar agora — tenta de novo em instantes.");
      setEnviando(false);
    }
  };

  return (
    <AnimatePresence>
      {visivel && (
        <motion.div
          className="fixed inset-0 z-[140] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-brand-deep/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 w-full max-w-xl rounded-t-3xl bg-white pb-[max(env(safe-area-inset-bottom),16px)] shadow-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-12 rounded-full bg-brand-steel" />
            </div>

            <div className="max-h-[80dvh] overflow-y-auto px-5 pt-4">
              <AnimatePresence mode="wait">
                {passo === "resumo" ? (
                  <motion.div
                    key="resumo"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="mb-4 flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                        <AlertTriangle className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-[16px] font-bold text-ink">
                          {itens.length === 1
                            ? "1 vistoria voltou para você"
                            : `${itens.length} vistorias voltaram para você`}
                        </h2>
                        <p className="text-[13px] text-ink-muted">
                          Dá uma olhada rápida — depois você escolhe quando resolver.
                        </p>
                      </div>
                    </div>

                    <ul className="max-h-[42dvh] space-y-2 overflow-y-auto">
                      {itens.map((item) => (
                        <ItemResumoCard key={`${item.tipo}-${item.chaveId}`} item={item} />
                      ))}
                    </ul>

                    <Button size="lg" onClick={() => setPasso("dia")} className="mt-4 w-full">
                      Estou ciente!
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="dia"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="mb-4 flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-emerald/15 text-brand-emerald">
                        <Calendar className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-[16px] font-bold text-ink">
                          Qual dia você conseguirá realizar {itens.length === 1 ? "essa vistoria" : "essas vistorias"}?
                        </h2>
                        <p className="text-[13px] text-ink-muted">
                          Escolha em até 7 dias úteis.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {diasDisponiveis.map((iso) => {
                        const { titulo, sub } = labelDoDia(iso);
                        return (
                          <button
                            key={iso}
                            type="button"
                            disabled={enviando}
                            onClick={() => escolherDia(iso)}
                            className="flex w-full items-center justify-between rounded-2xl border border-brand-steel/70 bg-white px-4 py-3 text-left transition active:scale-[0.98] disabled:opacity-50"
                          >
                            <span className="text-[14px] font-semibold text-ink">{titulo}</span>
                            <span className="text-[12.5px] font-medium text-ink-muted tabular-nums">{sub}</span>
                          </button>
                        );
                      })}
                    </div>

                    {enviando && (
                      <div className="mt-3 flex items-center justify-center gap-2 text-[12.5px] text-ink-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Agendando…
                      </div>
                    )}
                    {erro && (
                      <p className="mt-3 text-center text-[12.5px] font-medium text-red-600">{erro}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
