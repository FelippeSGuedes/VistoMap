"use client";

import mapboxgl, { type LngLatLike, type Map as MapboxMap } from "mapbox-gl";
import { novoMapa } from "@/lib/mapaSeguro";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MapPinned, RadioTower } from "lucide-react";
import type { Poste, Vistoria } from "@/types";
import { postesToGeoJSON } from "@/services/postes";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAP_STYLE,
  getMapboxToken,
} from "@/services/maps";
import {
  TIPO_COR,
  TIPO_ICONE_PATH,
  tipoEquipamento,
  type IconePrimitiva,
  type TipoEquipamento,
} from "@/lib/equipamentoTipo";
import {
  TORRES_LAYER_HALO,
  TORRES_LAYER_NUCLEO,
  TORRE_COR,
  TORRE_LABEL,
  adicionarCamadaTorres,
  aoPoderMexerNoMapa,
  definirTorresNoRaio,
  torresVisiveis,
} from "@/lib/torresLayer";

interface MapViewProps {
  vistorias: Vistoria[];
  userPosition?: { lat: number; lng: number } | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /**
   * Camada opcional de postes (vinda do PostGIS).
   * Renderizada como circle-layer Mapbox — escala pra milhares sem custo de DOM.
   */
  postes?: Poste[] | null;
  selectedPosteId?: number | null;
  onPosteSelect?: (id: number) => void;
  /**
   * Torres de operadoras num raio em volta de `centro`. Sem esta prop (ou
   * com `centro: null`) a camada não aparece.
   *
   * Quem liga é sempre de fora: na lista de vistorias é o botão do card do
   * equipamento, no fluxo de trocar poste é automático. O MapView não tem
   * controle próprio pra isso — o mapa é o lugar onde a camada aparece,
   * não onde ela é administrada.
   */
  torres?: { centro: { lat: number; lng: number } | null; raioM: number };
  /**
   * Centraliza o mapa neste ponto sempre que ele MUDAR, sem selecionar
   * nada. Existe porque ligar postes/torres pelo card precisa trazer o
   * mapa até o equipamento — e `selectedId`, o caminho normal de
   * centralizar, abre junto a tela cheia de chegada, que taparia
   * justamente o que se quer ver.
   */
  focar?: { lat: number; lng: number } | null;
  className?: string;
}

const POSTES_SRC = "vm-postes-src";
const POSTES_LAYER = "vm-postes-circle";
const POSTES_LAYER_SELECTED = "vm-postes-circle-selected";
const VISTORIAS_SRC = "vm-vistorias-src";
const VISTORIAS_LAYER = "vm-vistorias-symbol";

// Sob basePath (/app), assets estaticos precisam do prefixo manual senao o
// browser pede "/icons/..." na origin e toma 404 -> pin sem icone. Ver
// [[basepath-raw-fetch-bug]].
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const PIN_ICON: Record<Vistoria["status"], string> = {
  PENDENTE:   `${BASE_PATH}/icons/pin-pendente.svg`,
  EM_CAMPO:   `${BASE_PATH}/icons/pin-em-campo.svg`,
  FINALIZADA: `${BASE_PATH}/icons/pin-finalizada.svg`,
  APROVADA:   `${BASE_PATH}/icons/pin-finalizada.svg`,
  REPROVADA:  `${BASE_PATH}/icons/pin-reprovada.svg`,
  DEVOLVIDA:  `${BASE_PATH}/icons/pin-devolvida.svg`,
};

