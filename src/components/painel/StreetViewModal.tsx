"use client";

/**
 * StreetViewModal — Street View embutido direto na tela.
 *
 * Precisa de NEXT_PUBLIC_GOOGLE_MAPS_KEY (Maps Embed API, gratuita até um
 * volume alto de uso) pra embutir o iframe. Sem a chave configurada, cai
 * de volta pro link externo do Google Maps (mesmo padrão já usado em
 * "Navegar" — sempre funciona, só abre em outra aba).
 */

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

export function StreetViewModal({
  open,
  lat,
  lng,
  label,
  onClose,
}: {
  open: boolean;
  lat: number;
  lng: number;
  label?: string;
  onClose: () => void;
}) {
  const embedUrl = GOOGLE_MAPS_KEY
    ? `https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_KEY}&location=${lat},${lng}&heading=0&pitch=0&fov=90`
    : null;
  const externalUrl = `https://www.google.com/maps?layer=c&cbll=${lat},${lng}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-2xl overflow-hidden rounded-2xl"
            style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--vm-border-soft)" }}>
              <p className="text-[13px] font-bold" style={{ color: "var(--vm-text)" }}>
                Street View {label ? `· ${label}` : ""}
              </p>
              <button type="button" onClick={onClose} style={{ color: "var(--vm-faint)" }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {embedUrl ? (
              <iframe
                src={embedUrl}
                className="h-[420px] w-full"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                <p className="text-[13px]" style={{ color: "var(--vm-muted)" }}>
                  Street View embutido precisa de uma chave do Google Maps configurada
                  (<code className="text-[11.5px]">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code>).
                </p>
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white transition hover:brightness-110"
                  style={{ background: "#4285F4" }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir Street View no Google Maps
                </a>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
