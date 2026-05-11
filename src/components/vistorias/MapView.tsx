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
  buildGoogleMapsUrl,
  buildWazeUrl,
  getMapboxToken,
} from "@/services/maps";
import { STATUS_COLOR, STATUS_LABEL, isMobileDevice, formatDistanceKm } from "@/utils/format";

interface MapViewProps {
  vistorias: Vistoria[];
  userPosition?: { lat: number; lng: number } | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
}

function buildMarkerEl(status: Vistoria["status"]) {
  const color = STATUS_COLOR[status];
  const root = document.createElement("div");
  root.className = "vm-pin";
  root.style.cssText = `
    position: relative;
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: translateZ(0);
    cursor: pointer;
    transition: transform .25s cubic-bezier(.2,.7,.3,1);
  `;
  root.innerHTML = `
    <span style="
      position:absolute;
      inset:-6px;
      border-radius:9999px;
      background:radial-gradient(closest-side, ${color}55, ${color}00 70%);
      filter: blur(2px);
    "></span>
    <span style="
      position:absolute;
      inset:0;
      border-radius:9999px;
      border:2px solid ${color}66;
      animation: pulseRing 2.4s cubic-bezier(.215,.61,.355,1) infinite;
    "></span>
    <span style="
      position:relative;
      width:28px;
      height:28px;
      border-radius:9999px;
      background:linear-gradient(135deg, ${color}, ${color}cc);
      box-shadow: 0 6px 16px ${color}55, 0 1px 0 rgba(255,255,255,.4) inset;
      display:flex;
      align-items:center;
      justify-content:center;
      color:#fff;
    ">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2.5L4 6v6c0 5 3.5 8.5 8 9.5 4.5-1 8-4.5 8-9.5V6l-8-3.5z"/>
      </svg>
    </span>
  `;
  root.addEventListener("mouseenter", () => {
    root.style.transform = "translateY(-2px) scale(1.06)";
  });
  root.addEventListener("mouseleave", () => {
    root.style.transform = "";
  });
  return root;
}

function buildPopupHtml(v: Vistoria) {
  const url = isMobileDevice()
    ? buildWazeUrl(v.latitude, v.longitude)
    : buildGoogleMapsUrl(v.latitude, v.longitude);
  return `
    <div style="width:280px;font-family:inherit;color:#073B4C;">
      <div style="padding:14px 16px 10px;background:linear-gradient(135deg,#073B4C,#0A4F65);color:#F8F9FA;">
        <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.7;">${v.glpiId}</div>
        <div style="font-size:15px;font-weight:600;margin-top:2px;line-height:1.25;">${v.equipamento}</div>
        <div style="font-size:12px;opacity:.78;margin-top:4px;">${v.cidade}${v.estado ? " · " + v.estado : ""}</div>
      </div>
      <div style="display:flex;gap:6px;padding:10px 16px 0;">
        <span style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;background:${STATUS_COLOR[v.status]}22;color:${STATUS_COLOR[v.status]};padding:4px 8px;border-radius:999px;">${STATUS_LABEL[v.status]}</span>
        <span style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;background:#E5E7EB;color:#073B4C;padding:4px 8px;border-radius:999px;">${v.prioridade}</span>
      </div>
      <div style="display:flex;gap:8px;padding:12px 16px 14px;">
        <a href="/vistorias/${v.id}" style="flex:1;display:flex;align-items:center;justify-content:center;height:38px;border-radius:12px;background:#F8F9FA;color:#073B4C;font-weight:600;font-size:13px;text-decoration:none;">Abrir</a>
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:38px;border-radius:12px;background:linear-gradient(135deg,#06D6A0,#07A37C);color:#fff;font-weight:600;font-size:13px;text-decoration:none;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          Navegar
        </a>
      </div>
    </div>
  `;
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
        const popup = new mapboxgl.Popup({
          offset: 28,
          closeButton: false,
          maxWidth: "320px",
        }).setHTML(buildPopupHtml(v));
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([v.longitude, v.latitude])
          .setPopup(popup)
          .addTo(map);
        el.addEventListener("click", () => onSelect?.(v.id));
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
    const marker = markersRef.current.get(selectedId);
    marker?.togglePopup();
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
