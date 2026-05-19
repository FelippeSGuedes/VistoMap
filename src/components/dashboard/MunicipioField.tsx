"use client";

/**
 * MunicipioField — card horizontal premium do dashboard que apresenta os
 * municípios ativos da rota operacional do técnico (segundo a última
 * sincronização do backend).
 *
 * Layout horizontal cinematográfico inspirado em Stripe Dashboard / Arc /
 * Linear:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ [icon] Municípios de Vistoria         │      panorama image │
 *   │ De acordo com a última sincronização. │      (fade orgânico)│
 *   │                                       │                     │
 *   │ ┌──────────────────────────────────┐  │                     │
 *   │ │ MUNICÍPIO A VISTORIAR            │  │                     │
 *   │ │ Campinas, Valinhos e Vinhedo     │  │                     │
 *   │ │ [📅 HOJE • 14 MAI] [✓ 12 VST]    │  │                     │
 *   │ └──────────────────────────────────┘  │                     │
 *   │ ─────────────────────────────────────────────────────────── │
 *   │ ⟳ Última sincronização   ▌▌ Sincronizado                   │
 *   │   Hoje, 08:40              Tudo atualizado                 │
 *   └─────────────────────────────────────────────────────────────┘
 */

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  MapPin,
  RefreshCcw,
} from "lucide-react";
import { useState } from "react";
import type { MunicipioOperacional } from "@/types";

