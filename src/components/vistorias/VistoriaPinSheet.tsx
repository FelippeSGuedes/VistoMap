"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Building2,
  MapPin,
  Navigation,
  Play,
  User,
  X,
} from "lucide-react";
import type { Vistoria } from "@/types";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { openNavigation } from "@/services/maps";
import { vistoriasService } from "@/services/vistorias";

interface VistoriaPinSheetProps {
  vistoria: Vistoria | null;
  open: boolean;
  onClose: () => void;
  onStart: (vistoria: Vistoria) => void;
}

export function VistoriaPinSheet({
  vistoria,
  open,
  onClose,
  onStart,
}: VistoriaPinSheetProps) {
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) setStarting(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const handleStart = async () => {
    if (!vistoria) return;
    setStarting(true);
    try {
      await vistoriasService.iniciarVistoria(vistoria.id);
      onStart(vistoria);
    } finally {
      setStarting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && vistoria && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-brand-deep/35 backdrop-blur-[2px]"
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
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-12 rounded-full bg-brand-steel" />
            </div>

            <header className="flex items-start justify-between gap-3 px-5 pb-1 pt-3">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                  GLPI · {vistoria.glpiId}
                </span>
                <h3 className="mt-0.5 truncate text-[17px] font-semibold tracking-tight text-ink">
                  {vistoria.equipamento}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={vistoria.status} />
                  <PriorityBadge priority={vistoria.prioridade} />
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

            <section className="space-y-2 px-5 py-4">
              <Row icon={<Building2 className="h-4 w-4" />} label="Município">
                {vistoria.cidade || "—"}
                {vistoria.estado ? ` · ${vistoria.estado}` : ""}
              </Row>
              {vistoria.endereco && (
                <Row icon={<MapPin className="h-4 w-4" />} label="Endereço">
                  {vistoria.endereco}
                </Row>
              )}
              <Row icon={<User className="h-4 w-4" />} label="Técnico">
                {vistoria.tecnico?.nome || "—"}
              </Row>
            </section>

            <div className="grid grid-cols-2 gap-2.5 px-5 pb-4 pt-1">
              <Button
                variant="outline"
                size="lg"
                leftIcon={<Navigation className="h-4 w-4" />}
                onClick={() =>
                  openNavigation(vistoria.latitude, vistoria.longitude)
                }
              >
                Navegar
              </Button>
              <Button
                size="lg"
                loading={starting}
                leftIcon={<Play className="h-4 w-4" />}
                onClick={handleStart}
              >
                Iniciar Vistoria
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-brand-ice/70 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-brand-deep shadow-soft">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-ink">{children}</p>
      </div>
    </div>
  );
}
