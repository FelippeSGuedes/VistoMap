"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const INTRO_KEY = "vm_intro_v1";
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Tempo máximo antes de auto-pular (cobre: falha de rede, autoplay bloqueado,
// Capacitor WebView sem permissão de mídia).
const MAX_DURATION_MS = 12_000;

export function IntroPreloader() {
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const seen = localStorage.getItem(INTRO_KEY);
    if (!seen) setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    localStorage.setItem(INTRO_KEY, "1");
    setDone(true);
  }, []);

  // Ao ficar visível: tenta reproduzir manualmente (necessário no Capacitor
  // WebView onde autoPlay não garante execução) e arma timer de segurança.
  useEffect(() => {
    if (!visible) return;

    // Timer de segurança: pula se o vídeo não iniciar em 12s
    timerRef.current = setTimeout(dismiss, MAX_DURATION_MS);

    const v = videoRef.current;
    if (!v) return;

    const tryPlay = () => {
      v.play().catch(() => {
        // Autoplay bloqueado pelo browser/WebView: descarta após 3s
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(dismiss, 3_000);
      });
    };

    if (v.readyState >= 3) {
      tryPlay();
    } else {
      v.addEventListener("canplay", tryPlay, { once: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      v.removeEventListener("canplay", tryPlay);
    };
  }, [visible, dismiss]);

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
          <div className="relative h-full w-full overflow-hidden">
            <video
              ref={videoRef}
              src={`${BP}/preloader.mp4`}
              muted
              playsInline
              onEnded={dismiss}
              onError={dismiss}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: "scale(1.09)", transformOrigin: "center center" }}
            />

            {/* Cobre marca d'água no canto inferior direito */}
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

          {/* Botão pular — sempre visível, safe-area iOS */}
          <button
            type="button"
            onClick={dismiss}
            className="absolute bottom-[max(env(safe-area-inset-bottom),1.25rem)] right-5 z-10 rounded-2xl bg-white/25 px-5 py-3 text-sm font-semibold text-white backdrop-blur-md transition active:scale-95"
          >
            Pular →
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
