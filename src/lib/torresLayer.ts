import type { GeoJSONSource, Expression, Map as MapboxMap } from "mapbox-gl";
import { asset } from "@/utils/asset";
import { haversineKm } from "@/utils/format";

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
 *
 * DOIS MODOS DE FONTE, porque painel e app querem coisas diferentes:
 *
 *  • painel — a source aponta direto pra URL e o Mapbox busca e indexa o
 *    GeoJSON sozinho, sem nada passar pelo JS. Mostra a base inteira.
 *
 *  • app — a source nasce vazia e recebe só as torres num raio em volta do
 *    técnico (ver definirTorresNoRaio). Decisão de campo: o técnico não tem
 *    o que fazer com torre do outro lado do estado, e o mapa dele já
 *    carrega vistorias, postes e GPS.
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

interface OpcoesCamadaTorres {
  /**
   * Id de uma layer já existente (os pins de vistoria, por exemplo). As
   * torres são contexto, não o trabalho em si — entram SOB os pins pra
   * nunca disputar leitura com eles. Se o id não existir mais, o Mapbox
   * lança; por isso o getLayer antes.
   */
  abaixoDe?: string;
  /**
   * `true` faz a source nascer VAZIA, pra ser preenchida por
   * definirTorresNoRaio. `false`/ausente aponta a source pra URL e mostra
   * a base inteira.
   */
  porRaio?: boolean;
}

/** Cria source + layers (idempotente). Nasce oculta — quem liga é a UI. */
export function adicionarCamadaTorres(
  map: MapboxMap,
  { abaixoDe, porRaio }: OpcoesCamadaTorres = {}
): void {
  const antes = abaixoDe && map.getLayer(abaixoDe) ? abaixoDe : undefined;

  if (!map.getSource(TORRES_SRC)) {
    map.addSource(TORRES_SRC, {
      type: "geojson",
      data: porRaio
        ? { type: "FeatureCollection", features: [] }
        : asset("/torres-operadoras.json"),
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

export interface TorreFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: TorrePropriedades;
}

/* ── carregamento dos dados (quem precisa filtrar/medir no JS) ───────────── */

let torresCache: TorreFeature[] | null = null;
let torresPromessa: Promise<TorreFeature[]> | null = null;

/**
 * Baixa e guarda a base de torres. Cache de módulo: o mapa do app filtra
 * por raio a cada vez que o técnico anda, e a camada 3D do painel precisa
 * das coordenadas em JS — nenhum dos dois pode rebaixar 536 KB por uso.
 *
 * Quando a source está em modo URL (painel), o Mapbox busca o mesmo
 * arquivo por conta própria; o cache HTTP do navegador atende as duas e o
 * download acontece uma vez só.
 */
export function carregarTorres(): Promise<TorreFeature[]> {
  if (torresCache) return Promise.resolve(torresCache);
  if (torresPromessa) return torresPromessa;
  torresPromessa = fetch(asset("/torres-operadoras.json"))
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ features?: TorreFeature[] }>;
    })
    .then((gj) => {
      torresCache = (gj.features ?? []).filter(
        (f) => f.geometry?.coordinates && (f.properties?.op === "claro" || f.properties?.op === "vivo")
      );
      return torresCache;
    })
    .catch((err) => {
      // Zera pra permitir nova tentativa — offline momentâneo não pode
      // deixar a camada permanentemente vazia.
      torresPromessa = null;
      throw err;
    });
  return torresPromessa;
}

/**
 * Preenche a source com as torres num raio (em metros) do ponto dado.
 * Só vale pras camadas criadas com `porRaio: true`.
 *
 * Devolve quantas torres entraram, pro chamador poder rotular a UI.
 */
export async function definirTorresNoRaio(
  map: MapboxMap,
  centro: { lat: number; lng: number },
  raioM: number
): Promise<number> {
  const todas = await carregarTorres();
  const raioKm = raioM / 1000;
  const dentro = todas.filter((f) => {
    const [lng, lat] = f.geometry.coordinates;
    return haversineKm(centro, { lat, lng }) <= raioKm;
  });
  const src = map.getSource(TORRES_SRC) as GeoJSONSource | undefined;
  // A camada pode ter sumido entre o await e aqui (troca de estilo, unmount).
  if (src) src.setData({ type: "FeatureCollection", features: dentro } as GeoJSON.FeatureCollection);
  return dentro.length;
}
