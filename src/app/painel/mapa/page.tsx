"use client";

import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore } from "@/store/auth";
import { DEFAULT_CENTER, getMapboxToken } from "@/services/maps";
import { api } from "@/services/api";
import type {
  PainelMapaResponse,
  PainelMapaTecnico,
  PainelMapaVistoria,
  SituacaoOperacional,
} from "@/types/painel-mapa";
import {
  Activity,
  Box,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  Globe,
  Layers,
  Map as MapIcon,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  Search,
  Target,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ─── constantes ──────────────────────────────────────────────────────────── */

const VISTORIAS_SRC = "vm-vistorias-src";
const VISTORIAS_POINTS = "vm-vistorias-points";
const HEATMAP_LAYER = "vm-heatmap";
const TRAIL_SRC = "vm-trail-src";
const TRAIL_LAYER = "vm-trail-layer";
const BUILDINGS_LAYER = "vm-3d-buildings";

const LAYER_OPTIONS = [
  // key "dark" mantido por compat; estilo agora é claro (Padrão = mapa claro)
  { key: "dark" as const,      label: "Padrão",   style: "mapbox://styles/mapbox/light-v11" },
  { key: "satellite" as const, label: "Satélite", style: "mapbox://styles/mapbox/satellite-v9" },
  { key: "hybrid" as const,    label: "Híbrido",  style: "mapbox://styles/mapbox/satellite-streets-v12" },
  { key: "3d" as const,        label: "3D",       style: "mapbox://styles/mapbox/light-v11" },
] as const;
type LayerKey = (typeof LAYER_OPTIONS)[number]["key"];

const SITUACAO_COR: Record<string, string> = {
  A_VISTORIAR:       "#F59E0B",
  EM_VISTORIA:       "#3B82F6",
  VISTORIADO:        "#00B388",
  AGUARDANDO_REVISITA: "#F97316",
  EM_REVISITA:       "#A855F7",
  REVISITADO:        "#0EA5E9",
};
const SITUACAO_LABEL: Record<string, string> = {
  A_VISTORIAR:       "A vistoriar",
  EM_VISTORIA:       "Em vistoria",
  VISTORIADO:        "Vistoriado",
  AGUARDANDO_REVISITA: "Ag. revisita",
  EM_REVISITA:       "Em revisita",
  REVISITADO:        "Revisitado",
};

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function relTime(iso?: string | null): string {
  if (!iso) return "sem sinal";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  return `${Math.round(m / 60)} h`;
}

function initials(nome: string): string {
  const p = nome.trim().split(/[\s._-]+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase();
}

function statusColor(s: PainelMapaTecnico["status_operacional"]): string {
  if (s === "em-operacao") return "#00D4A0";
  if (s === "em-vistoria") return "#60A5FA";
  if (s === "parado")      return "#FBBF24";
  return "#475569";
}
function statusLabel(s: PainelMapaTecnico["status_operacional"]): string {
  if (s === "em-operacao") return "Em operação";
  if (s === "em-vistoria") return "Em vistoria";
  if (s === "parado")      return "Parado";
  return "Offline";
}

function vistoriaColor(status: PainelMapaVistoria["status"]): string {
  switch (status) {
    case "A_VISTORIAR": return "#F59E0B";
    case "EM_VISTORIA":  return "#3B82F6";
    case "VISTORIADO":   return "#00B388";
    case "REVISITA":     return "#F97316";
    case "REPROVADO":    return "#EF4444";
    default:             return "#475569";
  }
}

function buildGeoJSON(vistorias: PainelMapaVistoria[]) {
  return {
    type: "FeatureCollection" as const,
    features: vistorias.map((v) => ({
      type: "Feature" as const,
      properties: {
        id: v.id,
        status: v.status,
        color: vistoriaColor(v.status),
        is_revisita: v.is_revisita ? 1 : 0,
        equipamento: v.equipamento,
      },
      geometry: { type: "Point" as const, coordinates: [v.longitude, v.latitude] },
    })),
  };
}

/* ─── marker animation ────────────────────────────────────────────────────── */

function animateMarkerTo(marker: mapboxgl.Marker, lng: number, lat: number, ms = 800) {
  const s = marker.getLngLat();
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - t0) / ms, 1);
    const e = 1 - Math.pow(1 - t, 3);
    marker.setLngLat([s.lng + (lng - s.lng) * e, s.lat + (lat - s.lat) * e]);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ─── tecnico pin SVG ─────────────────────────────────────────────────────── */

function techMarkerEl(t: PainelMapaTecnico): HTMLElement {
  const dotColor = statusColor(t.status_operacional);
  const isOnline = t.status_operacional === "em-operacao" || t.status_operacional === "em-vistoria";
  const gradId = `vmg-${t.users_id}`;
  const firstName = t.nome.split(/\s+/)[0] ?? t.nome;

  const root = document.createElement("div");
  root.className = "vm-pin-root";
  root.style.cssText = "position:relative;width:54px;height:68px;cursor:pointer;";

  const pinWrap = document.createElement("div");
  pinWrap.style.cssText = "position:absolute;inset:0;filter:drop-shadow(0 6px 14px rgba(0,150,136,.38));transition:filter .18s ease;";
  pinWrap.innerHTML = `
    <svg viewBox="0 0 54 68" width="54" height="68" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00C896"/>
          <stop offset="100%" stop-color="#008E74"/>
        </linearGradient>
        <radialGradient id="${gradId}-hl" cx="35%" cy="30%" r="55%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity=".40"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <path d="M27 2C12.6 2 2 12.4 2 26c0 16.5 25 42.5 25 42.5S52 42.5 52 26C52 12.4 41.4 2 27 2Z"
            fill="url(#${gradId})" stroke="#FFFFFF" stroke-width="2.5"/>
      <path d="M27 2C12.6 2 2 12.4 2 26c0 16.5 25 42.5 25 42.5S52 42.5 52 26C52 12.4 41.4 2 27 2Z"
            fill="url(#${gradId}-hl)"/>
      <circle cx="27" cy="26" r="15.5" fill="#FFFFFF"/>
      <g transform="translate(20.5,13)" stroke="#008E74" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <rect x=".5" y=".5" width="12" height="5.5" rx="1.2"/>
        <path d="M3 3l1.2 1.1L6.2 1.8"/>
      </g>
      <text x="27" y="35" text-anchor="middle"
            font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif"
            font-size="11" font-weight="700" fill="#063B3B" letter-spacing="0.6">
        ${initials(t.nome)}
      </text>
    </svg>
    <div style="position:absolute;top:1px;right:1px;width:14px;height:14px;border-radius:50%;
                background:${dotColor};border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.28);
                ${isOnline ? "animation:vmStatusPulse 1.8s ease-out infinite;" : ""}"></div>
  `;

  const label = document.createElement("div");
  label.style.cssText = `
    position:absolute;top:100%;left:50%;transform:translateX(-50%);
    margin-top:6px;padding:3px 10px;border-radius:999px;
    background:rgba(6,11,11,0.90);border:1px solid rgba(0,200,150,0.18);
    box-shadow:0 4px 12px rgba(0,0,0,.4);
    color:#C8E8E4;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;
    font-size:11px;font-weight:600;letter-spacing:.2px;
    white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;
    pointer-events:none;
  `;
  label.textContent = firstName;

  root.appendChild(pinWrap);
  root.appendChild(label);
  root.addEventListener("mouseenter", () => {
    pinWrap.style.filter = "drop-shadow(0 10px 22px rgba(0,200,150,.75)) brightness(1.12)";
  });
  root.addEventListener("mouseleave", () => {
    pinWrap.style.filter = "drop-shadow(0 6px 14px rgba(0,150,136,.38))";
  });
  return root;
}

if (typeof document !== "undefined" && !document.getElementById("vm-op-style")) {
  const s = document.createElement("style");
  s.id = "vm-op-style";
  s.textContent = `
    @keyframes vmStatusPulse{0%{box-shadow:0 0 0 0 currentColor,0 2px 5px rgba(0,0,0,.28)}70%{box-shadow:0 0 0 8px transparent,0 2px 5px rgba(0,0,0,.28)}100%{box-shadow:0 0 0 0 transparent,0 2px 5px rgba(0,0,0,.28)}}
    .vm-map-cursor-cross{cursor:crosshair!important}
    .mapboxgl-ctrl-group{background:rgba(255,255,255,0.96)!important;border:1px solid rgba(0,179,136,0.18)!important;border-radius:12px!important;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.09)!important}
    .mapboxgl-ctrl-group button{background:transparent!important;color:#6B7280!important}
    .mapboxgl-ctrl-group button:hover{background:rgba(0,179,136,0.08)!important}
    .mapboxgl-ctrl-logo{display:none!important}
    .mapboxgl-ctrl-attrib{display:none!important}
  `;
  document.head.appendChild(s);
}

/* ─── glassmorphism dark helper ───────────────────────────────────────────── */

const GLASS = {
  background: "rgba(255,255,255,0.96)",
  backdropFilter: "blur(20px) saturate(160%)",
  WebkitBackdropFilter: "blur(20px) saturate(160%)",
  border: "1px solid rgba(0,179,136,0.16)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.10), 0 1px 0 rgba(255,255,255,0.90) inset",
  borderRadius: 16,
} as const;

/* ─── sub-components ──────────────────────────────────────────────────────── */

interface TechTodayMetrics {
  vistorias_hoje: number;
  km_hoje: number;
  tempo_medio_min: number | null;
}

/* ─── page ────────────────────────────────────────────────────────────────── */

export default function PainelMapaPage() {
  const { session } = useAuthStore();
  const token = getMapboxToken();
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const techMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const editMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const lastDataRef = useRef<PainelMapaResponse | null>(null);

  const [data, setData] = useState<PainelMapaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeLayer, setActiveLayer] = useState<LayerKey>("dark");

  // Seleção
  const [selectedTec, setSelectedTec] = useState<PainelMapaTecnico | null>(null);
  const [selectedVistoria, setSelectedVistoria] = useState<PainelMapaVistoria | null>(null);
  const [trailUsersId, setTrailUsersId] = useState<number | null>(null);

  // Hover card do técnico
  const [hoveredTec, setHoveredTec] = useState<PainelMapaTecnico | null>(null);
  const [hoveredMetrics, setHoveredMetrics] = useState<TechTodayMetrics | null>(null);
  const [hoveredMetricsLoading, setHoveredMetricsLoading] = useState(false);
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number } | null>(null);

  // Painel lateral
  const [aba, setAba] = useState<"tecnicos" | "vistorias">("tecnicos");
  const [filtroSit, setFiltroSit] = useState<"todas" | SituacaoOperacional>("todas");
  const [filtroTec, setFiltroTec] = useState<"todos" | "online" | "parado" | "offline">("todos");
  const [buscaVis, setBuscaVis] = useState("");

  // Modo correção GPS
  const [gpsEditMode, setGpsEditMode] = useState(false);
  const [correctedPos, setCorrectedPos] = useState<{ lat: number; lng: number } | null>(null);

  /* ── fetch ─────────────────────────────────────────────────────────────── */

  const fetchMapa = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      const r = await fetch(`${base}/api/painel/mapa`, {
        headers: { Authorization: `Bearer ${session.token}` },
        cache: "no-store",
      });
      if (!r.ok) return;
      const json = (await r.json()) as PainelMapaResponse;
      setData(json);
      lastDataRef.current = json;
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => {
    fetchMapa();
    const id = window.setInterval(fetchMapa, 5_000);
    return () => window.clearInterval(id);
  }, [fetchMapa]);

  // Rastreia posição do cursor globalmente — usado pelo tooltip dos marcadores
  useEffect(() => {
    const handler = (e: MouseEvent) => { cursorRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", handler, { passive: true });
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  /* ── trail ─────────────────────────────────────────────────────────────── */

  const fetchTrail = useCallback(async (usersId: number) => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    try {
      const r = await api.get<{ coords: [number, number][] }>(
        `/painel/tecnico-trail?users_id=${usersId}&hours=8`
      );
      const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: r.data.coords },
      };
      if (map.getSource(TRAIL_SRC)) {
        (map.getSource(TRAIL_SRC) as GeoJSONSource).setData(geojson);
      } else {
        map.addSource(TRAIL_SRC, { type: "geojson", data: geojson });
        map.addLayer({
          id: TRAIL_LAYER,
          type: "line",
          source: TRAIL_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-width": 3,
            "line-gradient": [
              "interpolate", ["linear"], ["line-progress"],
              0, "rgba(0,200,150,0.0)",
              0.4, "rgba(0,200,150,0.40)",
              1, "rgba(0,200,150,0.92)",
            ],
          },
        }, VISTORIAS_POINTS);
      }
    } catch { /* trail é não-crítico */ }
  }, []);

  const removeTrail = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(TRAIL_LAYER)) map.removeLayer(TRAIL_LAYER);
    if (map.getSource(TRAIL_SRC)) map.removeSource(TRAIL_SRC);
  }, []);

  useEffect(() => {
    if (!trailUsersId) { removeTrail(); return; }
    fetchTrail(trailUsersId);
    const id = window.setInterval(() => fetchTrail(trailUsersId), 30_000);
    return () => { window.clearInterval(id); removeTrail(); };
  }, [trailUsersId, fetchTrail, removeTrail]);

  /* ── init map ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!token || !mapElRef.current || mapRef.current) return;
    const container = mapElRef.current;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/light-v11",
      center: DEFAULT_CENTER,
      zoom: 10,
      attributionControl: false,
      pitchWithRotate: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
    mapRef.current = map;

    // Bulletproof resize: in some webviews 100dvh settles late (>1.5s) and a single
    // resize latches onto a transient short height (canvas stays e.g. 272px while the
    // container is 855px). Keep on(load) + ResizeObserver, AND poll-resize until the
    // canvas height matches the container for a few consecutive ticks, then stop.
    const resize = () => map.resize();
    map.on("load", resize);
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let stable = 0;
    const poll = window.setInterval(() => {
      map.resize();
      const ch = container.clientHeight;
      if (ch > 0 && Math.abs(map.getCanvas().clientHeight - ch) <= 1) {
        if (++stable >= 4) window.clearInterval(poll); // bateu por ~1s → para
      } else {
        stable = 0;
      }
    }, 250);
    const stopPoll = window.setTimeout(() => window.clearInterval(poll), 8000);

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(stopPoll);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      techMarkersRef.current.clear();
    };
  }, [token]);

  /* ── layer switcher ─────────────────────────────────────────────────────── */

  const switchLayer = useCallback((key: LayerKey) => {
    const map = mapRef.current;
    if (!map) return;

    const prev = activeLayer;

    // Saindo do 3D: remove buildings + pitch
    if (prev === "3d" && key !== "3d") {
      if (map.getLayer(BUILDINGS_LAYER)) map.removeLayer(BUILDINGS_LAYER);
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    }

    setActiveLayer(key);

    if (key === "3d") {
      // Não muda estilo — só adiciona pitch + camada de prédios
      map.easeTo({ pitch: 50, bearing: -17, duration: 800 });
      const add3D = () => {
        if (map.getLayer(BUILDINGS_LAYER)) return;
        try {
          map.addLayer({
            id: BUILDINGS_LAYER,
            source: "composite",
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 13,
            paint: {
              "fill-extrusion-color": "#091616",
              "fill-extrusion-height": [
                "interpolate", ["linear"], ["zoom"], 13, 0, 15.05, ["get", "height"],
              ],
              "fill-extrusion-base": ["get", "min_height"],
              "fill-extrusion-opacity": 0.72,
            },
          });
        } catch { /* composite source pode não existir no estilo atual */ }
      };
      if (map.loaded()) add3D();
      else map.once("load", add3D);
      return;
    }

    // Para satellite/hybrid/dark: troca estilo
    const targetStyle = LAYER_OPTIONS.find((l) => l.key === key)!.style;
    const currentStyle = LAYER_OPTIONS.find((l) => l.key === prev)!.style;
    if (targetStyle === currentStyle) return;

    map.setStyle(targetStyle);
    map.once("style.load", () => {
      // Re-adiciona layers de vistorias perdidos com a troca de estilo
      const d = lastDataRef.current;
      if (d) ensureVistoriaLayers(map, d.vistorias);
      // Re-adiciona trail se houver
      if (trailUsersId) fetchTrail(trailUsersId);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayer, trailUsersId, fetchTrail]);

  /* ── GL layer helpers ───────────────────────────────────────────────────── */

  const onPosteSelectRef = useRef<undefined>(undefined);

  function ensureVistoriaLayers(map: mapboxgl.Map, vistorias: PainelMapaVistoria[]) {
    const geojson = buildGeoJSON(vistorias);
    if (map.getSource(VISTORIAS_SRC)) {
      (map.getSource(VISTORIAS_SRC) as GeoJSONSource).setData(geojson);
    } else {
      map.addSource(VISTORIAS_SRC, { type: "geojson", data: geojson });

      map.addLayer({
        id: HEATMAP_LAYER,
        type: "heatmap",
        source: VISTORIAS_SRC,
        maxzoom: 15,
        paint: {
          "heatmap-weight": 1,
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 1.8],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0,   "rgba(0,200,150,0)",
            0.2, "rgba(0,200,150,0.15)",
            0.5, "rgba(0,180,136,0.40)",
            0.8, "rgba(0,150,100,0.68)",
            1,   "rgba(0,110,70,0.88)",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 18, 14, 40],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.65, 15, 0],
        },
      });

      map.addLayer({
        id: VISTORIAS_POINTS,
        type: "circle",
        source: VISTORIAS_SRC,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7, 18, 10],
          "circle-stroke-width": ["case", ["==", ["get", "is_revisita"], 1], 2.5, 1.5],
          "circle-stroke-color": ["case", ["==", ["get", "is_revisita"], 1], "#F59E0B", "rgba(255,255,255,0.9)"],
          "circle-opacity": 0.92,
        },
      });

      map.on("click", VISTORIAS_POINTS, (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const vId = feat.properties?.id as number;
        const v = lastDataRef.current?.vistorias.find((x) => x.id === vId);
        if (v) setSelectedVistoria(v);
      });
      map.on("mouseenter", VISTORIAS_POINTS, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", VISTORIAS_POINTS, () => { map.getCanvas().style.cursor = ""; });
    }
  }

  /* ── sync markers + layers ──────────────────────────────────────────────── */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    const syncTechMarkers = () => {
      const visible = data.tecnicos.filter((t) => {
        if (t.latitude == null || t.longitude == null) return false;
        if (filtroTec === "online") return t.status_operacional === "em-operacao" || t.status_operacional === "em-vistoria";
        if (filtroTec === "parado") return t.status_operacional === "parado";
        if (filtroTec === "offline") return t.status_operacional === "offline";
        return true;
      });
      const seen = new Set<number>();
      visible.forEach((t) => {
        seen.add(t.users_id);
        const existing = techMarkersRef.current.get(t.users_id);
        if (existing) {
          animateMarkerTo(existing, t.longitude!, t.latitude!);
          return;
        }
        const el = techMarkerEl(t);
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([t.longitude!, t.latitude!])
          .addTo(map);
        el.addEventListener("click", () => {
          setSelectedTec(t);
          setSelectedVistoria(null);
          setTrailUsersId(t.users_id);
        });
        el.addEventListener("mouseenter", () => {
          setHoveredPos({ ...cursorRef.current });
          setHoveredTec(t);
          setHoveredMetrics(null);
          setHoveredMetricsLoading(true);
          api.get<TechTodayMetrics>(`/painel/tecnico-today?users_id=${t.users_id}`)
            .then((r) => setHoveredMetrics(r.data))
            .catch(() => setHoveredMetrics(null))
            .finally(() => setHoveredMetricsLoading(false));
        });
        el.addEventListener("mouseleave", () => {
          setHoveredTec(null);
          setHoveredPos(null);
        });
        techMarkersRef.current.set(t.users_id, marker);
      });
      techMarkersRef.current.forEach((m, id) => {
        if (!seen.has(id)) { m.remove(); techMarkersRef.current.delete(id); }
      });
    };

    const sync = () => {
      syncTechMarkers();
      ensureVistoriaLayers(map, data.vistorias);
    };

    if (map.loaded()) sync();
    else map.once("load", sync);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filtroTec]);

  /* ── GPS correção ───────────────────────────────────────────────────────── */

  const enterGpsEditMode = useCallback((v: PainelMapaVistoria) => {
    const map = mapRef.current;
    if (!map) return;
    setGpsEditMode(true);
    setCorrectedPos({ lat: v.latitude, lng: v.longitude });
    map.getCanvas().classList.add("vm-map-cursor-cross");

    const el = document.createElement("div");
    el.style.cssText = `
      width:22px;height:22px;border-radius:50%;
      background:#F59E0B;border:3px solid #fff;
      box-shadow:0 4px 14px rgba(245,158,11,0.6);
      cursor:grab;
    `;
    const marker = new mapboxgl.Marker({ element: el, draggable: true })
      .setLngLat([v.longitude, v.latitude])
      .addTo(map);
    marker.on("drag", () => {
      const p = marker.getLngLat();
      setCorrectedPos({ lat: p.lat, lng: p.lng });
    });
    editMarkerRef.current = marker;
  }, []);

  const exitGpsEditMode = useCallback(() => {
    mapRef.current?.getCanvas().classList.remove("vm-map-cursor-cross");
    editMarkerRef.current?.remove();
    editMarkerRef.current = null;
    setGpsEditMode(false);
    setCorrectedPos(null);
  }, []);

  const saveGpsCorrection = useCallback(async () => {
    if (!selectedVistoria || !correctedPos) return;
    // TODO: implementar endpoint PATCH /api/painel/vistorias/[id]/corrigir-gps
    // que atualiza latitudefield/longitudefield na tabela glpi_plugin_fields_*
    // await api.patch(`/painel/vistorias/${selectedVistoria.id}/corrigir-gps`, correctedPos);
    alert(`Posição salva (scaffold):\n${correctedPos.lat.toFixed(6)}, ${correctedPos.lng.toFixed(6)}`);
    exitGpsEditMode();
  }, [selectedVistoria, correctedPos, exitGpsEditMode]);

  /* ── derived ────────────────────────────────────────────────────────────── */

  const techComGps = useMemo(
    () => (data?.tecnicos ?? []).filter((t) => t.latitude != null && t.longitude != null).length,
    [data]
  );
  const techOnline = useMemo(
    () => (data?.tecnicos ?? []).filter((t) => t.status_operacional === "em-operacao" || t.status_operacional === "em-vistoria").length,
    [data]
  );

  const vistoriasFiltradas = useMemo(() => {
    const all = data?.vistorias ?? [];
    const q = buscaVis.trim().toLowerCase();
    return all.filter((v) => {
      if (filtroSit !== "todas" && v.situacao !== filtroSit) return false;
      if (!q) return true;
      return (
        v.equipamento.toLowerCase().includes(q) ||
        (v.municipio ?? "").toLowerCase().includes(q) ||
        (v.tecnico_nome ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, filtroSit, buscaVis]);

  const contagemSit = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const v of data?.vistorias ?? []) acc[v.situacao] = (acc[v.situacao] ?? 0) + 1;
    return acc;
  }, [data]);

  /* ── render ─────────────────────────────────────────────────────────────── */

  if (!token) {
    return (
      <div className="grid h-full place-items-center" style={{ color: "#6B7280" }}>
        <p className="text-sm">Configure <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> para ativar o mapa.</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* ── MAPA ─────────────────────────────────────────────────────────── */}
      {/* h-full w-full (fluxo normal) mede correto no init; overlays ficam absolutos por cima */}
      <div ref={mapElRef} className="h-full w-full" />

      {/* ── PAINEL LATERAL (glass, overlaid) ─────────────────────────────── */}
      <aside
        className="absolute left-3 top-3 bottom-3 z-10 flex w-[290px] flex-col overflow-hidden"
        style={GLASS}
      >
        {/* Tabs */}
        <div className="flex shrink-0 gap-1 p-1.5" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <TabBtn
            active={aba === "tecnicos"}
            onClick={() => setAba("tecnicos")}
            icon={<Users className="h-3 w-3" />}
            label="Equipe"
            badge={data?.tecnicos.length}
          />
          <TabBtn
            active={aba === "vistorias"}
            onClick={() => setAba("vistorias")}
            icon={<ClipboardList className="h-3 w-3" />}
            label="Vistorias"
            badge={data?.vistorias.length}
          />
        </div>

        {aba === "tecnicos" && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Filtro de status de técnico */}
            <div className="shrink-0 p-2">
              <div className="flex gap-1">
                {(["todos", "online", "parado", "offline"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFiltroTec(k)}
                    className="flex-1 rounded-lg px-1.5 py-1 text-[9.5px] font-semibold capitalize transition"
                    style={{
                      background: filtroTec === k ? "rgba(0,179,136,0.18)" : "rgba(0,0,0,0.03)",
                      color: filtroTec === k ? "#00D4A0" : "#6B7280",
                      border: `1px solid ${filtroTec === k ? "rgba(0,179,136,0.35)" : "rgba(0,0,0,0.05)"}`,
                    }}
                  >
                    {k === "todos" ? "Todos" : k === "online" ? "Online" : k === "parado" ? "Parado" : "Offline"}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              <div className="space-y-1.5">
                {(data?.tecnicos ?? []).map((t) => {
                  const c = statusColor(t.status_operacional);
                  const isOnl = t.status_operacional === "em-operacao" || t.status_operacional === "em-vistoria";
                  return (
                    <button
                      key={t.users_id}
                      type="button"
                      onClick={() => {
                        setSelectedTec(t);
                        setSelectedVistoria(null);
                        setTrailUsersId(t.users_id);
                        if (t.latitude != null && t.longitude != null) {
                          mapRef.current?.flyTo({ center: [t.longitude, t.latitude], zoom: Math.max(14, mapRef.current.getZoom()), duration: 700 });
                        }
                      }}
                      className="w-full rounded-xl p-2.5 text-left transition"
                      style={{
                        background: selectedTec?.users_id === t.users_id ? "rgba(0,179,136,0.12)" : "rgba(0,0,0,0.02)",
                        border: `1px solid ${selectedTec?.users_id === t.users_id ? "rgba(0,179,136,0.25)" : "rgba(0,0,0,0.05)"}`,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                          style={{ background: "linear-gradient(135deg,#00C896,#008E74)" }}
                        >
                          {initials(t.nome)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold" style={{ color: "#111827" }}>
                            {t.nome}
                          </p>
                          <div className="flex items-center gap-1.5 text-[9.5px]" style={{ color: c }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: isOnl ? `0 0 6px ${c}` : "none" }} />
                            <span>{statusLabel(t.status_operacional)}</span>
                            <span style={{ color: "#9CA3AF" }}>·</span>
                            <span style={{ color: "#9CA3AF" }}>{relTime(t.created_at)}</span>
                          </div>
                        </div>
                        {t.accuracy_meters != null && (
                          <span
                            className="shrink-0 rounded-full px-1.5 py-[2px] text-[8.5px] font-semibold"
                            style={{
                              background: t.accuracy_meters < 20 ? "rgba(0,179,136,0.14)" : "rgba(245,158,11,0.14)",
                              color: t.accuracy_meters < 20 ? "#00B388" : "#F59E0B",
                            }}
                          >
                            ±{Math.round(t.accuracy_meters)}m
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {(data?.tecnicos ?? []).length === 0 && (
                  <p className="py-10 text-center text-[11px]" style={{ color: "#9CA3AF" }}>
                    Nenhum técnico ativo.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {aba === "vistorias" && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Busca */}
            <div className="shrink-0 p-2">
              <div
                className="flex items-center gap-2 rounded-xl px-2.5 py-1.5"
                style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}
              >
                <Search className="h-3 w-3 shrink-0" style={{ color: "#9CA3AF" }} />
                <input
                  type="search"
                  value={buscaVis}
                  onChange={(e) => setBuscaVis(e.target.value)}
                  placeholder="Equipamento, técnico, município…"
                  className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                  style={{ color: "#111827" }}
                />
              </div>
            </div>
            {/* Filtros situação */}
            <div className="shrink-0 px-2 pb-1.5">
              <div className="flex flex-wrap gap-1">
                <FiltroPill active={filtroSit === "todas"} label="Todas" n={data?.vistorias.length ?? 0} color="#111827" onClick={() => setFiltroSit("todas")} />
                {(
                  [
                    ["A_VISTORIAR", "A vistoriar", "#F59E0B"],
                    ["EM_VISTORIA", "Em vistoria", "#60A5FA"],
                    ["VISTORIADO", "Vistoriado", "#00B388"],
                    ["AGUARDANDO_REVISITA", "Ag. revisita", "#F97316"],
                    ["EM_REVISITA", "Em revisita", "#C084FC"],
                    ["REVISITADO", "Revisitado", "#38BDF8"],
                  ] as const
                ).map(([key, label, cor]) => (
                  <FiltroPill
                    key={key}
                    active={filtroSit === key}
                    label={label}
                    n={contagemSit[key] ?? 0}
                    color={cor}
                    onClick={() => setFiltroSit(key)}
                  />
                ))}
              </div>
            </div>
            {/* Lista */}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              <div className="space-y-1">
                {vistoriasFiltradas.slice(0, 200).map((v) => {
                  const cor = SITUACAO_COR[v.situacao] ?? "#475569";
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSelectedVistoria(v);
                        setSelectedTec(null);
                        mapRef.current?.flyTo({
                          center: [v.longitude, v.latitude],
                          zoom: Math.max(16, mapRef.current?.getZoom() ?? 16),
                          duration: 700,
                        });
                      }}
                      className="w-full rounded-xl p-2 text-left transition"
                      style={{
                        background: selectedVistoria?.id === v.id ? "rgba(0,179,136,0.10)" : "rgba(0,0,0,0.02)",
                        border: `1px solid ${selectedVistoria?.id === v.id ? "rgba(0,179,136,0.22)" : "rgba(0,0,0,0.03)"}`,
                        borderLeft: `3px solid ${cor}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-[11px] font-semibold" style={{ color: "#111827" }}>
                          {v.equipamento}
                        </p>
                        <span
                          className="shrink-0 rounded-full px-1.5 py-[1px] text-[8px] font-bold uppercase"
                          style={{ background: `${cor}20`, color: cor }}
                        >
                          {SITUACAO_LABEL[v.situacao]}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[9.5px]" style={{ color: "#9CA3AF" }}>
                        <MapPin className="h-2.5 w-2.5" />
                        <span className="truncate">{v.municipio ?? "—"}</span>
                        {v.tecnico_nome && <>
                          <span>·</span>
                          <span className="truncate" style={{ color: "#9CA3AF" }}>{v.tecnico_nome}</span>
                        </>}
                      </div>
                    </button>
                  );
                })}
                {vistoriasFiltradas.length === 0 && (
                  <p className="py-8 text-center text-[11px]" style={{ color: "#9CA3AF" }}>
                    Nenhuma vistoria nesse filtro.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── STATUS BAR (floating top-right) ──────────────────────────────── */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
          style={{
            background: "rgba(0,179,136,0.10)",
            border: "1px solid rgba(0,179,136,0.22)",
            backdropFilter: "blur(12px)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "#00B388", boxShadow: "0 0 8px #00B388", animation: "vmStatusPulse 2s ease-out infinite" }}
          />
          <span className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "#00B388" }}>
            Ao vivo
          </span>
        </div>

        <KpiChip icon={<Wifi className="h-3 w-3" />} label="Online" value={techOnline} accent="#00D4A0" />
        <KpiChip icon={<Users className="h-3 w-3" />} label="Com GPS" value={techComGps} />
        <KpiChip icon={<MapPin className="h-3 w-3" />} label="Vistorias" value={data?.vistorias.length ?? 0} />

        <button
          type="button"
          onClick={fetchMapa}
          className="flex h-8 w-8 items-center justify-center rounded-xl transition"
          style={{ ...GLASS, borderRadius: 10 }}
          title="Atualizar"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} style={{ color: "#00B388" }} />
        </button>
      </div>

      {/* ── LAYER SWITCHER (floating bottom-left after painel) ────────────── */}
      <div
        className="absolute z-10 flex overflow-hidden"
        style={{ bottom: 32, left: 308, ...GLASS, borderRadius: 12, padding: 3 }}
      >
        {LAYER_OPTIONS.map((opt) => {
          const Icon = opt.key === "dark" ? MapIcon
            : opt.key === "satellite" ? Globe
            : opt.key === "hybrid" ? Layers
            : Box;
          const active = activeLayer === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => switchLayer(opt.key)}
              className="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[10.5px] font-semibold transition"
              style={{
                background: active ? "rgba(0,179,136,0.20)" : "transparent",
                color: active ? "#00D4A0" : "#6B7280",
                border: `1px solid ${active ? "rgba(0,179,136,0.40)" : "transparent"}`,
              }}
            >
              <Icon className="h-3 w-3" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* ── GPS EDIT MODE BANNER ──────────────────────────────────────────── */}
      <AnimatePresence>
        {gpsEditMode && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute left-1/2 top-4 z-20 -translate-x-1/2"
            style={{
              ...GLASS,
              borderRadius: 12,
              padding: "10px 16px",
              border: "1px solid rgba(245,158,11,0.40)",
              boxShadow: "0 0 0 1px rgba(245,158,11,0.15), 0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            <div className="flex items-center gap-3">
              <Target className="h-4 w-4" style={{ color: "#F59E0B" }} />
              <div>
                <p className="text-[12px] font-semibold" style={{ color: "#FDE68A" }}>
                  Modo correção GPS — arraste o marcador amarelo
                </p>
                {correctedPos && (
                  <p className="text-[10px]" style={{ color: "#92400E" }}>
                    {correctedPos.lat.toFixed(6)}, {correctedPos.lng.toFixed(6)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={saveGpsCorrection}
                className="rounded-lg px-3 py-1.5 text-[11px] font-bold transition"
                style={{ background: "rgba(245,158,11,0.20)", color: "#FDE68A", border: "1px solid rgba(245,158,11,0.30)" }}
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={exitGpsEditMode}
                className="flex h-6 w-6 items-center justify-center rounded-lg"
                style={{ color: "#92400E" }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HOVER MINI-PROFILE ────────────────────────────────────────────── */}
      {hoveredTec && hoveredPos && (
        <div
          className="pointer-events-none fixed z-[200] w-[220px] rounded-2xl p-3"
          style={{
            left: Math.min(Math.max(hoveredPos.x - 110, 8), (typeof window !== "undefined" ? window.innerWidth : 1200) - 228),
            top: hoveredPos.y - 8,
            transform: "translateY(-100%)",
            ...GLASS,
          }}
        >
          <div className="mb-2 flex items-center gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#00C896,#008E74)" }}
            >
              {initials(hoveredTec.nome)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold" style={{ color: "#111827" }}>
                {hoveredTec.nome}
              </p>
              <p className="text-[10px]" style={{ color: statusColor(hoveredTec.status_operacional) }}>
                {statusLabel(hoveredTec.status_operacional)}
              </p>
            </div>
          </div>
          {hoveredMetricsLoading ? (
            <p className="text-center text-[10px]" style={{ color: "#9CA3AF" }}>carregando…</p>
          ) : hoveredMetrics ? (
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[
                { v: hoveredMetrics.vistorias_hoje, l: "vistorias" },
                { v: `${hoveredMetrics.km_hoje.toFixed(1)}`, l: "km hoje" },
                { v: hoveredMetrics.tempo_medio_min != null ? `${hoveredMetrics.tempo_medio_min}m` : "—", l: "média" },
              ].map((m) => (
                <div key={m.l} className="rounded-lg px-1 py-1.5" style={{ background: "rgba(0,0,0,0.05)" }}>
                  <p className="text-[15px] font-bold" style={{ color: "#111827" }}>{m.v}</p>
                  <p className="text-[9px]" style={{ color: "#9CA3AF" }}>{m.l}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* ── CARD TÉCNICO SELECIONADO ──────────────────────────────────────── */}
      <AnimatePresence>
        {selectedTec && (
          <motion.div
            key={selectedTec.users_id}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute bottom-[88px] right-4 z-10 w-[280px]"
            style={GLASS}
          >
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg,#00C896,#008E74)" }}
                  >
                    {initials(selectedTec.nome)}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: "#111827" }}>
                      {selectedTec.nome}
                    </p>
                    <p className="text-[10px]" style={{ color: statusColor(selectedTec.status_operacional) }}>
                      {statusLabel(selectedTec.status_operacional)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedTec(null); setTrailUsersId(null); }}
                  className="flex h-6 w-6 items-center justify-center rounded-lg"
                  style={{ color: "#9CA3AF" }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {selectedTec.accuracy_meters != null && (
                <div
                  className="mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5"
                  style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}
                >
                  <Target className="h-3 w-3 shrink-0" style={{ color: selectedTec.accuracy_meters < 20 ? "#00B388" : "#F59E0B" }} />
                  <span className="text-[10px]" style={{ color: "#6B7280" }}>
                    Precisão GPS: <strong style={{ color: selectedTec.accuracy_meters < 20 ? "#00B388" : "#F59E0B" }}>
                      ±{Math.round(selectedTec.accuracy_meters)} m
                    </strong>
                    {selectedTec.speed_kmh != null && (
                      <> · <strong style={{ color: "#111827" }}>{selectedTec.speed_kmh.toFixed(1)} km/h</strong></>
                    )}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: "Municípios", value: selectedTec.municipios_ativos, icon: <MapPin className="h-3 w-3" /> },
                  { label: "Vistorias", value: selectedTec.vistorias_ativas, icon: <Activity className="h-3 w-3" /> },
                  { label: "Revisitas", value: selectedTec.revisitas_ativas, icon: <Route className="h-3 w-3" /> },
                  { label: "Última", value: relTime(selectedTec.created_at), icon: <Clock className="h-3 w-3" /> },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
                    style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.05)" }}
                  >
                    <span style={{ color: "#9CA3AF" }}>{m.icon}</span>
                    <div>
                      <p className="text-[9px]" style={{ color: "#9CA3AF" }}>{m.label}</p>
                      <p className="text-[12px] font-semibold" style={{ color: "#111827" }}>{m.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {trailUsersId === selectedTec.users_id && (
                <p className="mt-2 text-[9.5px] font-medium" style={{ color: "#00B388" }}>
                  ● rastro 8h ativo (atualiza 30s)
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CARD VISTORIA SELECIONADA ─────────────────────────────────────── */}
      <AnimatePresence>
        {selectedVistoria && !selectedTec && (
          <motion.div
            key={selectedVistoria.id}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute bottom-4 right-4 z-10 w-[300px]"
            style={GLASS}
          >
            <div className="p-3">
              {/* Header */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold leading-tight" style={{ color: "#111827" }}>
                    {selectedVistoria.equipamento}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 shrink-0" style={{ color: "#9CA3AF" }} />
                    <span className="text-[11px]" style={{ color: "#6B7280" }}>
                      {selectedVistoria.municipio ?? "—"}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span
                    className="rounded-full px-2 py-[3px] text-[9px] font-bold uppercase"
                    style={{
                      background: `${SITUACAO_COR[selectedVistoria.situacao] ?? "#475569"}20`,
                      color: SITUACAO_COR[selectedVistoria.situacao] ?? "#475569",
                    }}
                  >
                    {SITUACAO_LABEL[selectedVistoria.situacao]}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedVistoria(null)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg"
                    style={{ color: "#9CA3AF" }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Técnico */}
              <div
                className="mb-2 flex items-center gap-2 rounded-xl p-2"
                style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                  style={{ background: selectedVistoria.tecnico_nome ? "linear-gradient(135deg,#00C896,#008E74)" : "rgba(255,255,255,0.06)" }}
                >
                  {selectedVistoria.tecnico_nome ? initials(selectedVistoria.tecnico_nome) : "—"}
                </span>
                <div>
                  <p className="text-[9px]" style={{ color: "#9CA3AF" }}>Técnico atribuído</p>
                  <p className="text-[11px] font-semibold" style={{ color: selectedVistoria.tecnico_nome ? "#111827" : "#9CA3AF" }}>
                    {selectedVistoria.tecnico_nome ?? "Sem atribuição"}
                  </p>
                </div>
              </div>

              {/* Coordenadas GPS */}
              <div
                className="mb-3 rounded-xl p-2"
                style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Target className="h-3 w-3" style={{ color: "#00B388" }} />
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#6B7280" }}>
                      Coordenadas GPS
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(`${selectedVistoria.latitude},${selectedVistoria.longitude}`)}
                    className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[9px] font-semibold transition"
                    style={{ color: "#9CA3AF", background: "rgba(0,0,0,0.05)" }}
                  >
                    <Copy className="h-2.5 w-2.5" />
                    Copiar
                  </button>
                </div>
                <p className="font-mono text-[11px]" style={{ color: "#374151" }}>
                  {selectedVistoria.latitude.toFixed(6)}, {selectedVistoria.longitude.toFixed(6)}
                </p>
              </div>

              {/* Ações */}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const url = `https://www.google.com/maps/search/?api=1&query=${selectedVistoria.latitude},${selectedVistoria.longitude}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold transition"
                  style={{ background: "rgba(96,165,250,0.12)", color: "#93C5FD", border: "1px solid rgba(96,165,250,0.20)" }}
                >
                  <Navigation className="h-3 w-3" />
                  Navegar
                </button>
                {!gpsEditMode && (
                  <button
                    type="button"
                    onClick={() => enterGpsEditMode(selectedVistoria)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold transition"
                    style={{ background: "rgba(245,158,11,0.12)", color: "#FCD34D", border: "1px solid rgba(245,158,11,0.20)" }}
                  >
                    <Target className="h-3 w-3" />
                    Corrigir GPS
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── componentes auxiliares ─────────────────────────────────────────────── */

function KpiChip({
  icon, label, value, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5"
      style={{
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(0,179,136,0.18)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <span style={{ color: accent ?? "#9CA3AF" }}>{icon}</span>
      <span className="text-[10px]" style={{ color: "#9CA3AF" }}>{label}</span>
      <span className="text-[12px] font-semibold tabular-nums" style={{ color: accent ?? "#111827" }}>{value}</span>
    </div>
  );
}

function TabBtn({
  active, onClick, icon, label, badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition"
      style={{
        background: active ? "rgba(0,179,136,0.15)" : "transparent",
        color: active ? "#00D4A0" : "#9CA3AF",
        border: active ? "1px solid rgba(0,179,136,0.28)" : "1px solid transparent",
      }}
    >
      {icon}
      {label}
      {badge != null && badge > 0 && (
        <span
          className="rounded-full px-1.5 py-[1px] text-[9px] font-bold tabular-nums"
          style={{
            background: active ? "rgba(0,179,136,0.20)" : "rgba(0,0,0,0.06)",
            color: active ? "#00D4A0" : "#9CA3AF",
          }}
        >
          {badge >= 1000 ? `${(badge / 1000).toFixed(1)}k` : badge}
        </span>
      )}
    </button>
  );
}

function FiltroPill({
  active, label, n, color, onClick,
}: {
  active: boolean;
  label: string;
  n: number;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-semibold transition"
      style={{
        background: active ? `${color}18` : "rgba(0,0,0,0.03)",
        color: active ? color : "#9CA3AF",
        border: `1px solid ${active ? `${color}40` : "rgba(0,0,0,0.05)"}`,
      }}
    >
      {label}
      <span
        className="rounded-full px-1 text-[9px] font-bold tabular-nums"
        style={{ background: active ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.05)" }}
      >
        {n}
      </span>
    </button>
  );
}
