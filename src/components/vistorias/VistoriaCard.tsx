"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, MapPin, Wrench } from "lucide-react";
import type { Vistoria } from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { formatDistanceKm } from "@/utils/format";

// Sob basePath (/app), assets estaticos precisam do prefixo manual senao o
// browser pede a imagem na origin raiz e toma 404. Ver [[basepath-raw-fetch-bug]]
// (mesmo achado já documentado em MapView.tsx pros pins de status).
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

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
  const handleClick = (e: React.MouseEvent) => {
    if (onSelect) {
      e.preventDefault();
      onSelect(vistoria);
    }
  };
  const isRepetidor = vistoria.fields?.equipamentofield === "Repetidor";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.99 }}
    >
      <Link
        href={`/vistoria?id=${vistoria.id}`}
        onClick={handleClick}
        className="block"
      >
        <Card
          className={`relative overflow-hidden p-0 ${
            highlighted ? "ring-2 ring-brand-emerald/60" : ""
          }`}
        >
          {/* Hero image do equipamento (DCU/Repetidor) — puramente visual,
              2026-10-02. As imagens já vêm com fade branco→foto embutido;
              object-position "right" garante que o equipamento (sempre no
              lado direito da imagem-fonte) nunca saia do corte, mesmo em
              cards baixos. overflow-hidden do Card acima já recorta nos
              cantos arredondados, sem precisar replicar o raio aqui. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[38%] min-w-[108px] max-w-[190px]">
            <img
              src={isRepetidor ? `${BASE_PATH}/repetidor.png` : `${BASE_PATH}/dcu.png`}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: "right center" }}
              loading="lazy"
            />
            {/* Reforço do blend com o fundo branco do conteúdo — a imagem já
                tem fade embutido, mas o recorte (object-fit) pode reduzi-lo;
                esse gradiente garante a transição suave em qualquer card. */}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to right, #fff 0%, rgba(255,255,255,0) 40%)" }}
            />
            {vistoria.online && (
              <span className="absolute right-2 top-2 flex h-2.5 w-2.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand-emerald/60" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-brand-emerald ring-2 ring-white" />
              </span>
            )}
          </div>

          <div className="relative flex gap-2.5 p-3.5">
            <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
            <div className="min-w-0 flex-1 pr-[30%]">
              <div className="flex items-center gap-2">
                <StatusBadge status={vistoria.status} />
                <PriorityBadge priority={vistoria.prioridade} />
                {isRepetidor && <Badge tone="blue">Repetidor</Badge>}
              </div>
              <h3 className="mt-1.5 truncate text-[15px] font-semibold tracking-tight text-ink">
                {vistoria.equipamento}
              </h3>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {vistoria.cidade}
                  {vistoria.estado ? ` · ${vistoria.estado}` : ""}
                </span>
                {vistoria.distanciaKm != null && (
                  <span className="ml-auto shrink-0 whitespace-nowrap font-medium text-ink">
                    {formatDistanceKm(vistoria.distanciaKm)}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="truncate text-[11px] uppercase tracking-[0.12em] text-ink-muted">
                  GLPI · {vistoria.glpiId}
                </span>
              </div>
            </div>
          </div>
          <ChevronRight className="absolute right-2.5 top-3 h-5 w-5 text-ink-muted" />
        </Card>
      </Link>
    </motion.div>
  );
}
