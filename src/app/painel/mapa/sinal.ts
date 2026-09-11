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

export type FamiliaSinal = "pendente" | "ativo" | "concluido" | "problema" | "bloqueado" | "fora";

export const FAMILIA_COR: Record<FamiliaSinal, string> = {
  pendente: "#F97316",
  ativo: "#3B82F6",
  concluido: "#00B388",
  problema: "#DC2626",
  // Âmbar queimado: "travado por fora", não "encerrado". Escuro o bastante
  // pra não ser confundido com o laranja de PENDENTE.
  bloqueado: "#B45309",
  fora: "#6B7280",
};

export const FAMILIA_LABEL: Record<FamiliaSinal, string> = {
  pendente: "Pendente",
  ativo: "Ativo",
  concluido: "Concluído",
  problema: "Problema",
  bloqueado: "Bloqueado",
  fora: "Fora",
};

export const FAMILIA_ORDEM: FamiliaSinal[] = ["pendente", "ativo", "concluido", "problema", "bloqueado", "fora"];

/** Descrição curta de cada família — usada na legenda flutuante. */
export const FAMILIA_DESCRICAO: Record<FamiliaSinal, string> = {
  pendente: "A vistoriar, atribuído, ag. revisita",
  ativo: "Em deslocamento, em vistoria, em revisita",
  concluido: "Vistoriado, revisitado",
  problema: "Devolvida pro técnico corrigir",
  bloqueado: "Impedimento — o acesso travou a vistoria",
  fora: "Recusa — decisão de não executar",
};

type Glifo = "vazio" | "atribuido" | "ponto" | "seta" | "check" | "alerta" | "x" | "barra";

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

/**
 * REJEITADA cobre duas naturezas MUITO diferentes que a situação sozinha não
 * separa — e que o supervisor precisa distinguir de longe:
 *   impedimento → o ambiente travou (condomínio, acesso). Pode destravar.
 *   recusa      → houve decisão (sinal fora do padrão, morador recusou).
 * Por isso existe uma chave sintética só pro desenho; a situação no banco
 * continua sendo uma só, e os filtros continuam com as 10 de sempre.
 */
export type ChaveSinal = SituacaoOperacional | "REJEITADA_IMP";

export function chaveSinal(situacao: string, bloqueio?: string | null): ChaveSinal {
  if (situacao === "REJEITADA" && bloqueio === "impedimento") return "REJEITADA_IMP";
  return (SINAL[situacao as ChaveSinal] ? situacao : "A_VISTORIAR") as ChaveSinal;
}

const SINAL: Record<ChaveSinal, { familia: FamiliaSinal; glifo: Glifo }> = {
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
  REJEITADA_IMP:       { familia: "bloqueado", glifo: "barra" },
};

export const SITUACAO_LABEL: Record<ChaveSinal, string> = {
  REJEITADA_IMP:       "Impedimento",
  A_VISTORIAR:         "A vistoriar",
  ATRIBUIDO:           "Atribuído",
  EM_DESLOCAMENTO:     "Em deslocamento",
  EM_VISTORIA:         "Em vistoria",
  VISTORIADO:          "Vistoriado",
  AGUARDANDO_REVISITA: "Ag. revisita",
  EM_REVISITA:         "Em revisita",
  REVISITADO:          "Revisitado",
  DEVOLVIDA:           "Devolvida",
  REJEITADA:           "Recusa",
};

export function familiaDe(s: string): FamiliaSinal {
  return SINAL[s as ChaveSinal]?.familia ?? "fora";
}

/** Cor de STATUS da situação — sempre a cor da família, nunca uma cor própria. */
export function corSituacao(s: string): string {
  return FAMILIA_COR[familiaDe(s)];
}

/**
 * Cor com que a vistoria aparece em listas e chips — espelha o mapa: em
 * ATRIBUÍDO manda a cor do técnico; no resto, a cor da família de status.
 */
export function corMarcador(
  situacao: string,
  tecnicoCor: string | null,
  bloqueio?: string | null
): string {
  if (situacao === "ATRIBUIDO" && tecnicoCor) return tecnicoCor;
  return corSituacao(chaveSinal(situacao, bloqueio));
}

export function labelSituacao(situacao: string, bloqueio?: string | null): string {
  return SITUACAO_LABEL[chaveSinal(situacao, bloqueio)] ?? situacao;
}

