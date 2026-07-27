"use client";

/**
 * DevolucaoModal — "Houve um problema com a vistoria".
 *
 * Aparece sozinho (useDevolucaoWatcher) quando o analista devolve uma
 * vistoria pro técnico corrigir itens específicos. Mostra o que foi
 * apontado (fotos/vídeo vs campos do formulário), o(s) motivo(s), e se
 * vai precisar se deslocar até o equipamento ou não.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, ClipboardEdit, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDevolucaoStore, devolucaoEhDeOutroDia } from "@/store/devolucao";
import { DEVOLUCAO_ITEM_LABEL, DEVOLUCAO_ITENS } from "@/lib/glpi/devolucaoItens";

export function DevolucaoModal() {
  const router = useRouter();
  const devolucao = useDevolucaoStore((s) => s.devolucao);
  const vistoria = useDevolucaoStore((s) => s.vistoria);
  const modalAberto = useDevolucaoStore((s) => s.modalAberto);
  const fecharModal = useDevolucaoStore((s) => s.fecharModal);

  if (!devolucao || !vistoria) return null;

  const tipoDe = (key: string) => DEVOLUCAO_ITENS.find((i) => i.key === key)?.tipo;
  const fotos = devolucao.itens.filter((k) => tipoDe(k) === "foto");
  const campos = devolucao.itens.filter((k) => tipoDe(k) === "campo");

  const motivosTexto = devolucao.motivos
    .map((m) => (m === "Outro" ? devolucao.motivoOutro || "Outro" : m))
    .join(" · ");

  const atrasada = devolucaoEhDeOutroDia(devolucao.criadoEm);

  return (
    <AnimatePresence>
      {modalAberto && (
        <motion.div
          className="fixed inset-0 z-[140] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-brand-deep/40 backdrop-blur-[2px]"
            onClick={fecharModal}
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

            <div className="px-5 pt-4">
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] font-bold text-ink">Houve um problema com a vistoria</h2>
                  <p className="truncate text-[13px] text-ink-muted">
                    {vistoria.equipamento} {vistoria.cidade ? `· ${vistoria.cidade}` : ""}
                  </p>
                </div>
              </div>

              {atrasada && (
                <div className="mb-3 flex items-center gap-2 rounded-2xl bg-red-600 px-3.5 py-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-white" />
                  <p className="text-[12px] font-semibold text-white">
                    Pendente desde outro dia — resolva antes de iniciar novas vistorias hoje.
                  </p>
                </div>
              )}

              <div className="mb-3 rounded-2xl bg-red-50 px-3.5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">Motivo</p>
                <p className="mt-0.5 text-[13px] text-red-800">{motivosTexto}</p>
              </div>

              {fotos.length > 0 && (
                <div className="mb-2.5">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    <Camera className="h-3 w-3" /> Fotos/vídeo pra refazer
                  </p>
                  <ul className="space-y-1">
                    {fotos.map((k) => (
                      <li key={k} className="rounded-xl bg-brand-ice/70 px-3 py-2 text-[12.5px] font-medium text-ink">
                        {DEVOLUCAO_ITEM_LABEL[k] ?? k}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {campos.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    <ClipboardEdit className="h-3 w-3" /> Campos pra corrigir
                  </p>
                  <ul className="space-y-1">
                    {campos.map((k) => (
                      <li key={k} className="rounded-xl bg-brand-ice/70 px-3 py-2 text-[12.5px] font-medium text-ink">
                        {DEVOLUCAO_ITEM_LABEL[k] ?? k}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div
                className={`mb-4 flex items-center gap-2.5 rounded-2xl px-3.5 py-3 ${
                  devolucao.precisaDeslocamento ? "bg-amber-50" : "bg-emerald-50"
                }`}
              >
                {devolucao.precisaDeslocamento ? (
                  <Navigation className="h-4 w-4 shrink-0 text-amber-700" />
                ) : (
                  <MapPin className="h-4 w-4 shrink-0 text-emerald-700" />
                )}
                <p className={`text-[12.5px] font-medium ${devolucao.precisaDeslocamento ? "text-amber-800" : "text-emerald-800"}`}>
                  {devolucao.precisaDeslocamento
                    ? "Precisa ir até o equipamento pra refazer a foto/vídeo."
                    : "Só corrigir informação — não precisa se deslocar."}
                </p>
              </div>

              <Button
                size="lg"
                onClick={() => {
                  fecharModal();
                  router.push(`/vistoria-corrigir?id=${vistoria.id}`);
                }}
                className="w-full"
              >
                Corrigir agora
              </Button>
              <button
                type="button"
                onClick={fecharModal}
                className="mt-2 w-full text-center text-[12px] font-medium text-ink-muted underline-offset-2 hover:underline"
              >
                Depois
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
