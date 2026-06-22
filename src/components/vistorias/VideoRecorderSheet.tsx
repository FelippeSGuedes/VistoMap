"use client";

/**
 * Gravador de vídeo LEVE pro passo 360 — resolve a sync de 20-30 min.
 *
 * Em vez da câmera do sistema (que grava em alta, sem controle), grava via
 * MediaRecorder com resolução/bitrate baixos e auto-parada em MAX_SECONDS.
 * Resultado: arquivo pequeno (~poucos MB) → sync rápida.
 *
 * Fallback: se getUserMedia/MediaRecorder falhar (ex.: permissão de câmera no
 * WebView), o botão "Usar câmera do sistema" chama o fluxo antigo (onFallback).
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Circle, Square, X, Camera, AlertTriangle } from "lucide-react";

const MAX_SECONDS = 15;
const VIDEO_BITRATE = 1_200_000; // ~1.2 Mbps
const AUDIO_BITRATE = 64_000;

function pickMime(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
    { mime: "video/mp4", ext: "mp4" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return null;
}

interface VideoRecorderSheetProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  /** Fallback pra câmera nativa do sistema (input capture). */
  onFallback: () => void;
}

export function VideoRecorderSheet({
  open,
  onClose,
  onCapture,
  onFallback,
}: VideoRecorderSheetProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Abre a câmera quando o sheet abre.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    setReady(false);
    setRecording(false);
    setSecs(0);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !pickMime()) {
          throw new Error("unsupported");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 854 },
            height: { ideal: 480 },
            frameRate: { ideal: 24 },
          },
          audio: true,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch {
        setError(
          "Não foi possível abrir a câmera aqui. Use a câmera do sistema."
        );
      }
    })();

    return () => {
      alive = false;
      stopStream();
    };
  }, [open]);

  const startRec = () => {
    const stream = streamRef.current;
    const picked = pickMime();
    if (!stream || !picked) return;
    chunksRef.current = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, {
        mimeType: picked.mime,
        videoBitsPerSecond: VIDEO_BITRATE,
        audioBitsPerSecond: AUDIO_BITRATE,
      });
    } catch {
      setError("Falha ao iniciar gravação. Use a câmera do sistema.");
      return;
    }
    recorderRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: picked.mime });
      stopStream();
      const file = new File([blob], `video360.${picked.ext}`, {
        type: picked.mime,
      });
      onCapture(file);
    };
    rec.start();
    setRecording(true);
    setSecs(0);
    timerRef.current = window.setInterval(() => {
      setSecs((s) => {
        const next = s + 1;
        if (next >= MAX_SECONDS) stopRec();
        return next;
      });
    }, 1000);
  };

  const stopRec = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    try {
      recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
  };

  const pct = Math.min(100, (secs / MAX_SECONDS) * 100);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[130] flex flex-col bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* preview */}
          <div className="relative flex-1 overflow-hidden">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            {/* topo */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
              <span className="rounded-full bg-black/50 px-3 py-1 text-[12px] font-semibold text-white">
                {recording ? `● ${secs}s / ${MAX_SECONDS}s` : "Vídeo 360 · baixa resolução"}
              </span>
              <button
                type="button"
                onClick={() => {
                  stopStream();
                  onClose();
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* barra de progresso da gravação */}
            {recording && (
              <div className="absolute inset-x-0 top-0 h-1 bg-white/20">
                <div className="h-full bg-red-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-400" />
                <p className="text-sm text-white/90">{error}</p>
              </div>
            )}
          </div>

          {/* controles */}
          <div className="flex items-center justify-center gap-6 bg-black px-6 pb-[max(env(safe-area-inset-bottom),20px)] pt-5">
            {!error ? (
              !recording ? (
                <button
                  type="button"
                  onClick={startRec}
                  disabled={!ready}
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white disabled:opacity-40"
                  aria-label="Gravar"
                >
                  <Circle className="h-12 w-12 fill-red-500 text-red-500" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRec}
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white"
                  aria-label="Parar"
                >
                  <Square className="h-9 w-9 fill-red-500 text-red-500" />
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => {
                  stopStream();
                  onClose();
                  onFallback();
                }}
                className="flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-[15px] font-bold text-black"
              >
                <Camera className="h-5 w-5" />
                Usar câmera do sistema
              </button>
            )}
          </div>

          {!error && !recording && (
            <button
              type="button"
              onClick={() => {
                stopStream();
                onClose();
                onFallback();
              }}
              className="absolute bottom-[calc(env(safe-area-inset-bottom)+96px)] left-1/2 -translate-x-1/2 text-[12px] font-medium text-white/60 underline-offset-2 hover:underline"
            >
              Usar câmera do sistema
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
