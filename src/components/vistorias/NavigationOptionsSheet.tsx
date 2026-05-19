"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { ArrowUpRight, Navigation, X } from "lucide-react";
import { buildGoogleMapsUrl, buildWazeUrl } from "@/services/maps";

interface NavigationOptionsSheetProps {
  open: boolean;
  onClose: () => void;
  lat: number;
  lng: number;
  label?: string;
}

interface AppOption {
  id: "waze" | "gmaps";
  name: string;
  tag: string;
  build: (lat: number, lng: number) => string;
  gradient: string;
  icon: React.ReactNode;
}

const APPS: AppOption[] = [
  {
    id: "waze",
    name: "Waze",
    tag: "Trânsito em tempo real",
    build: buildWazeUrl,
    gradient: "from-[#33CCFF] to-[#1A8FFF]",
    icon: <WazeIcon />,
  },
  {
    id: "gmaps",
    name: "Google Maps",
    tag: "Rotas, satélite e Street View",
    build: buildGoogleMapsUrl,
    gradient: "from-[#4285F4] to-[#34A853]",
    icon: <GoogleMapsIcon />,
  },
];

export function NavigationOptionsSheet({
  open,
  onClose,
  lat,
  lng,
  label,
}: NavigationOptionsSheetProps) {
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const handleOpen = (app: AppOption) => {
    const url = app.build(lat, lng);
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-brand-deep/40 backdrop-blur-[3px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 w-full max-w-xl rounded-t-3xl bg-white pb-[max(env(safe-area-inset-bottom),16px)] shadow-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) onClose();
            }}
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-12 rounded-full bg-brand-steel" />
            </div>

            <header className="flex items-start justify-between gap-3 px-5 pb-1 pt-3">
              <div className="flex items-start gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-emerald/15 text-brand-emerald">
                  <Navigation className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-[16px] font-semibold tracking-tight text-ink">
                    Navegar até o ponto
                  </h3>
                  <p className="text-[11px] text-ink-muted">
                    {label
                      ? label
                      : `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-steel/60 text-ink hover:bg-brand-steel"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="grid grid-cols-1 gap-2.5 px-5 py-4">
              {APPS.map((app, i) => (
                <motion.button
                  key={app.id}
                  type="button"
                  onClick={() => handleOpen(app)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.06 }}
                  whileTap={{ scale: 0.985 }}
                  className="group flex items-center gap-3 rounded-2xl border border-brand-steel/60 bg-white px-3.5 py-3 text-left shadow-soft transition hover:border-brand-emerald/40 hover:shadow-elev"
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${app.gradient} text-white shadow-sm`}
                  >
                    {app.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold tracking-tight text-ink">
                      {app.name}
                    </p>
                    <p className="text-[11px] text-ink-muted">{app.tag}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-ink-muted transition group-hover:text-brand-emerald" />
                </motion.button>
              ))}
            </div>

            <p className="px-5 pb-3 text-center text-[10px] text-ink-muted">
              O app abre numa nova aba/aplicativo.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Logos vetoriais simplificadas ────────────────────────────────── */

function WazeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M20.54 8.94c.21 4.5-3.55 8.36-8.04 8.36-1.06 0-2.07-.21-3-.6-.55.55-1.31.9-2.16.9-.83 0-1.59-.34-2.13-.88-.18.39-.58.66-1.05.66-.64 0-1.16-.52-1.16-1.16 0-.42.23-.79.57-.99-.18-.31-.28-.66-.28-1.04 0-.39.11-.75.3-1.07-.39-.99-.59-2.07-.59-3.2C2.99 5.39 6.95 1.5 11.85 1.5c4.86 0 8.69 3.85 8.69 7.44ZM10 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm-5 4.5c0 1.1.9 2 2 2s2-.9 2-2h-4Z" />
    </svg>
  );
}

function GoogleMapsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M12 2C7.86 2 4.5 5.36 4.5 9.5c0 5.25 6.5 11.5 7.05 12.03.26.25.66.25.92 0 .54-.53 7.03-6.78 7.03-12.03C19.5 5.36 16.14 2 12 2Zm0 10.25a2.75 2.75 0 1 1 0-5.5 2.75 2.75 0 0 1 0 5.5Z" />
    </svg>
  );
}
