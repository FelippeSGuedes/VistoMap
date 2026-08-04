"use client";

/**
 * Mapa do módulo de Instalação — componente NOVO e separado do MapView da
 * vistoria (não reaproveita o arquivo, só o mesmo padrão de Mapbox já
 * validado). Só 2 estados possíveis aqui: Liberado (disponível pra
 * qualquer instalador) e Em Instalação (já travado, só aparece pro
 * instalador que assumiu — a API já filtra isso). Reusa os ícones de pin
 * que já existem (pendente = disponível, em-campo = em andamento).
 */

import mapboxgl, { type LngLatLike, type Map as MapboxMap } from "mapbox-gl";
import { useEffect, useMemo, useRef } from "react";
import type { Instalacao } from "@/types";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAP_STYLE,
  getMapboxToken,
} from "@/services/maps";

interface InstalacaoMapViewProps {
  instalacoes: Instalacao[];
  userPosition?: { lat: number; lng: number } | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const STATE_LIBERADO = 3;

const PIN_ICON = {
  liberado: `${BASE_PATH}/icons/pin-pendente.svg`,
  emInstalacao: `${BASE_PATH}/icons/pin-em-campo.svg`,
};

if (typeof document !== "undefined" && !document.getElementById("vm-inst-pin-style")) {
  const style = document.createElement("style");
  style.id = "vm-inst-pin-style";
  style.textContent = `
    .vm-inst-pin { cursor: pointer; transition: transform .18s ease; will-change: transform; }
    .vm-inst-pin:hover { transform: translateY(-3px) scale(1.1); }
    .vm-inst-pin img { display: block; pointer-events: none; }
  `;
  document.head.appendChild(style);
}

function hasValidCoords(i: Instalacao): i is Instalacao & { latitude: number; longitude: number } {
  return (
    typeof i.latitude === "number" &&
    typeof i.longitude === "number" &&
    Number.isFinite(i.latitude) &&
    Number.isFinite(i.longitude) &&
    (i.latitude !== 0 || i.longitude !== 0)
  );
}

function buildMarkerEl(statusGeralId: number | null) {
  const root = document.createElement("div");
  root.className = "vm-inst-pin";
  root.style.cssText = "width:44px;height:56px;";
  const img = document.createElement("img");
  img.src = statusGeralId === STATE_LIBERADO ? PIN_ICON.liberado : PIN_ICON.emInstalacao;
  img.width = 44;
  img.height = 56;
  img.alt = statusGeralId === STATE_LIBERADO ? "Liberado" : "Em instalação";
  root.appendChild(img);
  return root;
}

export function InstalacaoMapView({
  instalacoes,
  userPosition,
  selectedId,
  onSelect,
  className,
}: InstalacaoMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const token = getMapboxToken();
  const plottable = useMemo(() => instalacoes.filter(hasValidCoords), [instalacoes]);

  const initialCenter = useMemo<LngLatLike>(() => {
    if (userPosition) return [userPosition.lng, userPosition.lat];
    if (plottable[0]) return [plottable[0].longitude, plottable[0].latitude];
    return DEFAULT_CENTER;
  }, [userPosition, plottable]);

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
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      userMarkerRef.current = null;
      didFitRef.current = false;
    };
  }, [token]);

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
          .setPopup(
            new mapboxgl.Popup({ offset: 18 }).setHTML(
              `<div style="padding:10px 12px;font-size:13px;font-weight:600;color:#073B4C;">📍 Sua localização</div>`
            )
          )
          .addTo(map);
      }
    };
    if (map.loaded()) onReady();
    else map.once("load", onReady);
  }, [userPosition]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sync = () => {
      const seen = new Set<string>();
      plottable.forEach((i) => {
        seen.add(i.id);
        const existing = markersRef.current.get(i.id);
        if (existing) {
          existing.setLngLat([i.longitude, i.latitude]);
          return;
        }
        const el = buildMarkerEl(i.statusGeralId);
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([i.longitude, i.latitude])
          .addTo(map);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelect?.(i.id);
        });
        markersRef.current.set(i.id, marker);
      });
      markersRef.current.forEach((marker, id) => {
        if (!seen.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      });

      if (!didFitRef.current && !userPosition && plottable.length > 0) {
        didFitRef.current = true;
        if (plottable.length === 1) {
          map.easeTo({ center: [plottable[0].longitude, plottable[0].latitude], zoom: 14 });
        } else {
          const b = new mapboxgl.LngLatBounds();
          plottable.forEach((i) => b.extend([i.longitude, i.latitude]));
          map.fitBounds(b, { padding: 64, maxZoom: 15, duration: 600 });
        }
      }
    };

    if (map.loaded()) sync();
    else map.once("load", sync);
  }, [plottable, onSelect, userPosition]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const i = instalacoes.find((x) => x.id === selectedId);
    if (!i || !hasValidCoords(i)) return;
    map.flyTo({
      center: [i.longitude, i.latitude],
      zoom: Math.max(map.getZoom(), 13.5),
      essential: true,
      duration: 700,
    });
  }, [selectedId, instalacoes]);

  return <div ref={containerRef} className={className} />;
}
