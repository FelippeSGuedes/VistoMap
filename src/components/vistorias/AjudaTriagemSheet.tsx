"use client";

/**
 * AjudaTriagemSheet — chip discreto "Precisa de ajuda?" + funil curto que
 * termina em "Trocar de poste" ou "Recusar vistoria" (que já exige motivo +
 * aprovação do analista via RecusarVistoriaFlow — isso não muda aqui).
 *
 * Usado em dois lugares (VistoriaExecucaoForm e vistoria-corrigir): mesma
 * dúvida ("sinal ruim mesmo depois de trocar de poste, e agora?") acontece
 * tanto na vistoria normal quanto na correção de devolução.
 */

import { X } from "lucide-react";

type AjudaStep = "raiz" | "trocou";

interface AjudaTriagemSheetProps {
  open: boolean;
  step: AjudaStep;
  onStepChange: (step: AjudaStep) => void;
  onClose: () => void;
  /** Mostra a opção "Sinal ruim (RSRP)" na raiz — sempre relevante quando a tela tem campo de RSRP. */
  mostrarOpcaoSinal: boolean;
  onTrocarPoste: () => void;
  onRecusarPorSinal: () => void;
  onRecusarGenerico: () => void;
}

export function AjudaTriagemSheet({
  open,
  step,
  onStepChange,
  onClose,
  mostrarOpcaoSinal,
  onTrocarPoste,
  onRecusarPorSinal,
  onRecusarGenerico,
}: AjudaTriagemSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[15px] font-bold text-ink">
            {step === "raiz" ? "Qual é o problema?" : "Já tentou trocar de poste?"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-ice text-ink-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "raiz" ? (
          <div className="space-y-2">
            {mostrarOpcaoSinal && (
              <button
                type="button"
                onClick={() => onStepChange("trocou")}
                className="w-full rounded-2xl border border-brand-steel/70 bg-white px-4 py-3 text-left text-[14px] font-medium text-ink hover:border-brand-emerald/50"
              >
                Sinal ruim (RSRP)
              </button>
            )}
            <button
              type="button"
              onClick={onRecusarGenerico}
              className="w-full rounded-2xl border border-brand-steel/70 bg-white px-4 py-3 text-left text-[14px] font-medium text-ink hover:border-brand-emerald/50"
            >
              Outro motivo (poste inacessível, risco, etc.)
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onTrocarPoste}
              className="w-full rounded-2xl border border-brand-steel/70 bg-white px-4 py-3 text-left text-[14px] font-medium text-ink hover:border-brand-emerald/50"
            >
              Não — trocar de poste agora
            </button>
            <button
              type="button"
              onClick={onRecusarPorSinal}
              className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-[14px] font-bold text-red-700"
            >
              Sim, já troquei — recusar vistoria
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