interface MunicipioFieldProps {
  municipios?: MunicipioOperacional[];
  ultimaSincronizacao?: string;
  loading?: boolean;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDataBadge(d: Date): string {
  // 14 MAI / 22 JUN — sempre 2 dígitos no dia + mês abreviado em caixa alta.
  const meses = [
    "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
    "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
  ];
  return `${String(d.getDate()).padStart(2, "0")} ${meses[d.getMonth()]}`;
}

/**
 * Junta a lista de municípios em uma string elegante:
 *   ["Campinas"] → "Campinas"
 *   ["Campinas","Valinhos"] → "Campinas e Valinhos"
 *   ["Campinas","Valinhos","Vinhedo"] → "Campinas, Valinhos e Vinhedo"
 *   ["Campinas","Valinhos","Vinhedo","Itatiba","Jundiaí"] → "Campinas, Valinhos, Vinhedo +2"
 */
function joinMunicipios(nomes: string[]): string {
  if (nomes.length === 0) return "—";
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  if (nomes.length === 3) return `${nomes[0]}, ${nomes[1]} e ${nomes[2]}`;
  return `${nomes[0]}, ${nomes[1]}, ${nomes[2]} +${nomes.length - 3}`;
}

export function MunicipioField({
  municipios = [],
  ultimaSincronizacao,
  loading = false,
}: MunicipioFieldProps) {
  const router = useRouter();
  const [imgOk, setImgOk] = useState(true);

  const nomes = municipios.map((m) => m.nome);
  const totalVistorias = municipios.reduce((s, m) => s + m.totalVistorias, 0);
  const dataBadge = fmtDataBadge(new Date());
  const syncSubtitulo = ultimaSincronizacao
    ? isToday(ultimaSincronizacao)
      ? `Hoje, ${fmtHora(ultimaSincronizacao)}`
      : new Date(ultimaSincronizacao).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        }) + `, ${fmtHora(ultimaSincronizacao)}`
    : "—";

  // Clicar em qualquer município → filtra mapa por nome.
  const onTapMunicipio = (nome: string) => {
    const params = new URLSearchParams({ municipio: nome });
    router.push(`/vistorias?${params.toString()}`);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 0.7, 0.2, 1] }}
      className="relative overflow-hidden"
      style={{
        borderRadius: 22,
        // Sem background sólido: a imagem é o fundo do card.
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.6) inset, " +
          "0 0 0 1px rgba(6,59,59,0.06), " +
          "0 8px 24px rgba(6,59,59,0.07), " +
          "0 3px 8px rgba(6,59,59,0.04)",
      }}
    >
      {/* ── PANORAMA COMO FUNDO DO CARD INTEIRO — opacidade suave ─────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ zIndex: 0 }}
      >
        {imgOk ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="/municipio.png"
            alt=""
            className="absolute inset-0 h-full w-full"
            style={{
              objectFit: "cover",
              objectPosition: "center 40%",
              opacity: 1,
              filter:
                "saturate(1.22) contrast(1.1) brightness(1.06) hue-rotate(-2deg)",
            }}
            onError={() => setImgOk(false)}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, #E8F4F1 0%, #D2EAE3 60%, #B6DCD0 100%)",
              opacity: 0.62,
            }}
          />
        )}
        {/* warm highlight superior — ilumina a cidade */}
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full blur-[44px]"
          style={{ background: "rgba(255,210,140,0.18)" }}
        />
      </div>

      {/* ── WASH BRANCO HORIZONTAL — termina alinhado com o subcard ───
          A "jogada": o branco vai denso até ~62%, faz fade orgânico até
          78% (mesma borda direita do subcard via w-[78%] do content) e
          some até 95%. Resultado: coluna de leitura clara à esquerda +
          banner panorâmico vivo à direita. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 1,
          background:
            "linear-gradient(to right, " +
              "rgba(247,249,251,0.92) 0%, " +
              "rgba(247,249,251,0.86) 40%, " +
              "rgba(247,249,251,0.65) 62%, " +
              "rgba(247,249,251,0.22) 78%, " +
              "transparent 95%)",
        }}
      />

      {/* ── CONTEÚDO ───────────────────────────────────────────────── */}
      <div
        className="relative z-10 flex flex-col gap-2 p-3"
        style={{ width: "78%" }}
      >
        {/* TOPO: título + subtítulo */}
        <header className="flex items-start gap-1.5">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
            style={{
              background:
                "linear-gradient(135deg, rgba(0,179,136,0.16) 0%, rgba(0,179,136,0.08) 100%)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.6) inset, 0 2px 6px rgba(0,179,136,0.12)",
              color: "#00B388",
            }}
          >
            <MapPin className="h-3 w-3" strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1">
            <h3
              className="text-[11px] font-semibold leading-tight tracking-[-0.1px]"
              style={{ color: "#063B3B" }}
            >
              Municípios de Vistoria
            </h3>
            <p
              className="text-[8.5px] font-medium leading-tight"
              style={{ color: "#7A8896" }}
            >
              De acordo com a última sincronização.
            </p>
          </div>
        </header>

        {/* SUBCARD MunicipioField — destaque principal */}
        {/* Subcard mais curto, com fade orgânico sumindo à direita */}
        <div className="relative" style={{ width: "78%" }}>
          {/* Halo teal sutil — "contaminação" no banner */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -inset-3 rounded-[22px]"
            style={{
              background:
                "radial-gradient(ellipse 70% 100% at 35% 50%, rgba(0,200,150,0.18) 0%, rgba(0,200,150,0.06) 55%, transparent 80%)",
              filter: "blur(18px)",
              zIndex: 0,
            }}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.button
            type="button"
            onClick={() => municipios[0] && onTapMunicipio(municipios[0].nome)}
            disabled={loading || municipios.length === 0}
            whileTap={{ scale: 0.985 }}
            className="group relative z-10 w-full overflow-hidden rounded-[14px] py-2.5 pl-2.5 text-left transition-all"
            style={{
              paddingRight: "44px",
              // Bg gradient + mask-image — fade ultra-suave sem "linha".
              background:
                "linear-gradient(135deg, #042F2E 0%, #054640 55%, #064E4A 100%)",
              boxShadow:
                "0 8px 22px rgba(4,47,46,0.16), " +
                "0 3px 8px rgba(4,47,46,0.08)",
              WebkitMaskImage:
                "linear-gradient(to right, black 0%, black 55%, rgba(0,0,0,0.85) 72%, rgba(0,0,0,0.5) 86%, transparent 100%)",
              maskImage:
                "linear-gradient(to right, black 0%, black 55%, rgba(0,0,0,0.85) 72%, rgba(0,0,0,0.5) 86%, transparent 100%)",
            }}
          >
            {/* glow esmeralda interno, animado — contido no lado opaco */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -left-6 -top-6 h-20 w-20 rounded-full blur-[22px]"
              style={{ background: "rgba(0,200,150,0.22)" }}
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* label uppercase */}
            <p
              className="relative text-[7px] font-semibold uppercase"
              style={{
                color: "#5EFFD9",
                letterSpacing: "0.2em",
              }}
            >
              Município a vistoriar
            </p>

            {/* nome do município — destaque */}
            <div className="relative mt-[2px]">
              {loading ? (
                <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
              ) : (
                <h2
                  className="text-[12px] font-semibold leading-[1.15] tracking-[-0.2px] text-white"
                  style={{
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {joinMunicipios(nomes)}
                </h2>
              )}
            </div>

            {/* Badges operacionais */}
            <div className="relative mt-1.5 flex flex-wrap items-center gap-1">
              <Badge icon={<CalendarDays className="h-2 w-2" />}>
                HOJE • {dataBadge}
              </Badge>
              <Badge icon={<ClipboardCheck className="h-2 w-2" />}>
                {totalVistorias} VST
              </Badge>
            </div>
          </motion.button>
        </div>

        {/* SEÇÃO SYNC — ultra compacta */}
        <div className="relative flex items-center gap-1.5">
          <SyncBlock
            icon={<RefreshCcw className="h-[10px] w-[10px]" />}
            label="Última sync"
            value={syncSubtitulo}
          />
          <span
            aria-hidden
            className="h-3 w-px shrink-0"
            style={{ background: "rgba(6,59,59,0.1)" }}
          />
          <SyncBlock
            icon={<Activity className="h-[10px] w-[10px]" style={{ color: "#00B388" }} />}
            label="Status"
            value="Atualizado"
            valueColor="#00875F"
            dot
          />
        </div>
      </div>
    </motion.section>
  );
}

/* ── Sub-componentes ────────────────────────────────────────────────── */

function Badge({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-[3px] rounded-full px-[6px] py-[2px] text-[8px] font-semibold uppercase"
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.14)",
        color: "rgba(255,255,255,0.9)",
        letterSpacing: "0.12em",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <span style={{ color: "#5EFFD9" }}>{icon}</span>
      {children}
    </span>
  );
}

function SyncBlock({
  icon,
  label,
  value,
  valueColor = "#063B3B",
  dot = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  dot?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]"
        style={{
          background: "rgba(6,59,59,0.06)",
          color: "#7A8896",
        }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-[7px] font-semibold uppercase leading-none"
          style={{ color: "#8896A2", letterSpacing: "0.08em" }}
        >
          {label}
        </p>
        <p
          className="mt-[1px] flex items-center gap-[3px] truncate text-[9.5px] font-semibold leading-none tracking-tight"
          style={{ color: valueColor }}
        >
          {dot && (
            <span
              aria-hidden
              className="h-[5px] w-[5px] rounded-full"
              style={{
                background: valueColor,
                boxShadow: `0 0 0 1.5px ${valueColor}33`,
              }}
            />
          )}
          {value}
        </p>
      </div>
    </div>
  );
}
