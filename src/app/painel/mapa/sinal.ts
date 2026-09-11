/**
 * "Sinal" — linguagem visual dos equipamentos no mapa (2026-09-11).
 *
 * O marcador carrega DOIS canais que nunca se confundem:
 *
 *   anel externo  → QUEM é o responsável (cor de identidade do técnico,
 *                   paleta neutra e fixa — ver lib/glpi/tecnicoIdentidade.ts);
 *   miolo + glifo → EM QUE ESTADO está a vistoria (5 famílias de cor, não 10).
 *
 * As 10 situações operacionais continuam existindo e sendo filtráveis; o que
 * mudou é que a COR agrupa em famílias e o GLIFO desempata dentro da família.
 * Dez cores de status competiam com a cor do técnico e nenhuma das duas
 * leituras funcionava.
 *
 * Renderização no Mapbox (pensada pra 10 mil pontos):
 *   - o anel é uma camada de CÍRCULOS com a cor vinda do dado (fill branco +
 *     stroke na cor de identidade) — custo mínimo, nada de gerar imagem por
 *     técnico;
 *   - o miolo/glifo é um sprite de canvas, 10 situações × 2 (com e sem o selo
 *     de revisita) = 20 imagens fixas registradas uma vez por estilo.
 */

import type { Map as MapboxMap } from "mapbox-gl";
import type { SituacaoOperacional } from "@/types/painel-mapa";

/* ─── famílias de status ──────────────────────────────────────────────────── */

export type FamiliaSinal = "pendente" | "ativo" | "concluido" | "problema" | "fora";

export const FAMILIA_COR: Record<FamiliaSinal, string> = {
  pendente: "#F97316",
  ativo: "#3B82F6",
  concluido: "#00B388",
  problema: "#DC2626",
  fora: "#6B7280",
};

export const FAMILIA_LABEL: Record<FamiliaSinal, string> = {
  pendente: "Pendente",
  ativo: "Ativo",
  concluido: "Concluído",
  problema: "Problema",
  fora: "Fora",
};

export const FAMILIA_ORDEM: FamiliaSinal[] = ["pendente", "ativo", "concluido", "problema", "fora"];

/** Descrição curta de cada família — usada na legenda flutuante. */
export const FAMILIA_DESCRICAO: Record<FamiliaSinal, string> = {
  pendente: "A vistoriar, atribuído, ag. revisita",
  ativo: "Em deslocamento, em vistoria, em revisita",
  concluido: "Vistoriado, revisitado",
  problema: "Devolvida pro técnico corrigir",
  fora: "Rejeitada — fora de circulação",
};

type Glifo = "vazio" | "atribuido" | "ponto" | "seta" | "check" | "alerta" | "x";

export const SITUACOES: SituacaoOperacional[] = [
  "A_VISTORIAR",
  "ATRIBUIDO",
  "EM_DESLOCAMENTO",
  "EM_VISTORIA",
  "VISTORIADO",
  "AGUARDANDO_REVISITA",
  "EM_REVISITA",
  "REVISITADO",
  "DEVOLVIDA",
  "REJEITADA",
];

const SINAL: Record<SituacaoOperacional, { familia: FamiliaSinal; glifo: Glifo }> = {
  A_VISTORIAR:         { familia: "pendente",  glifo: "vazio" },
  ATRIBUIDO:           { familia: "pendente",  glifo: "atribuido" },
  AGUARDANDO_REVISITA: { familia: "pendente",  glifo: "vazio" },
  EM_DESLOCAMENTO:     { familia: "ativo",     glifo: "seta" },
  EM_VISTORIA:         { familia: "ativo",     glifo: "ponto" },
  EM_REVISITA:         { familia: "ativo",     glifo: "ponto" },
  VISTORIADO:          { familia: "concluido", glifo: "check" },
  REVISITADO:          { familia: "concluido", glifo: "check" },
  DEVOLVIDA:           { familia: "problema",  glifo: "alerta" },
  REJEITADA:           { familia: "fora",      glifo: "x" },
};

export const SITUACAO_LABEL: Record<SituacaoOperacional, string> = {
  A_VISTORIAR:         "A vistoriar",
  ATRIBUIDO:           "Atribuído",
  EM_DESLOCAMENTO:     "Em deslocamento",
  EM_VISTORIA:         "Em vistoria",
  VISTORIADO:          "Vistoriado",
  AGUARDANDO_REVISITA: "Ag. revisita",
  EM_REVISITA:         "Em revisita",
  REVISITADO:          "Revisitado",
  DEVOLVIDA:           "Devolvida",
  REJEITADA:           "Rejeitada",
};

export function familiaDe(s: string): FamiliaSinal {
  return SINAL[s as SituacaoOperacional]?.familia ?? "fora";
}

/** Cor de STATUS da situação — sempre a cor da família, nunca uma cor própria. */
export function corSituacao(s: string): string {
  return FAMILIA_COR[familiaDe(s)];
}

