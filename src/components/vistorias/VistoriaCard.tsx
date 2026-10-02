"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, MapPin, Navigation, Wrench } from "lucide-react";
import type { Vistoria } from "@/types";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "./StatusBadge";
import { formatDistanceKm } from "@/utils/format";
import { TIPO_COR, TIPO_ICONE, TIPO_LABEL, tipoEquipamento } from "@/lib/equipamentoTipo";

// Sob basePath (/app), assets estaticos precisam do prefixo manual senao o
// browser pede a imagem na origin raiz e toma 404. Ver [[basepath-raw-fetch-bug]]
// (mesmo achado já documentado em MapView.tsx pros pins de status).
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** `estado` vem fixo como "São Paulo" (lib/glpi/equipments.ts) — abreviar
 *  libera espaço pro nome da cidade aparecer inteiro, nunca truncado. */
const UF: Record<string, string> = { "São Paulo": "SP" };

interface VistoriaCardProps {
  vistoria: Vistoria;
  onSelect?: (vistoria: Vistoria) => void;
  highlighted?: boolean;
}

/** Divisória fina entre os blocos da linha de meta-informação. */
function Sep() {
  return <span aria-hidden className="h-3.5 w-px shrink-0 bg-ink-muted/25" />;
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

  const tipo = tipoEquipamento(vistoria);
  const TipoIcone = TIPO_ICONE[tipo];
  const estado = vistoria.estado ? UF[vistoria.estado] ?? vistoria.estado : null;

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
          {/* Hero image do equipamento — as imagens já vêm com fade
              branco→foto embutido; object-position "right" mantém o
              equipamento sempre dentro do corte. O overflow-hidden do Card
              recorta nos cantos arredondados, sem replicar o raio aqui. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[32%] min-w-[92px] max-w-[164px]">
            <img
              src={tipo === "Repetidor" ? `${BASE_PATH}/repetidor.png` : `${BASE_PATH}/dcu.png`}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: "right center" }}
              loading="lazy"
            />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to right, #fff 0%, rgba(255,255,255,0) 45%)" }}
            />
            {vistoria.online && (
              <span className="absolute right-2 top-2 flex h-2.5 w-2.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand-emerald/60" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-brand-emerald ring-2 ring-white" />
              </span>
            )}
          </div>

          <div className="relative p-4 pr-[28%]">
            <Wrench className="h-4 w-4 text-ink-muted/70" />

            {/* Identificador principal do equipamento */}
            <h3 className="mt-2 text-[20px] font-bold leading-none tracking-[-0.015em] text-ink">
              {vistoria.equipamento}
            </h3>

            {/* Cidade — sem nada competindo na mesma linha, pra nunca truncar */}
            <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>
                {vistoria.cidade}
                {estado ? ` · ${estado}` : ""}
              </span>
            </div>

            {/* Status | tipo | distância */}
            <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
              <StatusBadge status={vistoria.status} />

              <Sep />
              <span
                className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide"
                style={{ color: TIPO_COR[tipo] }}
              >
                <TipoIcone className="h-4 w-4" strokeWidth={2.1} />
                {TIPO_LABEL[tipo]}
              </span>

              {vistoria.distanciaKm != null && (
                <>
                  <Sep />
                  <span className="flex shrink-0 items-start gap-1.5">
                    <Navigation className="mt-[3px] h-3.5 w-3.5 shrink-0 text-ink-muted" />
                    <span className="leading-tight">
                      <span className="block text-[13px] font-semibold text-ink">
                        {formatDistanceKm(vistoria.distanciaKm)}
                      </span>
                      <span className="block text-[10px] text-ink-muted">de distância</span>
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>

          <ChevronRight className="absolute right-2.5 top-3.5 h-5 w-5 text-ink-muted" />
        </Card>
      </Link>
    </motion.div>
  );
}
