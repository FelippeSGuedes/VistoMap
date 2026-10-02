import { Router, RadioTower, type LucideIcon } from "lucide-react";
import type { Vistoria } from "@/types";

/**
 * Tipo de equipamento (dropdown "Equipamento" do GLPI Fields: DCU ou
 * Repetidor) — fonte única da identidade visual desse tipo, usada tanto
 * pelo card da lista quanto pelos marcadores do mapa (pedido de campo
 * 2026-10-02: "utilizar ícones coerentes com os utilizados nos cards").
 *
 * O card usa o componente React (`ICONE`); o mapa, que desenha sprites em
 * canvas, usa `ICONE_PATH` — o MESMO desenho do lucide, só que em path
 * data. Trocar o ícone aqui muda os dois de uma vez.
 */
export type TipoEquipamento = "DCU" | "Repetidor";

export function tipoEquipamento(v: Pick<Vistoria, "fields">): TipoEquipamento {
  return v.fields?.equipamentofield === "Repetidor" ? "Repetidor" : "DCU";
}

export const TIPO_LABEL: Record<TipoEquipamento, string> = {
  DCU: "DCU",
  Repetidor: "Repetidor",
};

export const TIPO_ICONE: Record<TipoEquipamento, LucideIcon> = {
  DCU: Router,
  Repetidor: RadioTower,
};

/** Cor de identidade do tipo — nenhuma das duas colide com as 5 cores de
 *  status dos pins (laranja/verde/azul/vermelho/laranja-escuro). */
export const TIPO_COR: Record<TipoEquipamento, string> = {
  DCU: "#334155",
  Repetidor: "#7C3AED",
};

/**
 * Mesmo desenho dos ícones acima, em primitivas desenháveis no canvas
 * (lucide usa viewBox 24x24, stroke 2, cap/join round). Copiado de
 * lucide-react/dist/esm/icons/{router,radio-tower}.js — se o ícone trocar
 * lá em cima, estes aqui precisam acompanhar.
 */
export type IconePrimitiva =
  | { tipo: "path"; d: string }
  | { tipo: "rect"; x: number; y: number; w: number; h: number; r: number }
  | { tipo: "circle"; cx: number; cy: number; r: number };

export const TIPO_ICONE_PATH: Record<TipoEquipamento, IconePrimitiva[]> = {
  // lucide "router": caixa do equipamento + leds + arcos de sinal.
  DCU: [
    { tipo: "rect", x: 2, y: 14, w: 20, h: 8, r: 2 },
    { tipo: "path", d: "M6.01 18H6" },
    { tipo: "path", d: "M10.01 18H10" },
    { tipo: "path", d: "M15 10v4" },
    { tipo: "path", d: "M17.84 7.17a4 4 0 0 0-5.66 0" },
    { tipo: "path", d: "M20.66 4.34a8 8 0 0 0-11.31 0" },
  ],
  // lucide "radio-tower": torre + ondas de transmissão dos dois lados.
  Repetidor: [
    { tipo: "path", d: "M4.9 16.1C1 12.2 1 5.8 4.9 1.9" },
    { tipo: "path", d: "M7.8 4.7a6.14 6.14 0 0 0-.8 7.5" },
    { tipo: "circle", cx: 12, cy: 9, r: 2 },
    { tipo: "path", d: "M16.2 4.8c2 2 2.26 5.11.8 7.47" },
    { tipo: "path", d: "M19.1 1.9a9.96 9.96 0 0 1 0 14.1" },
    { tipo: "path", d: "M9.5 18h5" },
    { tipo: "path", d: "m8 22 4-11 4 11" },
  ],
};