// Tecnico recebe vistorias SEM coord (vai ao local marcar GPS). O SQL
// converte coord vazia -> 0, entao (0,0) = "sem GPS ainda". NAO plotar essas:
// cairiam em Null Island (meio do Atlantico). A LISTA ainda as mostra.
/** Escapa texto que vai pro HTML do popup. Os campos de torre vêm da base
 *  da Anatel (CSV de terceiro), então são DADO, nunca markup confiável. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasValidCoords(v: Vistoria): boolean {
  return (
    Number.isFinite(v.latitude) &&
    Number.isFinite(v.longitude) &&
    (v.latitude !== 0 || v.longitude !== 0)
  );
}

/**
 * Achado em campo (2026-10-02, "pins flutuando" durante pan/zoom): markers
 * DOM (mapboxgl.Marker, <div> sobreposto ao canvas WebGL) nunca
 * sincronizam perfeitamente com o mapa nesse WebView Android — são duas
 * camadas de renderização separadas (compositor da WebView vs. GPU do
 * WebGL) sem garantia de frame conjunto. Confirmado comparando com os
 * postes (já uma symbol layer nativa, nunca flutuaram). Fix definitivo:
 * vistorias também viram symbol layer — pins pré-renderados em canvas
 * (pin base + badge de tipo) registrados como imagem do Mapbox, 100%
 * desenhados DENTRO do WebGL, sem camada DOM por cima.
 *
 * O sprite tem folga em volta do pin (PAD) só pro halo não ser cortado.
 */
const PIN_W = 44, PIN_H = 56, PAD = 6, PIN_RATIO = 2;
const BOX_W = PIN_W + PAD * 2, BOX_H = PIN_H + PAD * 2;

function vistoriaIconKey(status: Vistoria["status"], tipo: TipoEquipamento): string {
  return `vm-vistoria-${status}-${tipo}`;
}

/** Desenha um ícone do lucide (viewBox 24, stroke 2, cap/join round)
 *  centrado em (cx,cy) com `size` de lado — mesmo desenho que o card usa
 *  como componente React (ver lib/equipamentoTipo.ts). */
function desenhaIconeLucide(
  ctx: CanvasRenderingContext2D,
  primitivas: IconePrimitiva[],
  cx: number,
  cy: number,
  size: number,
  cor: string
) {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = cor;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of primitivas) {
    if (p.tipo === "path") {
      ctx.stroke(new Path2D(p.d));
    } else if (p.tipo === "rect") {
      ctx.beginPath();
      // roundRect não existe em toda WebView — monta com arcTo.
      ctx.moveTo(p.x + p.r, p.y);
      ctx.arcTo(p.x + p.w, p.y, p.x + p.w, p.y + p.h, p.r);
      ctx.arcTo(p.x + p.w, p.y + p.h, p.x, p.y + p.h, p.r);
      ctx.arcTo(p.x, p.y + p.h, p.x, p.y, p.r);
      ctx.arcTo(p.x, p.y, p.x + p.w, p.y, p.r);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Miolo do marcador: disco branco + anel na cor do tipo + ícone do tipo,
 *  com um halo discreto por trás pra destacar do mapa sem virar "glow". */
function desenhaBadgeTipo(ctx: CanvasRenderingContext2D, tipo: TipoEquipamento, scale: number) {
  const cor = TIPO_COR[tipo];
  const cx = (PAD + 22) * scale, cy = (PAD + 19) * scale, r = 12.5 * scale;

  // Halo: sombra suave na cor do tipo, só o suficiente pra separar o
  // marcador de fundos claros/saturados do mapa.
  ctx.save();
  ctx.shadowColor = `${cor}59`;
  ctx.shadowBlur = 6 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 2.5 * scale;
  ctx.strokeStyle = cor;
  ctx.stroke();

  ctx.save();
  ctx.scale(scale, scale);
  desenhaIconeLucide(ctx, TIPO_ICONE_PATH[tipo], cx / scale, cy / scale, 15, cor);
  ctx.restore();
}

/** Carrega os 5 SVGs de status uma vez, compõe os 2 badges de tipo em cima
 *  de cada um (10 imagens no total) e registra tudo no Mapbox. */
function registrarImagensVistoria(map: MapboxMap): Promise<void> {
  const statuses = Object.keys(PIN_ICON) as Array<Vistoria["status"]>;
  return Promise.all(
    statuses.map(
      (status) =>
        new Promise<void>((resolve) => {
          if ((["Repetidor", "DCU"] as const).every((t) => map.hasImage(vistoriaIconKey(status, t)))) {
            resolve();
            return;
          }
          // Nunca deixa esta promise pendurada pra sempre — qualquer
          // exceção aqui dentro (ex.: canvas "tainted" por uma resposta
          // opaca vinda do cache do service worker offline) travaria a
          // layer de vistorias (e o MudarPosteFlow, que usa o mesmo
          // MapView) pra sempre, já que .then() nunca dispararia. Acha
          // em campo (2026-10-02): técnico offline sem mapa nem troca
          // de poste.
          const img = new Image();
          img.onload = () => {
            try {
              for (const tipo of ["Repetidor", "DCU"] as const) {
                const key = vistoriaIconKey(status, tipo);
                if (map.hasImage(key)) continue;
                const canvas = document.createElement("canvas");
                canvas.width = BOX_W * PIN_RATIO;
                canvas.height = BOX_H * PIN_RATIO;
                const ctx = canvas.getContext("2d");
                if (!ctx) continue;
                // PAD de folga em volta — o halo do badge não pode ser
                // cortado pela borda do sprite.
                ctx.drawImage(
                  img,
                  PAD * PIN_RATIO,
                  PAD * PIN_RATIO,
                  PIN_W * PIN_RATIO,
                  PIN_H * PIN_RATIO
                );
                desenhaBadgeTipo(ctx, tipo, PIN_RATIO);
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                map.addImage(
                  key,
                  { width: canvas.width, height: canvas.height, data: new Uint8Array(data.data.buffer) },
                  { pixelRatio: PIN_RATIO }
                );
              }
            } catch (e) {
              console.warn("[vm] falha ao compor icone de vistoria", status, e);
            }
            resolve();
          };
          img.onerror = () => resolve();
          img.src = PIN_ICON[status];
        })
    )
  ).then(() => undefined);
}

function vistoriasToGeoJSON(vistorias: Vistoria[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: vistorias.map((v) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [v.longitude, v.latitude] },
      properties: { id: v.id, icone: vistoriaIconKey(v.status, tipoEquipamento(v)) },
    })),
  };
}

