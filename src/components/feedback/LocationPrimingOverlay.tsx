"use client";

/**
 * LocationPrimingOverlay — "declaração em destaque" mostrada antes do
 * pedido de permissão de localização em segundo plano (exigência do
 * Google Play, ver store/locationPriming.ts). Some assim que o técnico
 * confirma, e o pedido de permissão do sistema aparece na sequência.
 */

import { AnimatePresence, motion } from "framer-motion";
import { MapPin, Radar, Clock, EyeOff } from "lucide-react";
import { useLocationPrimingStore } from "@/store/locationPriming";

const PONTOS = [
  {
    icon: Clock,
    texto: "Só funciona durante o seu expediente — para automaticamente fora do horário de trabalho.",
  },
  {
    icon: Radar,
    texto: "Permite que a coordenação veja sua posição no mapa operacional e organize melhor as vistorias.",
  },
  {
    icon: EyeOff,
    texto: "Não é usada pra nada além disso — sem anúncios, sem venda de dados, sem rastreio fora do trabalho.",
  },
] as const;

export function LocationPrimingOverlay() {
  const visible = useLocationPrimingStore((s) => s.visible);
  const confirmar = useLocationPrimingStore((s) => s.confirmar);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="location-priming"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[195] flex flex-col items-center justify-center px-4 text-brand-ice"
          style={{
            background:
              "linear-gradient(180deg, rgba(7,59,76,0.97) 0%, rgba(5,40,52,0.99) 60%, rgba(3,26,34,1) 100%)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 0.7, 0.2, 1], delay: 0.05 }}
            className="flex w-full max-w-[360px] flex-col items-center"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-emerald/15 text-brand-emerald ring-1 ring-brand-emerald/30">
              <MapPin className="h-7 w-7" strokeWidth={2} />
            </span>

            <h1 className="mt-4 text-center text-[16px] font-semibold tracking-tight text-white">
              Localização em segundo plano
            </h1>
            <p className="mt-1.5 text-center text-[12.5px] leading-relaxed text-white/60">
              O VistoMap precisa acompanhar sua localização mesmo com a tela
              bloqueada, pra manter a coordenação de vistorias funcionando
              enquanto você trabalha.
            </p>

            <div className="mt-5 w-full space-y-3">
              {PONTOS.map((p) => (
                <div key={p.texto} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-brand-emerald">
                    <p.icon className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <p className="text-[12px] leading-relaxed text-white/70">{p.texto}</p>
                </div>
              ))}
            </div>

            <p className="mt-5 text-center text-[11px] text-white/40">
              Na próxima tela, escolha &quot;Permitir o tempo todo&quot; pra
              habilitar o rastreio em segundo plano.
            </p>

            <button
              type="button"
              onClick={confirmar}
              className="mt-4 flex h-[40px] w-full items-center justify-center gap-2 rounded-[9px] bg-brand-emerald px-5 text-[15px] font-bold tracking-tight text-[#073B4C] shadow-[0_14px_36px_rgba(6,214,160,0.30),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-brand-emerald/40 transition hover:brightness-105 active:scale-[0.985]"
            >
              Entendi, continuar
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
