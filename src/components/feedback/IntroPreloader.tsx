"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Incrementar esta chave força todos os usuários (incluindo instalados) a ver
// o preloader novamente na próxima abertura do app.
const INTRO_KEY = "vm_intro_v1";
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function IntroPreloader() {
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const seen = localStorage.getItem(INTRO_KEY);
    if (!seen) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(INTRO_KEY, "1");
    setDone(true);
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[9999] bg-black"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
        >
          {/* overflow:hidden + scale(1.08) recorta as bordas do vídeo,
              escondendo qualquer marca d'água de canto gerada pela IA. */}
          <div className="relative h-full w-full overflow-hidden">
            <video
              ref={videoRef}
              src={`${BP}/preloader.mp4`}
              autoPlay
              muted
              playsInline
              onEnded={dismiss}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: "scale(1.09)", transformOrigin: "center center" }}
            />

            {/* Gradiente extra cobrindo canto inferior direito (onde ficam
                marcas d'água do Gemini / CapCut / etc.). */}
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 right-0"
              style={{
                width: 220,
                height: 80,
                background:
                  "linear-gradient(135deg, transparent 0%, rgba(0,0,0,0.92) 55%, rgba(0,0,0,0.98) 100%)",
              }}
            />
          </div>

          {/* Botão pular — fica acima da área safe do iOS */}
          <button
            type="button"
            onClick={dismiss}
            className="absolute bottom-[max(env(safe-area-inset-bottom),1.25rem)] right-5 z-10 rounded-2xl bg-white/20 px-5 py-2.5 text-xs font-semibold text-white backdrop-blur-md transition active:scale-95"
          >
            Pular →
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
