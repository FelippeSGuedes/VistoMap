"use client";

import mapboxgl, { type LngLatLike, type Map as MapboxMap } from "mapbox-gl";
import { novoMapa } from "@/lib/mapaSeguro";
import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { MapPinned } from "lucide-react";
import type { Poste, Vistoria } from "@/types";
import { postesToGeoJSON } from "@/services/postes";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAP_STYLE,
  getMapboxToken,
} from "@/services/maps";

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
function hasValidCoords(v: Vistoria): boolean {
  return (
    Number.isFinite(v.latitude) &&
    Number.isFinite(v.longitude) &&
    (v.latitude !== 0 || v.longitude !== 0)
  );
}

type TipoEquip = "Repetidor" | "DCU";
function tipoDe(v: Vistoria): TipoEquip {
  return v.fields?.equipamentofield === "Repetidor" ? "Repetidor" : "DCU";
}

/** Cor própria por tipo de equipamento — só na BORDA/LETRA, nunca no
 *  preenchimento (que fica branco, igual ao miolo original do pin), pra
 *  nunca brigar visualmente com a cor de status do pin por fora (achado em
 *  campo 2026-10-02: disco cheio de cor virava uma combinação "ridícula"
 *  ao lado do laranja de pendente). Roxo/grafite — nenhum dos dois é usado
 *  pelos 5 pins de status (laranja/verde/azul/vermelho/laranja-escuro). */
const TIPO_COR: Record<TipoEquip, string> = {
  Repetidor: "#7C3AED",
  DCU: "#334155",
};

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
 */
const PIN_W = 44, PIN_H = 56, PIN_RATIO = 2;

function vistoriaIconKey(status: Vistoria["status"], tipo: TipoEquip): string {
  return `vm-vistoria-${status}-${tipo}`;
}

function desenhaBadgeTipo(ctx: CanvasRenderingContext2D, tipo: TipoEquip, scale: number) {
  const cor = TIPO_COR[tipo];
  const cx = 22 * scale, cy = 19 * scale, r = 12 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 2.5 * scale;
  ctx.strokeStyle = cor;
  ctx.stroke();
  ctx.fillStyle = cor;
  ctx.font = `800 ${13 * scale}px -apple-system, BlinkMacSystemFont, Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tipo === "Repetidor" ? "R" : "D", cx, cy + 0.5 * scale);
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
          const img = new Image();
          img.onload = () => {
            for (const tipo of ["Repetidor", "DCU"] as const) {
              const key = vistoriaIconKey(status, tipo);
              if (map.hasImage(key)) continue;
              const canvas = document.createElement("canvas");
              canvas.width = PIN_W * PIN_RATIO;
              canvas.height = PIN_H * PIN_RATIO;
              const ctx = canvas.getContext("2d");
              if (!ctx) continue;
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              desenhaBadgeTipo(ctx, tipo, PIN_RATIO);
              const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
              map.addImage(
                key,
                { width: canvas.width, height: canvas.height, data: new Uint8Array(data.data.buffer) },
                { pixelRatio: PIN_RATIO }
              );
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
      properties: { id: v.id, icone: vistoriaIconKey(v.status, tipoDe(v)) },
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
            "icon-anchor": "bottom",
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
    </motion.div>
  );
}
