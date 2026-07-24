"use client";

import mapboxgl, { type LngLatLike, type Map as MapboxMap } from "mapbox-gl";
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

// Inject hover style once (avoids JS mouseenter/mouseleave flicker)
if (typeof document !== "undefined" && !document.getElementById("vm-pin-style")) {
  const style = document.createElement("style");
  style.id = "vm-pin-style";
  style.textContent = `
    .vm-pin { cursor: pointer; transition: transform .18s ease; will-change: transform; }
    .vm-pin:hover { transform: translateY(-3px) scale(1.1); }
    .vm-pin img { display: block; pointer-events: none; }
  `;
  document.head.appendChild(style);
}

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

function buildMarkerEl(status: Vistoria["status"]) {
  const root = document.createElement("div");
  root.className = "vm-pin";
  root.style.cssText = "width:44px;height:56px;";
  const img = document.createElement("img");
  img.src = PIN_ICON[status];
  img.width = 44;
  img.height = 56;
  img.alt = status;
  root.appendChild(img);
  return root;
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
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
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
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: initialCenterRef.current,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      pitchWithRotate: false,
      cooperativeGestures: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right"
    );
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
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

  // vistoria markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sync = () => {
      const seen = new Set<string>();
      plottable.forEach((v) => {
        seen.add(v.id);
        const existing = markersRef.current.get(v.id);
        if (existing) {
          existing.setLngLat([v.longitude, v.latitude]);
          return;
        }
        const el = buildMarkerEl(v.status);
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([v.longitude, v.latitude])
          .addTo(map);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelect?.(v.id);
        });
        markersRef.current.set(v.id, marker);
      });
      markersRef.current.forEach((marker, id) => {
        if (!seen.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      });

      // Como o mapa nao recria mais, enquadra a primeira leva de markers uma
      // unica vez (sem userPosition, senao o user marker cuida do enquadre).
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

    if (map.loaded()) sync();
    else map.once("load", sync);
  }, [plottable, onSelect, userPosition]);

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
