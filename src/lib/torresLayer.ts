import type { Expression, Map as MapboxMap } from "mapbox-gl";
import { asset } from "@/utils/asset";

/**
 * Camada de torres de celular (base de licenciamento da Anatel —
 * 2.772 torres Claro/Vivo na área de operação). Fonte única usada pelo
 * mapa do painel e pelo mapa do app, pra os dois ficarem idênticos.
 *
 * Em 2D (top-down) cada torre é uma "luzinha": um halo difuso na cor da
 * operadora + um núcleo claro no meio — é a ponta da torre vista de cima.
 * No painel, quando o mapa está inclinado, o modelo 3D entra POR CIMA
 * disso (ver torres3DLayer); a luzinha continua marcando o ponto no chão.
 *
 * Circle layer (não symbol/DOM): 2.772 pontos renderizam no WebGL sem
 * custo perceptível e sem o problema de dessincronia que marker DOM tem
 * durante pan/zoom (ver nota em MapView.tsx).
 */
export const TORRES_SRC = "vm-torres-src";
export const TORRES_LAYER_HALO = "vm-torres-halo";
export const TORRES_LAYER_NUCLEO = "vm-torres-nucleo";

/** Cores de marca das operadoras — só elas usam vermelho/roxo no mapa. */
export const TORRE_COR: Record<"claro" | "vivo", string> = {
  claro: "#E30613",
  vivo: "#7B18B5",
};

const COR_POR_OP: Expression = [
  "match",
  ["get", "op"],
  "claro",
  TORRE_COR.claro,
  "vivo",
  TORRE_COR.vivo,
  "#64748B", // fallback: operadora fora das duas (não deve ocorrer, o gerador filtra)
];

/**
 * Cria source + layers (idempotente). Nasce oculta — quem liga é a UI.
 *
 * `abaixoDe`: id de uma layer já existente (os pins de vistoria, por
 * exemplo). As torres são contexto, não o trabalho do técnico — entram
 * SOB os pins pra nunca disputar leitura com eles. Se o id não existir
 * mais, o Mapbox lança; por isso o getLayer antes.
 */
export function adicionarCamadaTorres(map: MapboxMap, abaixoDe?: string): void {
  const antes = abaixoDe && map.getLayer(abaixoDe) ? abaixoDe : undefined;

  if (!map.getSource(TORRES_SRC)) {
    map.addSource(TORRES_SRC, {
      type: "geojson",
      // O Mapbox busca e indexa o GeoJSON sozinho — nada de parsear no JS.
      data: asset("/torres-operadoras.json"),
    });
  }

  if (!map.getLayer(TORRES_LAYER_HALO)) {
    map.addLayer({
      id: TORRES_LAYER_HALO,
      source: TORRES_SRC,
      type: "circle",
      layout: { visibility: "none" },
      paint: {
        "circle-color": COR_POR_OP,
        "circle-blur": 1,
        "circle-opacity": 0.45,
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          8, 4,
          12, 8,
          16, 16,
          19, 26,
        ],
      },
    }, antes);
  }

  if (!map.getLayer(TORRES_LAYER_NUCLEO)) {
    map.addLayer({
      id: TORRES_LAYER_NUCLEO,
      source: TORRES_SRC,
      type: "circle",
      layout: { visibility: "none" },
      paint: {
        // Núcleo quase branco com anel na cor da operadora: lê como "luz
        // acesa" em cima de qualquer base do mapa (clara ou satélite).
        "circle-color": "#FFFFFF",
        "circle-opacity": 0.95,
        "circle-stroke-color": COR_POR_OP,
        "circle-stroke-width": [
          "interpolate", ["linear"], ["zoom"],
          8, 1,
          14, 2,
          18, 3,
        ],
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          8, 1.6,
          12, 2.6,
          16, 4.5,
          19, 7,
        ],
      },
    }, antes);
  }
}

/** Rótulo da operadora pra legenda e popup. */
export const TORRE_LABEL: Record<"claro" | "vivo", string> = {
  claro: "Claro",
  vivo: "Vivo",
};

export function torresVisiveis(map: MapboxMap, visivel: boolean): void {
  const v = visivel ? "visible" : "none";
  for (const id of [TORRES_LAYER_HALO, TORRES_LAYER_NUCLEO]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
  }
}

export interface TorrePropriedades {
  op: "claro" | "vivo";
  mun?: string;
  uf?: string;
  end?: string;
  tec?: string;
  alt?: number;
}