/** Nome do sprite de uma vistoria (o `-r` é o selo de revisita). */
export function iconeDe(situacao: string, revisita: boolean, bloqueio?: string | null): string {
  return `vm-sig-${chaveSinal(situacao, bloqueio)}${revisita ? "-r" : ""}`;
}

/** Cor neutra do anel quando a vistoria ainda não tem técnico. */
export const ANEL_SEM_TECNICO = "#B8C0C8";

/* ─── geometria do marcador (espaço lógico de 44px) ───────────────────────── */

/** Raio externo do marcador — igual em todos os estados. */
export const R_EXTERNO = 17;
/** Raio do miolo branco — o "gap" entre anel e núcleo. */
export const R_INTERNO = 14.4;

// ATRIBUÍDO é o único estado que INVERTE os dois canais: o marcador inteiro
// fica na cor do técnico (disco cheio + aro branco fino pra descolar do mapa)
// e o estado vem só do glifo. Faz sentido porque é o único estado em que não
// há progresso pra mostrar — o que importa ali é de QUEM é o serviço. Bater o
// olho numa região e ver "isso aqui é tudo do João" era o pedido.
/** Raio do disco cheio na cor do técnico (ATRIBUÍDO). */
export const R_NUCLEO_ATRIBUIDO = 15.6;
/** Aro branco em volta desse disco — fecha no mesmo R_EXTERNO dos outros. */
export const BORDA_ATRIBUIDO = R_EXTERNO - R_NUCLEO_ATRIBUIDO;

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
  } else if (glifo === "barra") {
    // Barra grossa = "passagem bloqueada". Lê na hora e não se confunde nem
    // com o × (encerrado) nem com o ! (devolvida).
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(16.8, 22);
    ctx.lineTo(27.2, 22);
    ctx.stroke();
  }
}

/** Retângulo arredondado — `ctx.roundRect` não está em todo WebView. */
function caminhoArredondado(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, l: number, a: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + a, r);
  ctx.arcTo(x + l, y + a, x, y + a, r);
  ctx.arcTo(x, y + a, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}

/**
 * Prancheta de vistoria (ATRIBUÍDO) — a MESMA do pin do técnico, o que amarra
 * "pessoa" e "serviço dela" no mesmo símbolo.
 *
 * Desenhada em branco e com o check VAZADO (destination-out): o buraco deixa
 * passar o disco de baixo, então o check sai na cor do técnico sem que o
 * sprite precise conhecer essa cor — continuam sendo 20 imagens fixas pra
 * qualquer tamanho de equipe.
 */
function desenhaPrancheta(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#ffffff";
  caminhoArredondado(ctx, 19.9, 15.3, 4.2, 3.0, 1.1); // presilha
  ctx.fill();
  caminhoArredondado(ctx, 17.2, 17.2, 9.6, 10.0, 2.1); // corpo
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(19.4, 22.5);
  ctx.lineTo(21.2, 24.3);
  ctx.lineTo(24.7, 20.3);
  ctx.stroke();
  ctx.restore();
}

interface SpriteMapbox {
  width: number;
  height: number;
  data: Uint8Array;
  pixelRatio: number;
}

function makeSinalImage(chave: ChaveSinal, revisita: boolean): SpriteMapbox {
  const px = BOX * RATIO;
  const cvs = document.createElement("canvas");
  cvs.width = px;
  cvs.height = px;
  const ctx = cvs.getContext("2d")!;
  ctx.scale(RATIO, RATIO);
  ctx.imageSmoothingEnabled = true;

  const { familia, glifo } = SINAL[chave];
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
    // Nada de núcleo: o disco cheio na cor do técnico vem da camada de
    // círculos. Aqui só entra a prancheta branca por cima.
    desenhaPrancheta(ctx);
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

/** Todas as chaves desenháveis/filtráveis: as 10 situações + o impedimento. */
export const CHAVES_SINAL: ChaveSinal[] = [...SITUACOES, "REJEITADA_IMP"];

/** Registra as 22 imagens do miolo. Idempotente — roda a cada troca de estilo. */
export function registrarSpritesSinal(map: MapboxMap): void {
  for (const s of CHAVES_SINAL) {
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
