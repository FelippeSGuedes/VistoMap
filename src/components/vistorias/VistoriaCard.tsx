"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Loader2, MapPin, MapPinned, Navigation, RadioTower } from "lucide-react";
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

/**
 * Camadas do mapa que o card liga/desliga para ESTE equipamento (postes e
 * torres num raio em volta dele). Sem esta prop o card não mostra a linha
 * de ações — é o mesmo card usado em contexto sem mapa.
 */
export interface AcoesMapaCard {
  postesAtivo: boolean;
  postesCarregando?: boolean;
  postesCount?: number | null;
  torresAtivo: boolean;
  torresCount?: number | null;
  onPostes: (vistoria: Vistoria) => void;
  onTorres: (vistoria: Vistoria) => void;
}

interface VistoriaCardProps {
  vistoria: Vistoria;
  onSelect?: (vistoria: Vistoria) => void;
  highlighted?: boolean;
  acoesMapa?: AcoesMapaCard;
}

/** Divisória fina entre os blocos da linha de meta-informação. */
function Sep() {
  return <span aria-hidden className="h-3.5 w-px shrink-0 bg-ink-muted/25" />;
}

/** Botão da linha de ações. Fica FORA do <Link> do card — botão dentro de
 *  link é HTML inválido e, na prática, rouba o toque de navegar. */
function AcaoBotao({
  ativo,
  carregando,
  icone: Icone,
  rotulo,
  contagem,
  desabilitado,
  onClick,
}: {
  ativo: boolean;
  carregando?: boolean;
  icone: typeof MapPinned;
  rotulo: string;
  contagem?: number | null;
  desabilitado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-pressed={ativo}
      className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12px] font-semibold ring-1 ring-inset transition disabled:opacity-40 ${
        ativo
          ? "bg-brand-emerald/12 text-brand-emerald ring-brand-emerald/40"
          : "bg-brand-ice text-ink-muted ring-brand-steel/60"
      }`}
    >
      {carregando ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <Icone className="h-4 w-4 shrink-0" />
      )}
      <span className="truncate">
        {rotulo}
        {ativo && contagem != null && ` (${contagem})`}
      </span>
    </button>
  );
}

export function VistoriaCard({
  vistoria,
  onSelect,
  highlighted,
  acoesMapa,
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

  // Camadas só fazem sentido com coordenada real. O SQL converte coord
  // vazia em 0, então (0,0) = "sem GPS ainda" (o técnico vai ao local
  // marcar) — centrar uma busca aí cairia no meio do Atlântico.
  const semCoord =
    !Number.isFinite(vistoria.latitude) ||
    !Number.isFinite(vistoria.longitude) ||
    (vistoria.latitude === 0 && vistoria.longitude === 0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card
        className={`relative overflow-hidden p-0 ${
          highlighted ? "ring-2 ring-brand-emerald/60" : ""
        }`}
      >
        <Link
          href={`/vistoria?id=${vistoria.id}`}
          onClick={handleClick}
          className="relative block active:opacity-95"
        >
          {/* Hero image do equipamento. O fade pro fundo do card é feito por
              MÁSCARA na própria imagem (não por um branco sobreposto) —
              achado em campo 2026-10-02: sobrepor branco deixava uma emenda
              vertical dura entre o card e a foto. Com máscara, a imagem
              nasce transparente à esquerda e vai ganhando opacidade, então
              não existe borda nenhuma. object-position "right" mantém o
              equipamento sempre dentro do corte; o overflow-hidden do Card
              recorta nos cantos arredondados. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[34%] min-w-[96px] max-w-[172px]">
            <img
              src={tipo === "Repetidor" ? `${BASE_PATH}/repetidor.png` : `${BASE_PATH}/dcu.png`}
              alt=""
              className="h-full w-full object-cover"
              style={{
                objectPosition: "right center",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 38%, rgba(0,0,0,0.8) 68%, #000 100%)",
                maskImage:
                  "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 38%, rgba(0,0,0,0.8) 68%, #000 100%)",
              }}
              loading="lazy"
              decoding="async"
            />
            {vistoria.online && (
              <span className="absolute right-2 top-2 flex h-2.5 w-2.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand-emerald/60" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-brand-emerald ring-2 ring-white" />
              </span>
            )}
          </div>

          <div className="relative p-4 pr-[28%]">
            {/* Identificador principal do equipamento */}
            <h3 className="text-[20px] font-bold leading-none tracking-[-0.015em] text-ink">
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
        </Link>

        {/* Camadas do mapa deste equipamento. Fora do <Link> de propósito:
            botão dentro de link é HTML inválido e o toque vira navegação. */}
        {acoesMapa && (
          <div className="flex gap-2 border-t border-brand-steel/50 px-3 py-2.5">
            <AcaoBotao
              ativo={acoesMapa.postesAtivo}
              carregando={acoesMapa.postesCarregando}
              icone={MapPinned}
              rotulo="Ver postes"
              contagem={acoesMapa.postesCount}
              desabilitado={semCoord}
              onClick={() => acoesMapa.onPostes(vistoria)}
            />
            <AcaoBotao
              ativo={acoesMapa.torresAtivo}
              icone={RadioTower}
              rotulo="Torres próximas"
              contagem={acoesMapa.torresCount}
              desabilitado={semCoord}
              onClick={() => acoesMapa.onTorres(vistoria)}
            />
          </div>
        )}
      </Card>
    </motion.div>
  );
}
