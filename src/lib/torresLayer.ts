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
/** Visual "pin": sprite da torre na marca da operadora (só o app). */
export const TORRES_LAYER_PIN = "vm-torres-pin";

const IMG = { claro: "vm-torre-claro", vivo: "vm-torre-vivo" } as const;
/** Mapas com o par de sprites em carregamento — ver adicionarCamadaPin. */
const carregandoPins = new WeakSet<MapboxMap>();
const ARQUIVO_PIN: Record<"claro" | "vivo", string> = {
  claro: "/torre-claro-app.png",
  vivo: "/torre-vivo-app.png",
};

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
 * Roda `fn` assim que for possível mexer nas layers, e de novo a cada
 * troca de estilo (setStyle descarta tudo). Devolve o cleanup.
 *
 * NÃO use `map.isStyleLoaded()`/`map.loaded()` como porteiro pra isso.
 * Eles retornam false sempre que QUALQUER source ainda tem tile em voo —
 * num mapa que repinta o tempo todo, quase sempre. Foi exatamente o bug
 * de 2026-10-05: clicar em "Torres" caía no ramo `once("style.load")`,
 * que já havia disparado e nunca mais dispara, e nada acontecia.
 *
 * O que addLayer/addSource/setLayoutProperty exigem é só que o ESTILO
 * tenha carregado, não os tiles. Então aqui a gente tenta direto; se o
 * estilo de fato ainda não estiver pronto o Mapbox lança, a gente engole,
 * e o handler persistente de style.load repõe quando der.
 */
export function aoPoderMexerNoMapa(map: MapboxMap, fn: () => void): () => void {
  const tentar = () => {
    try {
      fn();
    } catch {
      // Estilo ainda não carregou — o style.load abaixo cuida.
    }
  };
  tentar();
  map.on("style.load", tentar);
  return () => { map.off("style.load", tentar); };
}

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
  /**
   * Como a torre é desenhada:
   *
   *  • "luz" (padrão) — halo + núcleo, a ponta da torre vista de cima. É o
   *    visual do painel, onde o mapa já é denso e a torre é pano de fundo;
   *    inclinando, o modelo 3D entra por cima dela.
   *
   *  • "pin" — sprite da torre na marca da operadora, ancorado pelo bico.
   *    É o visual do app: o técnico olha o mapa no sol, em tela pequena e
   *    de relance, e um ponto colorido não diz "torre da Claro" como a
   *    figura diz. O app nunca teve o 3D, então aqui não há o que empilhar.
   */
  visual?: "luz" | "pin";
}

/** Cria source + layers (idempotente). Nasce oculta — quem liga é a UI. */
export function adicionarCamadaTorres(
  map: MapboxMap,
  { abaixoDe, porRaio, visual = "luz" }: OpcoesCamadaTorres = {}
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

  if (visual === "pin") {
    adicionarCamadaPin(map, antes);
    return;
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

/**
 * Camada de sprites (visual "pin"). As imagens carregam de forma
 * assíncrona; a layer só entra quando as duas estiverem registradas, pra
 * nunca existir uma layer apontando pra `icon-image` inexistente (o
 * Mapbox não desenha nada e ainda enche o console de aviso por feature).
 */
function adicionarCamadaPin(map: MapboxMap, antes?: string): void {
  // O chamador é um efeito que re-roda (toggle, troca de estilo) e as
  // imagens demoram um instante: sem esta trava, cada re-execução enquanto
  // elas carregam dispararia um novo par de downloads.
  if (map.getLayer(TORRES_LAYER_PIN) || carregandoPins.has(map)) return;

  const criarLayer = () => {
    carregandoPins.delete(map);
    // A troca de estilo (ou um unmount) pode ter acontecido durante o
    // carregamento das imagens — revalida tudo antes de mexer no mapa.
    // Soltando a trava acima, uma chamada posterior refaz o trabalho.
    if (map.getLayer(TORRES_LAYER_PIN) || !map.getSource(TORRES_SRC)) return;
    if (!map.hasImage(IMG.claro) || !map.hasImage(IMG.vivo)) return;
    map.addLayer({
      id: TORRES_LAYER_PIN,
      source: TORRES_SRC,
      type: "symbol",
      layout: {
        visibility: "none",
        "icon-image": ["match", ["get", "op"], "claro", IMG.claro, "vivo", IMG.vivo, IMG.claro],
        // O sprite é uma gota: o ponto da torre é o BICO, embaixo.
        "icon-anchor": "bottom",
        // Torre é contexto: deixa passar por cima das outras sem empurrar
        // nada, mas é desenhada abaixo dos pins de vistoria (ver `antes`).
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        // Registrado com pixelRatio 2, então os 256x~355 px do arquivo
        // valem 128x~178 px de tela em size 1.
        //
        // O teto de 0,30 existe por uma razão concreta: o pin de VISTORIA
        // é um sprite de 44x56 px FIXO em todos os zooms (ver PIN_W/PIN_H
        // em MapView). Uma curva que passasse disso faria a torre — que é
        // contexto — ficar maior que o trabalho do técnico justamente nos
        // zooms em que ele está perto do equipamento. Com 0,30 o pin de
        // torre chega a 38x53 px e fica sempre abaixo dos 44x56.
        "icon-size": [
          "interpolate", ["linear"], ["zoom"],
          10, 0.16,
          13, 0.22,
          16, 0.28,
          19, 0.30,
        ],
      },
    }, antes && map.getLayer(antes) ? antes : undefined);
  };

  carregandoPins.add(map);
  let pendentes = 0;
  for (const op of ["claro", "vivo"] as const) {
    if (map.hasImage(IMG[op])) continue;
    pendentes++;
    map.loadImage(asset(ARQUIVO_PIN[op]), (err, img) => {
      if (!err && img && !map.hasImage(IMG[op])) {
        map.addImage(IMG[op], img, { pixelRatio: 2 });
      }
      if (--pendentes === 0) criarLayer();
    });
  }
  if (pendentes === 0) criarLayer();
}

/** Rótulo da operadora pra legenda e popup. */
export const TORRE_LABEL: Record<"claro" | "vivo", string> = {
  claro: "Claro",
  vivo: "Vivo",
};

export function torresVisiveis(map: MapboxMap, visivel: boolean): void {
  const v = visivel ? "visible" : "none";
  // Percorre os dois visuais: só existe o que foi criado, e assim quem
  // chama não precisa saber qual visual está em uso.
  for (const id of [TORRES_LAYER_HALO, TORRES_LAYER_NUCLEO, TORRES_LAYER_PIN]) {
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
