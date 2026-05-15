"use client";

import mapboxgl, { type LngLatLike, type Map as MapboxMap } from "mapbox-gl";
import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { MapPinned } from "lucide-react";
import type { Vistoria } from "@/types";
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
  className?: string;
}

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
  className,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const token = getMapboxToken();

  const initialCenter = useMemo<LngLatLike>(() => {
    if (userPosition) return [userPosition.lng, userPosition.lat];
    if (vistorias[0]) return [vistorias[0].longitude, vistorias[0].latitude];
    return DEFAULT_CENTER;
  }, [userPosition, vistorias]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: initialCenter,
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
  }, [initialCenter, token]);

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

  // selected fly-to
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