export function labelSituacao(s: string): string {
  return SITUACAO_LABEL[s as SituacaoOperacional] ?? s;
}

/** Nome do sprite de uma vistoria (o `-r` é o selo de revisita). */
export function iconeDe(situacao: string, revisita: boolean): string {
  const s = SINAL[situacao as SituacaoOperacional] ? situacao : "A_VISTORIAR";
  return `vm-sig-${s}${revisita ? "-r" : ""}`;
}

/** Cor neutra do anel quando a vistoria ainda não tem técnico. */
export const ANEL_SEM_TECNICO = "#B8C0C8";

/* ─── geometria do marcador (espaço lógico de 44px) ───────────────────────── */

/** Raio externo do anel de identidade. */
export const R_EXTERNO = 17;
/** Raio do miolo branco — o "gap" entre anel e núcleo. */
export const R_INTERNO = 14.4;
/** Em ATRIBUÍDO o anel engrossa pra identidade dominar a leitura de longe. */
export const R_INTERNO_ATRIBUIDO = 11.2;

const BOX = 44;
const RATIO = 4;
const TAU = Math.PI * 2;

function desenhaGlifo(ctx: CanvasRenderingContext2D, glifo: Glifo, cor: string) {
  const cx = 22, cy = 22;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  if (glifo === "ponto") {
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, TAU);
    ctx.fill();
  } else if (glifo === "seta") {
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(19.4, 17.6);
    ctx.lineTo(25, 22);
    ctx.lineTo(19.4, 26.4);
    ctx.stroke();
  } else if (glifo === "check") {
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(17.6, 22.3);
    ctx.lineTo(20.6, 25.3);
    ctx.lineTo(26.4, 18.7);
    ctx.stroke();
  } else if (glifo === "alerta") {
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx, 16.8);
    ctx.lineTo(cx, 23);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, 26.6, 1.4, 0, TAU);
    ctx.fill();
  } else if (glifo === "x") {
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(18.6, 18.6);
    ctx.lineTo(25.4, 25.4);
    ctx.moveTo(25.4, 18.6);
    ctx.lineTo(18.6, 25.4);
    ctx.stroke();
  } else if (glifo === "atribuido") {
    // Ponto pequeno na cor do status: o protagonista aqui é o anel grosso.
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, TAU);
    ctx.fillStyle = cor;
    ctx.fill();
  }
}

interface SpriteMapbox {
  width: number;
  height: number;
  data: Uint8Array;
  pixelRatio: number;
}

function makeSinalImage(situacao: SituacaoOperacional, revisita: boolean): SpriteMapbox {
  const px = BOX * RATIO;
  const cvs = document.createElement("canvas");
  cvs.width = px;
  cvs.height = px;
  const ctx = cvs.getContext("2d")!;
  ctx.scale(RATIO, RATIO);
  ctx.imageSmoothingEnabled = true;

  const { familia, glifo } = SINAL[situacao];
  const cor = FAMILIA_COR[familia];
  const cx = 22, cy = 22;

  if (glifo === "vazio") {
    // Pendente sem dono: núcleo oco — pesa menos no mapa que um pin cheio.
    ctx.beginPath();
    ctx.arc(cx, cy, 12.5, 0, TAU);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = cor;
    ctx.stroke();
  } else if (glifo === "atribuido") {
    ctx.beginPath();
    ctx.arc(cx, cy, R_INTERNO_ATRIBUIDO, 0, TAU);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    desenhaGlifo(ctx, glifo, cor);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, 12.5, 0, TAU);
    ctx.fillStyle = cor;
    ctx.fill();
    desenhaGlifo(ctx, glifo, cor);
  }

  if (revisita) {
    // Selo "R" no canto — vale em qualquer família, sem gastar uma cor.
    ctx.beginPath();
    ctx.arc(33, 11, 6.2, 0, TAU);
    ctx.fillStyle = "#111827";
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 8px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("R", 33, 11.4);
  }

  const img = ctx.getImageData(0, 0, px, px);
  return { width: px, height: px, data: new Uint8Array(img.data.buffer), pixelRatio: RATIO };
}

/** Registra as 20 imagens do miolo. Idempotente — roda a cada troca de estilo. */
export function registrarSpritesSinal(map: MapboxMap): void {
  for (const s of SITUACOES) {
    for (const rev of [false, true]) {
      const nome = `vm-sig-${s}${rev ? "-r" : ""}`;
      if (map.hasImage(nome)) continue;
      try {
        map.addImage(nome, makeSinalImage(s, rev), { pixelRatio: RATIO });
      } catch (e) {
        console.warn("[vm] falha ao registrar sprite", nome, e);
      }
    }
  }
}

/* ─── cor ─────────────────────────────────────────────────────────────────── */

/** Clareia (amt > 0) ou escurece (amt < 0) um #RRGGBB. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n)) return hex;
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