export function MapView({
  vistorias,
  userPosition,
  selectedId,
  onSelect,
  postes,
  selectedPosteId,
  onPosteSelect,
  torres,
  focar,
  className,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const token = getMapboxToken();

  // So vistorias com coord real entram no mapa (ver hasValidCoords).
  const plottable = useMemo(() => vistorias.filter(hasValidCoords), [vistorias]);

  const initialCenter = useMemo<LngLatLike>(() => {
    if (userPosition) return [userPosition.lng, userPosition.lat];
    if (plottable[0]) return [plottable[0].longitude, plottable[0].latitude];
    return DEFAULT_CENTER;
  }, [userPosition, plottable]);

  // Mantem o centro inicial num ref pra LER na criacao SEM colocar nas deps do
  // efeito de init. Antes initialCenter estava nas deps -> mudava quando a lista
  // ou a posicao mudava -> map.remove()+recria -> markers e POSTES_SRC somem
  // (icones e postes sumindo "de novo"). Mapa deve ser criado UMA vez.
  const initialCenterRef = useRef(initialCenter);
  initialCenterRef.current = initialCenter;
  const didFitRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!token) return;
    mapboxgl.accessToken = token;
    const { map } = novoMapa({
      container: containerRef.current,
      style: MAP_STYLE,
      center: initialCenterRef.current,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      pitchWithRotate: false,
      cooperativeGestures: false,
    }, "app/vistoria-mapa");
    // Sem WebGL não dá pra desenhar: a tela segue viva e o motivo vai
    // pro backend (ver lib/mapaSeguro.ts).
    if (!map) return;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right"
    );
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      didFitRef.current = false;
    };
  }, [token]);

  // user position marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userPosition) return;
    const onReady = () => {
      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat([userPosition.lng, userPosition.lat]);
      } else {
        const el = document.createElement("div");
        el.style.cssText = `
          position:relative;width:18px;height:18px;border-radius:9999px;
          background:#06D6A0;border:3px solid #fff;
          box-shadow:0 4px 14px rgba(6,214,160,.55), 0 0 0 6px rgba(6,214,160,.18);
        `;
        userMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat([userPosition.lng, userPosition.lat])
          .setPopup(new mapboxgl.Popup({ offset: 18 }).setHTML(
            `<div style="padding:10px 12px;font-size:13px;font-weight:600;color:#073B4C;">📍 Sua localização</div>`
          ))
          .addTo(map);
      }
    };
    if (map.loaded()) onReady();
    else map.once("load", onReady);
  }, [userPosition]);

  /* ────── camada de vistorias (symbol layer — ver nota em registrarImagensVistoria) ────────── */

  // ref pra manter o listener de click estável sem re-attachar a cada render
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // 1) garante source + imagens + layer (anexo único)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ensure = () => {
      if (map.getSource(VISTORIAS_SRC)) return;
      map.addSource(VISTORIAS_SRC, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id",
      });
      registrarImagensVistoria(map).then(() => {
        if (map.getLayer(VISTORIAS_LAYER)) return;
        map.addLayer({
          id: VISTORIAS_LAYER,
          source: VISTORIAS_SRC,
          type: "symbol",
          layout: {
            "icon-image": ["get", "icone"],
            // O sprite tem PAD de folga em volta (pro halo não ser
            // cortado), então "bottom" cairia PAD acima do ponto real —
            // o offset devolve a ponta do pin pra coordenada exata.
            "icon-anchor": "bottom",
            "icon-offset": [0, PAD],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
        map.on("click", VISTORIAS_LAYER, (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id != null) onSelectRef.current?.(String(id));
        });
        map.on("mouseenter", VISTORIAS_LAYER, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", VISTORIAS_LAYER, () => {
          map.getCanvas().style.cursor = "";
        });
      });
    };
    if (map.loaded()) ensure();
    else map.once("load", ensure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) atualiza GeoJSON + enquadra a primeira leva (uma única vez, sem
  // userPosition, senão o user marker cuida do enquadre) quando `plottable` muda
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource(VISTORIAS_SRC) as mapboxgl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(vistoriasToGeoJSON(plottable));

      if (!didFitRef.current && !userPosition && plottable.length > 0) {
        didFitRef.current = true;
        if (plottable.length === 1) {
          map.easeTo({ center: [plottable[0].longitude, plottable[0].latitude], zoom: 14 });
        } else {
          const b = new mapboxgl.LngLatBounds();
          plottable.forEach((v) => b.extend([v.longitude, v.latitude]));
          map.fitBounds(b, { padding: 64, maxZoom: 15, duration: 600 });
        }
      }
    };
    if (map.loaded()) apply();
    else map.once("load", apply);
  }, [plottable, userPosition]);

  // selected fly-to (vistoria)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const v = vistorias.find((x) => x.id === selectedId);
    if (!v || !hasValidCoords(v)) return;
    map.flyTo({
      center: [v.longitude, v.latitude],
      zoom: Math.max(map.getZoom(), 13.5),
      essential: true,
      duration: 700,
    });
  }, [selectedId, vistorias]);

  /* ────── camada de postes (PostGIS via /postes/proximos) ────────────────── */

  // ref pra manter callback estável sem re-attachar listener
  const onPosteSelectRef = useRef(onPosteSelect);
  useEffect(() => {
    onPosteSelectRef.current = onPosteSelect;
  }, [onPosteSelect]);

  // 1) garante source + layers (anexo único)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ensure = () => {
      if (map.getSource(POSTES_SRC)) return;
      map.addSource(POSTES_SRC, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id",
      });
      // Usa o icone do poste (posteico.png) num SYMBOL layer em vez de circles
      // ("bolinhas"). Sob basePath o asset estatico precisa do prefixo.
      const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

      const addLayers = () => {
        if (map.getLayer(POSTES_LAYER)) return;
        // postes (icone padrao)
        map.addLayer({
          id: POSTES_LAYER,
          source: POSTES_SRC,
          type: "symbol",
          layout: {
            "icon-image": "poste-ico",
            "icon-size": [
              "interpolate", ["linear"], ["zoom"],
              10, 0.16,
              14, 0.28,
              18, 0.46,
            ],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
        // selecionado — mesmo icone, maior
        map.addLayer({
          id: POSTES_LAYER_SELECTED,
          source: POSTES_SRC,
          type: "symbol",
          filter: ["==", ["get", "id"], -1],
          layout: {
            "icon-image": "poste-ico",
            "icon-size": [
              "interpolate", ["linear"], ["zoom"],
              10, 0.3,
              14, 0.52,
              18, 0.82,
            ],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });

        map.on("click", POSTES_LAYER, (e) => {
          const feat = e.features?.[0];
          const id = Number(feat?.properties?.id);
          if (Number.isFinite(id)) onPosteSelectRef.current?.(id);
        });
        map.on("mouseenter", POSTES_LAYER, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", POSTES_LAYER, () => {
          map.getCanvas().style.cursor = "";
        });
      };

      if (map.hasImage("poste-ico")) {
        addLayers();
      } else {
        map.loadImage(`${BP}/posteico.png`, (err, img) => {
          if (!err && img && !map.hasImage("poste-ico")) {
            map.addImage("poste-ico", img, { pixelRatio: 2 });
          }
          addLayers();
        });
      }
    };
    if (map.loaded()) ensure();
    else map.once("load", ensure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) atualiza GeoJSON quando `postes` muda
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource(POSTES_SRC) as mapboxgl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(
        postes
          ? (postesToGeoJSON(postes) as GeoJSON.FeatureCollection)
          : { type: "FeatureCollection", features: [] }
      );
    };
    if (map.loaded()) apply();
    else map.once("load", apply);
  }, [postes]);

  // 3) filtro do layer "selecionado" + fly-to
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer(POSTES_LAYER_SELECTED)) return;
      map.setFilter(POSTES_LAYER_SELECTED, [
        "==",
        ["get", "id"],
        selectedPosteId ?? -1,
      ]);
    };
    if (map.loaded()) apply();
    else map.once("load", apply);

    if (selectedPosteId != null && postes) {
      const p = postes.find((x) => x.id === selectedPosteId);
      if (p) {
        map.flyTo({
          center: [p.longitudefield, p.latitudefield],
          zoom: Math.max(map.getZoom(), 15),
          duration: 600,
          essential: true,
        });
      }
    }
  }, [selectedPosteId, postes]);

  // Centraliza no ponto pedido (ver prop `focar`). Lido como primitivos
  // pra o efeito não disparar por o pai remontar o objeto a cada render.
  const focarLat = focar?.lat ?? null;
  const focarLng = focar?.lng ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || focarLat == null || focarLng == null) return;
    map.flyTo({
      center: [focarLng, focarLat],
      // Zoom suficiente pra o raio de 1500 m caber na tela sem virar um
      // amontoado de pontos, mas sem desfazer um zoom maior que o técnico
      // já tenha dado.
      zoom: Math.max(map.getZoom(), 14.5),
      duration: 700,
      essential: true,
    });
  }, [focarLat, focarLng]);

  /* ────── camada de torres de operadoras (contexto opcional) ─────────────── */

  // Centro e raio vêm prontos de fora (as coordenadas do equipamento
  // escolhido na lista, ou o foco do fluxo de trocar poste). Lidos como
  // primitivos, nunca o objeto da prop: o pai monta `torres={{...}}`
  // inline, então o objeto é novo a cada render dele e, como dependência
  // de efeito, refiltraria as 2.772 torres sem nada ter mudado.
  const torresRaioM = torres?.raioM ?? 0;
  const torresLat = torres?.centro?.lat ?? null;
  const torresLng = torres?.centro?.lng ?? null;
  const torresLigadas = torresLat != null && torresLng != null;

  /** Quantas torres entraram no raio — mostrado na legenda. null = falhou. */
  const [torresNoRaio, setTorresNoRaio] = useState<number | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || torresRaioM <= 0) return;
    let vivo = true;
    const apply = () => {
      adicionarCamadaTorres(map, { abaixoDe: VISTORIAS_LAYER, porRaio: true });
      torresVisiveis(map, torresLigadas);
      if (torresLat == null || torresLng == null) return;
      definirTorresNoRaio(map, { lat: torresLat, lng: torresLng }, torresRaioM)
        .then((n) => { if (vivo) setTorresNoRaio(n); })
        .catch(() => { if (vivo) setTorresNoRaio(null); });
    };
    // aoPoderMexerNoMapa em vez de map.loaded(): este efeito re-roda a
    // cada clique no botão, e nesse momento map.loaded() costuma ser
    // false só porque há tile em voo — aí o antigo `once("load")` nunca
    // mais dispararia. Ver o comentário no helper.
    const limpar = aoPoderMexerNoMapa(map, apply);
    return () => { vivo = false; limpar(); };
  }, [torresLigadas, torresLat, torresLng, torresRaioM]);

  // Toque numa torre: diz qual é. Só responde se NÃO houver pin de
  // vistoria no mesmo ponto — o pin tem prioridade absoluta, a torre
  // nunca pode roubar um toque do fluxo de trabalho.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (!torresLigadas) return;
      const pin = map.queryRenderedFeatures(e.point, { layers: [VISTORIAS_LAYER] });
      if (pin.length > 0) return;
      const props = e.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (!props) return;
      const op = String(props.op ?? "") as "claro" | "vivo";
      const cor = TORRE_COR[op] ?? "#64748B";
      const linhas = [
        props.end && `<div style="margin-top:4px">${esc(String(props.end))}</div>`,
        props.mun && `<div style="opacity:.7">${esc(String(props.mun))}${props.uf ? ` · ${esc(String(props.uf))}` : ""}</div>`,
        (props.tec || props.alt) &&
          `<div style="margin-top:4px;opacity:.7">${esc(String(props.tec ?? ""))}${
            props.alt ? ` · ${esc(String(props.alt))} m` : ""
          }</div>`,
      ].filter(Boolean).join("");
      new mapboxgl.Popup({ offset: 12, closeButton: false })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="padding:9px 11px;font-size:12px;line-height:1.35;color:#073B4C;max-width:220px">
             <div style="font-weight:700;color:${cor}">${TORRE_LABEL[op] ?? "Torre"}</div>
             ${linhas}
           </div>`
        )
        .addTo(map);
    };
    map.on("click", TORRES_LAYER_NUCLEO, onClick);
    map.on("click", TORRES_LAYER_HALO, onClick);
    return () => {
      map.off("click", TORRES_LAYER_NUCLEO, onClick);
      map.off("click", TORRES_LAYER_HALO, onClick);
    };
  }, [torresLigadas]);

  if (!token) {
    return (
      <div className={`relative overflow-hidden rounded-3xl bg-grad-hero ${className ?? ""}`}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white/90">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white">
            <MapPinned className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium">
            Configure <code className="rounded bg-white/15 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> em
            <code className="ml-1 rounded bg-white/15 px-1.5 py-0.5 text-xs">.env.local</code> para ativar o mapa.
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`map-canvas relative ${className ?? ""}`}
    >
      <div ref={containerRef} className="h-full w-full" />

      {/* Legenda das torres. Sem botão: quem liga é o card do equipamento
          (ou o fluxo de trocar poste). Aqui só se explica o que são as
          luzinhas que apareceram — senão viram pontos coloridos sem
          significado. Encostada abaixo do NavigationControl do Mapbox. */}
      {torresLigadas && (
        <div className="absolute right-2.5 top-[84px] z-10 flex items-center gap-2.5 rounded-full bg-white/95 px-2.5 py-1.5 text-[10.5px] font-semibold shadow-elev backdrop-blur">
          <RadioTower className="h-3.5 w-3.5 shrink-0 text-brand-deep" />
          {(["claro", "vivo"] as const).map((op) => (
            <span key={op} className="flex items-center gap-1 text-brand-deep">
              {/* mesma leitura do mapa: núcleo branco + anel da operadora */}
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-white"
                style={{ boxShadow: `0 0 0 2px ${TORRE_COR[op]}` }}
              />
              {TORRE_LABEL[op]}
            </span>
          ))}
          {torresNoRaio === 0 && (
            <span className="text-ink-muted">nenhuma por perto</span>
          )}
        </div>
      )}
    </motion.div>
  );
}
