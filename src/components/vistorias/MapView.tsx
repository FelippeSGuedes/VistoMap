"use client";

import mapboxgl, { type LngLatLike, type Map as MapboxMap } from "mapbox-gl";
import { useEffect, useRef } from "react";
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
const POSTES_ICON = "vm-poste-ico";
const POSTES_LAYER_HALO = "vm-postes-halo";              // halo amarelo blur
const POSTES_LAYER = "vm-postes-symbol";                 // ícones (todos)
const POSTES_LAYER_SELECTED = "vm-postes-symbol-selected"; // ícone maior (1 filtrado)

const PIN_ICON: Record<Vistoria["status"], string> = {
  PENDENTE:   "/icons/pin-pendente.svg",
  EM_CAMPO:   "/icons/pin-em-campo.svg",
  FINALIZADA: "/icons/pin-finalizada.svg",
  APROVADA:   "/icons/pin-finalizada.svg",
  REPROVADA:  "/icons/pin-reprovada.svg",
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

  // Centro INICIAL congelado: ref que captura a 1ª posição válida e não muda mais.
  // Evita re-init do mapa quando userPosition/vistorias mudam de referência.
  const initialCenterRef = useRef<LngLatLike | null>(null);
  if (initialCenterRef.current === null) {
    if (userPosition) {
      initialCenterRef.current = [userPosition.lng, userPosition.lat];
    } else if (vistorias[0]) {
      initialCenterRef.current = [vistorias[0].longitude, vistorias[0].latitude];
    } else {
      initialCenterRef.current = DEFAULT_CENTER;
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: initialCenterRef.current!,
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
    };
    // Init UMA VEZ. Token só muda em hot-reload do dev.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // user position marker + auto-centralizar na 1ª chegada do GPS
  const hasCenteredOnUserRef = useRef(false);
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
      // Primeira vez que ganhamos GPS depois do init → centraliza (uma vez só)
      if (!hasCenteredOnUserRef.current) {
        hasCenteredOnUserRef.current = true;
        map.flyTo({
          center: [userPosition.lng, userPosition.lat],
          zoom: 14,
          duration: 600,
          essential: true,
        });
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
      vistorias.forEach((v) => {
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
    };

    if (map.loaded()) sync();
    else map.once("load", sync);
  }, [vistorias, onSelect]);

  // selected fly-to (vistoria)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const v = vistorias.find((x) => x.id === selectedId);
    if (!v) return;
    map.flyTo({
      center: [v.longitude, v.latitude],
      zoom: Math.max(map.getZoom(), 13.5),
      essential: true,
      duration: 700,
    });
  }, [selectedId, vistorias]);

  /* ────── camada de postes (PostGIS via /postes/proximos) ────────────────── */

  // Refs pra evitar race-condition entre loadImage (async) e o effect de dados.
  const onPosteSelectRef = useRef(onPosteSelect);
  const postesRef = useRef(postes);
  const selectedPosteIdRef = useRef(selectedPosteId);
  useEffect(() => {
    onPosteSelectRef.current = onPosteSelect;
  }, [onPosteSelect]);
  useEffect(() => {
    postesRef.current = postes;
  }, [postes]);
  useEffect(() => {
    selectedPosteIdRef.current = selectedPosteId;
  }, [selectedPosteId]);

  // 1) carrega ícone + source + layers (anexo único)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let iconLoaded = false;
    const loadIcon = () =>
      new Promise<void>((resolve) => {
        if (map.hasImage(POSTES_ICON)) {
          iconLoaded = true;
          return resolve();
        }
        map.loadImage("/posteico.png", (err, image) => {
          if (err || !image) {
            console.warn("[MapView] falhou carregar /posteico.png — usando circle fallback. Erro:", err);
            return resolve();
          }
          if (!map.hasImage(POSTES_ICON)) {
            map.addImage(POSTES_ICON, image);
          }
          iconLoaded = true;
          resolve();
        });
      });

    const ensure = async () => {
      await loadIcon();
      if (map.getSource(POSTES_SRC)) return;

      // Pega o estado MAIS RECENTE de postes via ref — loadImage é async,
      // então a prop pode já ter sido atualizada antes desse ponto.
      const initialData = postesRef.current
        ? (postesToGeoJSON(postesRef.current) as GeoJSON.FeatureCollection)
        : ({ type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection);

      map.addSource(POSTES_SRC, {
        type: "geojson",
        data: initialData,
        promoteId: "id",
      });

      // Halo amarelo atrás do ícone — só quando selecionado.
      map.addLayer({
        id: POSTES_LAYER_HALO,
        source: POSTES_SRC,
        type: "circle",
        filter: ["==", ["get", "id"], -1],
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 10,
            14, 18,
            18, 28,
          ],
          "circle-color": "#FFD166",
          "circle-opacity": 0.55,
          "circle-blur": 0.35,
        },
      });

      if (iconLoaded) {
        // Ícone PNG base — todos os postes.
        map.addLayer({
          id: POSTES_LAYER,
          source: POSTES_SRC,
          type: "symbol",
          layout: {
            "icon-image": POSTES_ICON,
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-size": [
              "interpolate", ["linear"], ["zoom"],
              10, 0.22,
              14, 0.35,
              18, 0.55,
            ],
          },
        });
        // Ícone destacado — só renderiza o feature filtrado por id (selecionado).
        map.addLayer({
          id: POSTES_LAYER_SELECTED,
          source: POSTES_SRC,
          type: "symbol",
          filter: ["==", ["get", "id"], -1],
          layout: {
            "icon-image": POSTES_ICON,
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-size": [
              "interpolate", ["linear"], ["zoom"],
              10, 0.36,
              14, 0.55,
              18, 0.85,
            ],
          },
        });
      } else {
        // Fallback: circle verde se o PNG falhar.
        map.addLayer({
          id: POSTES_LAYER,
          source: POSTES_SRC,
          type: "circle",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7, 18, 12],
            "circle-color": "#06D6A0",
            "circle-stroke-color": "#073B4C",
            "circle-stroke-width": 2,
          },
        });
        map.addLayer({
          id: POSTES_LAYER_SELECTED,
          source: POSTES_SRC,
          type: "circle",
          filter: ["==", ["get", "id"], -1],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 8, 14, 13, 18, 22],
            "circle-color": "#FFD166",
            "circle-stroke-color": "#073B4C",
            "circle-stroke-width": 3,
          },
        });
      }

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

      // Aplica o filtro de selecionado caso já houvesse seleção antes do source nascer.
      const initialSelected = selectedPosteIdRef.current ?? -1;
      const filterExpr = [
        "==",
        ["get", "id"],
        initialSelected,
      ] as mapboxgl.FilterSpecification;
      if (map.getLayer(POSTES_LAYER_HALO)) {
        map.setFilter(POSTES_LAYER_HALO, filterExpr);
      }
      if (map.getLayer(POSTES_LAYER_SELECTED)) {
        map.setFilter(POSTES_LAYER_SELECTED, filterExpr);
      }
    };
    if (map.loaded()) void ensure();
    else map.once("load", () => void ensure());
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

  // 3) destaque do selecionado via filtro (sem feature-state)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const filterExpr = [
        "==",
        ["get", "id"],
        selectedPosteId ?? -1,
      ] as mapboxgl.FilterSpecification;
      if (map.getLayer(POSTES_LAYER_HALO)) {
        map.setFilter(POSTES_LAYER_HALO, filterExpr);
      }
      if (map.getLayer(POSTES_LAYER_SELECTED)) {
        map.setFilter(POSTES_LAYER_SELECTED, filterExpr);
      }
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
