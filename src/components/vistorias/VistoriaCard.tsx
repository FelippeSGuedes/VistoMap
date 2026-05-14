"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, MapPin, Navigation, Wrench } from "lucide-react";
import type { Vistoria } from "@/types";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { formatDistanceKm } from "@/utils/format";
import { openNavigation } from "@/services/maps";

interface VistoriaCardProps {
  vistoria: Vistoria;
  onSelect?: (vistoria: Vistoria) => void;
  highlighted?: boolean;
}

export function VistoriaCard({
  vistoria,
  onSelect,
  highlighted,
}: VistoriaCardProps) {
  const handleNavigate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openNavigation(vistoria.latitude, vistoria.longitude);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (onSelect) {
      e.preventDefault();
      onSelect(vistoria);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.99 }}
    >
      <Link
        href={`/vistorias/${vistoria.id}`}
        onClick={handleClick}
        className="block"
      >
        <Card
          className={`relative overflow-hidden p-0 ${
            highlighted ? "ring-2 ring-brand-emerald/60" : ""
          }`}
        >
          <div className="flex gap-3 p-3.5">
            <div className="relative flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-deep/8">
              {vistoria.thumbnailUrl ? (
                <img
                  src={vistoria.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <Wrench className="h-7 w-7 text-brand-deep" />
              )}
              {vistoria.online && (
                <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-brand-emerald/60" />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-brand-emerald" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StatusBadge status={vistoria.status} />
                <PriorityBadge priority={vistoria.prioridade} />
              </div>
              <h3 className="mt-1.5 truncate text-[15px] font-semibold tracking-tight text-ink">
                {vistoria.equipamento}
              </h3>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate">
                  {vistoria.cidade}
                  {vistoria.estado ? ` · ${vistoria.estado}` : ""}
                </span>
                {vistoria.distanciaKm != null && (
                  <span className="ml-auto whitespace-nowrap font-medium text-ink">
                    {formatDistanceKm(vistoria.distanciaKm)}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] uppercase tracking-[0.12em] text-ink-muted">
                  GLPI · {vistoria.glpiId}
                </span>
                <button
                  type="button"
                  onClick={handleNavigate}
                  className="flex h-8 items-center gap-1 rounded-full bg-brand-emerald/12 px-3 text-[12px] font-semibold text-brand-emerald transition hover:bg-brand-emerald/20"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Navegar
                </button>
              </div>
            </div>
            <ChevronRight className="mt-2 h-5 w-5 self-start text-ink-muted" />
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
