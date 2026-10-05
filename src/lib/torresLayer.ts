import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl";
import { asset } from "@/utils/asset";
import { haversineKm } from "@/utils/format";
import { TORRES_PIN_VERSAO } from "@/lib/torresPinVersao";

/**
 * Camada de torres de celular (base de licenciamento da Anatel —
 * 2.772 torres Claro/Vivo na área de operação). Fonte única do mapa do
 * painel e do mapa do app, pra os dois ficarem idênticos.
 *
 * Cada torre é o sprite da torre na marca da operadora, ancorado pela
 * BASE (o ponto da torre é onde ela encosta no chão).
 *
 * HISTÓRICO, pra não refazer o caminho: houve antes um visual de
 * "luzinha" (halo + núcleo em circle layer) e, no painel, um modelo 3D
 * de verdade por cima dela (torres3DLayer, GLB carregado no Three.js).
 * Os dois saíram em 2026-10-05 — a figura comunica "torre da Claro" de
 * relance, que é o que o mapa precisa, enquanto o 3D custava um draw
 * call por torre, 1 MB de GLB no bundle e só aparecia com o mapa
 * inclinado. Estão no histórico do git se algum dia fizerem falta.
 *
 * Symbol layer, nunca marker DOM: marker DOM dessincroniza do canvas
 * WebGL durante pan/zoom (ver a nota em MapView.tsx).
 *
 * DOIS MODOS DE FONTE, porque painel e app querem coisas diferentes:
 *
 *  • base inteira — a source aponta direto pra URL e o Mapbox busca e
 *    indexa o GeoJSON sozinho, sem nada passar pelo JS.
 *
 *  • por raio — a source nasce vazia e recebe só as torres num raio em
 *    volta de um ponto (ver definirTorresNoRaio). É o que painel e app
 *    usam hoje: as torres saem do equipamento selecionado.
 */
export const TORRES_SRC = "vm-torres-src";
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

  adicionarCamadaPin(map, antes);
}

/**
 * Camada de sprites da torre. As imagens carregam de forma
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
        // O sprite é a torre apoiada no chão: o ponto é a BASE, embaixo.
        "icon-anchor": "bottom",
        // Torre é contexto: deixa passar por cima das outras sem empurrar
        // nada, mas é desenhada abaixo dos pins de vistoria (ver `antes`).
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        // A curva é calibrada pela ALTURA, não pela largura: o sprite é uma
        // torre vertical (proporção ~1:2,6), então é a altura que briga por
        // espaço na tela. Registrado com pixelRatio 2, os ~256x655 px do
        // arquivo valem ~128x328 px de tela em size 1.
        //
        // Alturas que estes valores produzem (torre da Claro; a da Vivo sai
        // ~6% menor, é a proporção real do arquivo):
        //   zoom 10 -> 46 px   zoom 13 -> 66 px
        //   zoom 16 -> 85 px   zoom 19 -> 98 px
        //
        // Isto passa dos 56 px do pin de VISTORIA (sprite 44x56 fixo, ver
        // PIN_W/PIN_H em MapView), ao contrário da regra que eu havia
        // adotado — "torre é contexto, não pode competir com o trabalho".
        // Foi pedido explicitamente ("deixe maior", 2026-10-05) depois de
        // ver as torres no tamanho anterior: com a figura da operadora no
        // lugar do ponto colorido, ela passou a ser informação que se quer
        // enxergar, não só pano de fundo.
        "icon-size": [
          "interpolate", ["linear"], ["zoom"],
          10, 0.14,
          13, 0.20,
          16, 0.26,
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
    // ?v=<hash do conteúdo>: o nome do arquivo é fixo e o service worker
    // guarda imagem por 30 dias em StaleWhileRevalidate — devolve a cópia
    // VELHA na hora e só busca a nova depois. Sem a query, trocar a
    // imagem não chegava ao técnico (relatado em 2026-10-05). O token é
    // gerado do conteúdo pelo scripts/otimizar-torres-png.ps1.
    map.loadImage(`${asset(ARQUIVO_PIN[op])}?v=${TORRES_PIN_VERSAO}`, (err, img) => {
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
  if (map.getLayer(TORRES_LAYER_PIN)) {
    map.setLayoutProperty(TORRES_LAYER_PIN, "visibility", v);
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
