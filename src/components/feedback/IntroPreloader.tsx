"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const INTRO_KEY = "vm_intro_v1";
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const MAX_MS = 12_000;

export function IntroPreloader() {
  const [visible, setVisible] = useState(false);
  const [done, setDone]       = useState(false);
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!localStorage.getItem(INTRO_KEY)) setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    localStorage.setItem(INTRO_KEY, "1");
    setDone(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    timerRef.current = setTimeout(dismiss, MAX_MS);
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => {
      v.play().catch(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(dismiss, 3_000);
      });
    };
    if (v.readyState >= 3) tryPlay();
    else v.addEventListener("canplay", tryPlay, { once: true });
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
          className="fixed inset-0 z-[9999] overflow-hidden bg-black"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          {/* Vídeo preenche exatamente o fixed container — sem wrapper extra */}
          <video
            ref={videoRef}
            src={`${BP}/preloader.mp4`}
            muted
            playsInline
            onEnded={dismiss}
            onError={dismiss}
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* Cobre marca d'água no canto inferior direito */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 right-0"
            style={{
              width: "clamp(160px, 35vw, 280px)",
              height: "clamp(60px, 12vh, 100px)",
              background: "linear-gradient(225deg, transparent 20%, rgba(0,0,0,0.88) 55%, #000 100%)",
            }}
          />

          {/* Botão pular */}
          <button
            type="button"
            onClick={dismiss}
            className="absolute bottom-[max(env(safe-area-inset-bottom),20px)] right-5 z-10 rounded-2xl bg-white/20 px-5 py-2.5 text-[13px] font-semibold text-white backdrop-blur-sm transition-opacity active:scale-95"
          >
            Pular →
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
