"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Map as MapIcon,
  RotateCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { painelService } from "@/services/painel";
import type { AuditEntry, PainelStats, RevisitaPendente, TecnicoAtivo } from "@/types";
import type { HistoricoAnalytics } from "@/services/painel";
import { AreaChart, GaugeRate } from "@/components/painel/Charts";
import { getMapboxToken, DEFAULT_CENTER } from "@/services/maps";
import { api } from "@/services/api";
import type { PainelMapaResponse, PainelMapaTecnico } from "@/types/painel-mapa";
import { asset } from "@/utils/asset";

/* ─── helpers ───────────────────────────────────────────────────────────── */

function relativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function fmtNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",") + "k";
  return String(n);
}

function diaCurto(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function initials(nome: string): string {
  const p = nome.trim().split(/[\s._-]+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

/* ─── constants ─────────────────────────────────────────────────────────── */

const ACCENT = "#00D084";

const STATUS_DOT: Record<TecnicoAtivo["status"], string> = {
  "em-campo":  "#10B981",
  "base":      "#6366F1",
  "off-shift": "#F59E0B",
  "offline":   "#9CA3AF",
};

const STATUS_LABEL: Record<TecnicoAtivo["status"], string> = {
  "em-campo":  "Em campo",
  "base":      "Na base",
  "off-shift": "Off-shift",
  "offline":   "Offline",
};

const TECH_STATUS_COLOR: Record<PainelMapaTecnico["status_operacional"], string> = {
  "em-operacao": "#10B981",
  "em-vistoria": "#3B82F6",
  "parado":      "#F59E0B",
  "offline":     "#9CA3AF",
};

function auditColor(acao: AuditEntry["acao"]): string {
  if (acao.startsWith("login") || acao.startsWith("expediente")) return "#8B5CF6";
  if (acao.startsWith("pdf") || acao === "sincronizacao") return "#3B82F6";
  if (acao.includes("revisita") || acao.includes("atribuida") || acao.includes("desvinculada")) return "#F59E0B";
  return "#059669";
}

function auditIcon(acao: AuditEntry["acao"]) {
  if (acao.startsWith("login") || acao.startsWith("expediente")) return Users;
  if (acao.startsWith("pdf") || acao === "sincronizacao") return FileText;
  if (acao.includes("revisita")) return RotateCw;
  if (acao.includes("atribuida") || acao.includes("desvinculada")) return UserPlus;
  if (acao.includes("aprovada")) return CheckCircle2;
  if (acao.includes("reprovada")) return ShieldAlert;
  return Activity;
}

const CITY_COORDS: Record<string, [number, number]> = {
  "São Paulo":             [-46.6333, -23.5505],
  "Campinas":              [-47.0608, -22.9056],
  "Sorocaba":              [-47.4578, -23.5015],
  "Santo André":           [-46.5386, -23.6644],
  "São Bernardo do Campo": [-46.5643, -23.6939],
  "Guarulhos":             [-46.5333, -23.4628],
  "Osasco":                [-46.7921, -23.5329],
  "Ribeirão Preto":        [-47.8119, -21.1775],
  "São José dos Campos":   [-45.8869, -23.1896],
  "Santos":                [-46.3333, -23.9618],
  "Mauá":                  [-46.4664, -23.6678],
  "Diadema":               [-46.6228, -23.6858],
  "Jundiaí":               [-46.8850, -23.1858],
  "Piracicaba":            [-47.6481, -22.7292],
  "Bauru":                 [-49.0631, -22.3147],
  "Marília":               [-49.9458, -22.2139],
  "São José do Rio Preto": [-49.3744, -20.8197],
  "Araçatuba":             [-50.4322, -21.2089],
  "Curitiba":              [-49.2731, -25.4297],
  "Londrina":              [-51.1731, -23.3045],
  "Maringá":               [-51.9331, -23.4273],
  "Ponta Grossa":          [-50.1625, -25.0945],
  "Cascavel":              [-53.4553, -24.9555],
};

// SP municipalities polygon GeoJSON (tbrugz/geodata-br, property "name" = title-case name)
const SP_GEOJSON_URL =
  "https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-35-mun.json";

function muniColor(value: number, maxVal: number): string {
  const t = maxVal > 0 ? value / maxVal : 0;
  if (t <= 0) return "#F8FAFC";
  if (t < 0.15) return "#D1FAE5";
  if (t < 0.40) return "#6EE7B7";
  if (t < 0.70) return "#10B981";
  return "#047857";
}

function buildFillExpression(
  topMunis: Array<{ municipio: string; total: number }>,
): unknown[] {
  const maxVal = Math.max(...topMunis.map(m => m.total), 1);
  const pairs: unknown[] = [];
  for (const m of topMunis) {
    pairs.push(m.municipio, muniColor(m.total, maxVal));
  }
  return ["match", ["get", "name"], ...pairs, "#F8FAFC"];
}

function injectStyle(id: string, css: string) {
  if (typeof document === "undefined" || document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

/* ─── primitives ────────────────────────────────────────────────────────── */

function Skeleton({ h }: { h: number }) {
  return <div className="w-full animate-pulse rounded-xl bg-[#F3F4F6]" style={{ height: h }} />;
}

function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl bg-white ${className}`}
      style={{ border: "1px solid #E8EAED", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", ...style }}
    >
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WIDGET 02 — Padrão Diário: SP municipalities fill layer
   ══════════════════════════════════════════════════════════════════════════ */

interface HeatmapMapWidgetProps {
  topMunicipios: Array<{ municipio: string; total: number }>;
  totais: { vistoriasFinalizadas: number; pdfsGerados: number };
  mediaSemanal: number;
}

function HeatmapMapWidget({ topMunicipios, totais, mediaSemanal }: HeatmapMapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const popupRef     = useRef<mapboxgl.Popup | null>(null);
  const token        = getMapboxToken();
  const [geoLoaded,  setGeoLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !token) return;
    injectStyle(
      "vm-dash-heat-css",
      ".vm-dash-heat .mapboxgl-ctrl-logo,.vm-dash-heat .mapboxgl-ctrl-attrib{display:none!important}" +
      ".mapboxgl-popup-content{padding:0;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,0.12)}",
    );
    let alive = true;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-48.5, -22.0] as [number, number],
      zoom: 5.7,
      interactive: true,
      scrollZoom: false,
      doubleClickZoom: false,
      dragPan: false,
      dragRotate: false,
      boxZoom: false,
      attributionControl: false,
    });
    mapRef.current = map;

    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    popupRef.current = popup;

    let hoveredId: string | number | null = null;

    map.on("load", async () => {
      try {
        const res = await fetch(SP_GEOJSON_URL);
        const geoJSON = await res.json();
        if (!alive) return;

        const fillExpr = buildFillExpression(topMunicipios);

        map.addSource("vm-sp-src", {
          type: "geojson",
          data: geoJSON,
          promoteId: "id",
        });

        // Municipality fill
        map.addLayer({
          id: "vm-sp-fill",
          type: "fill",
          source: "vm-sp-src",
          paint: {
            "fill-color": fillExpr as mapboxgl.Expression,
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              1.0,
              0.82,
            ] as mapboxgl.Expression,
          },
        });

        // Outline
        map.addLayer({
          id: "vm-sp-outline",
          type: "line",
          source: "vm-sp-src",
          paint: {
            "line-color": "#CBD5E1",
            "line-width": 0.4,
          },
        });

        // Hover outline
        map.addLayer({
          id: "vm-sp-hover-outline",
          type: "line",
          source: "vm-sp-src",
          paint: {
            "line-color": "#059669",
            "line-width": 2,
            "line-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              1,
              0,
            ] as mapboxgl.Expression,
          },
        });

        // Hover interactions
        map.on("mousemove", "vm-sp-fill", (e) => {
          if (!e.features?.length) return;
          const f  = e.features[0];
          const id = f.id;
          map.getCanvas().style.cursor = "crosshair";
          if (hoveredId !== null && hoveredId !== id) {
            map.setFeatureState({ source: "vm-sp-src", id: hoveredId }, { hover: false });
          }
          hoveredId = id ?? null;
          if (hoveredId !== null) {
            map.setFeatureState({ source: "vm-sp-src", id: hoveredId }, { hover: true });
          }
          const name  = f.properties?.name ?? "";
          const found = topMunicipios.find(m => m.municipio === name);
          const total = found?.total ?? 0;
          const maxV  = Math.max(...topMunicipios.map(m => m.total), 1);
          const pct   = topMunicipios.reduce((s, m) => s + m.total, 0);
          const pctStr = pct > 0 ? ((total / pct) * 100).toFixed(1) : "0";
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-family:ui-sans-serif;padding:8px 12px;min-width:130px">
                <div style="font-size:12px;font-weight:700;color:#111827;margin-bottom:3px">${name || "—"}</div>
                <div style="font-size:11px;color:#374151">${total > 0 ? `${total} vistorias · ${pctStr}%` : "Sem atividade"}</div>
              </div>`,
            )
            .addTo(map);
        });

        map.on("mouseleave", "vm-sp-fill", () => {
          map.getCanvas().style.cursor = "";
          if (hoveredId !== null) {
            map.setFeatureState({ source: "vm-sp-src", id: hoveredId }, { hover: false });
            hoveredId = null;
          }
          popup.remove();
        });

        setGeoLoaded(true);
      } catch {
        /* GeoJSON load failure is silent — widget degrades gracefully */
      }
    });

    return () => {
      alive = false;
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update fill colors when data changes without recreating the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getLayer("vm-sp-fill")) return;
    map.setPaintProperty("vm-sp-fill", "fill-color", buildFillExpression(topMunicipios) as mapboxgl.Expression);
  }, [topMunicipios]);

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#059669]" strokeWidth={2} />
          <span className="text-[13px] font-semibold text-[#111827]">Padrão Diário · 30 dias</span>
        </div>
        <div className="flex items-center gap-1 text-[9.5px] text-[#9CA3AF]">
          {["#D1FAE5", "#6EE7B7", "#10B981", "#047857"].map(c => (
            <span key={c} className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
          ))}
          <span className="ml-0.5">+ ativo</span>
        </div>
      </div>
      <div className="relative h-[190px] w-full shrink-0">
        <div ref={containerRef} className="vm-dash-heat h-full w-full" />
        {!geoLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#F9FAFB]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#E8EAED] border-t-[#059669]" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-5 py-3 text-[10.5px] text-[#6B7280]">
        <span>Total: <span className="font-semibold text-[#111827]">{totais.vistoriasFinalizadas}</span></span>
        <span>Média semanal: <span className="font-semibold text-[#111827]">{mediaSemanal.toFixed(1).replace(".", ",")}</span></span>
        <span>PDFs: <span className="font-semibold text-[#111827]">{totais.pdfsGerados}</span></span>
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WIDGET 04 — Equipe ao Vivo
   ══════════════════════════════════════════════════════════════════════════ */

interface TeamMapWidgetProps {
  mapaTeam: PainelMapaTecnico[];
  tecnicosAtivos: TecnicoAtivo[];
  taxaAprov: number;
  taxaRevisita: number;
}

function TeamMapWidget({ mapaTeam, tecnicosAtivos, taxaAprov, taxaRevisita }: TeamMapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const markersRef   = useRef<mapboxgl.Marker[]>([]);
  const popupRef     = useRef<mapboxgl.Popup | null>(null);
  const token        = getMapboxToken();

  useEffect(() => {
    if (!containerRef.current || !token) return;
    injectStyle(
      "vm-dash-team-css",
      ".vm-dash-team .mapboxgl-ctrl-logo,.vm-dash-team .mapboxgl-ctrl-attrib{display:none!important}" +
      ".mapboxgl-popup-content{padding:0;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,0.12)}",
    );
    injectStyle(
      "vm-pulse-kf",
      "@keyframes vm-pulse{0%,100%{transform:scale(1);opacity:0.25}50%{transform:scale(1.7);opacity:0.08}}",
    );
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: DEFAULT_CENTER,
      zoom: 8.5,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    popupRef.current = popup;
    return () => {
      markersRef.current.forEach(mk => mk.remove());
      markersRef.current = [];
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const place = () => {
      markersRef.current.forEach(mk => mk.remove());
      markersRef.current = [];
      mapaTeam
        .filter(t => t.latitude != null && t.longitude != null)
        .forEach(t => {
          const color = TECH_STATUS_COLOR[t.status_operacional];
          const el = document.createElement("div");
          el.style.cssText = "position:relative;width:28px;height:28px;cursor:default";
          el.innerHTML = `
            <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.22;animation:vm-pulse 2.2s ease-in-out infinite"></div>
            <div style="position:absolute;inset:5px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:800;color:#fff;letter-spacing:-.3px">${initials(t.nome)}</div>`;
          const mk = new mapboxgl.Marker({ element: el, anchor: "center" })
            .setLngLat([t.longitude!, t.latitude!])
            .addTo(map);
          markersRef.current.push(mk);
        });
    };
    if (map.isStyleLoaded()) place(); else map.once("load", place);
  }, [mapaTeam]);

  const destaque = tecnicosAtivos.find(t => t.status === "em-campo") ?? tecnicosAtivos[0];
  const emCampoCount = tecnicosAtivos.filter(t => t.status === "em-campo").length;

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#059669]" strokeWidth={2.2} />
          <span className="text-[13px] font-semibold text-[#111827]">Equipe · ao vivo</span>
        </div>
        <div className="flex items-center gap-2">
          {emCampoCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-[3px] text-[9px] font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {emCampoCount} em campo
            </span>
          )}
          <Link href="/painel/mapa" className="flex items-center gap-1 text-[11px] font-semibold text-[#059669] hover:underline">
            Mapa <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div ref={containerRef} className="vm-dash-team h-[190px] w-full shrink-0" />
      {destaque && (
        <div className="flex items-center gap-3 border-t border-[#F3F4F6] px-4 py-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg,#10B981,#059669)" }}
          >
            {initials(destaque.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-[#111827]">{destaque.nome.split(" ")[0]}</p>
            <p className="truncate text-[10px] text-[#9CA3AF]">{destaque.municipio ?? "—"} · {destaque.concluidasHoje} hoje</p>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-wide"
            style={{ background: `${STATUS_DOT[destaque.status]}18`, color: STATUS_DOT[destaque.status] }}
          >
            {STATUS_LABEL[destaque.status]}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 px-4 pb-4 pt-2">
        {[
          { title: "Aprovação", value: taxaAprov,    color: "#059669" },
          { title: "Revisitas", value: taxaRevisita, color: "#F59E0B" },
        ].map(g => (
          <div key={g.title} className="rounded-xl bg-[#F9FAFB] p-3">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#6B7280]">{g.title}</p>
            <div className="h-[60px]">
              <GaugeRate value={g.value} label="%" color={g.color} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WIDGET 03 — Top Municípios: map IS the chart + hover tooltip
   ══════════════════════════════════════════════════════════════════════════ */

interface MunicipiosMapWidgetProps {
  topMunicipios: Array<{ municipio: string; total: number }>;
  tecnicos: TecnicoAtivo[];
}

function MunicipiosMapWidget({ topMunicipios, tecnicos }: MunicipiosMapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const token        = getMapboxToken();

  const totalGlobal = topMunicipios.reduce((s, m) => s + m.total, 0);

  useEffect(() => {
    if (!containerRef.current || !token) return;
    injectStyle(
      "vm-dash-muni-css",
      ".vm-dash-muni .mapboxgl-ctrl-logo,.vm-dash-muni .mapboxgl-ctrl-attrib{display:none!important}" +
      ".vm-muni-popup .mapboxgl-popup-content{padding:0;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,0.14)}",
    );
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-48.5, -22.0] as [number, number],
      zoom: 5.6,
      interactive: true,
      scrollZoom: false,
      doubleClickZoom: false,
      dragPan: false,
      dragRotate: false,
      boxZoom: false,
      attributionControl: false,
    });
    mapRef.current = map;
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "vm-muni-popup",
    });

    const totalVal = topMunicipios.reduce((s, m) => s + m.total, 0);

    map.on("load", () => {
      const maxVal = Math.max(...topMunicipios.map(m => m.total), 1);
      const features = topMunicipios
        .filter(m => CITY_COORDS[m.municipio])
        .map((m, idx) => ({
          type: "Feature" as const,
          id: idx,
          geometry: { type: "Point" as const, coordinates: CITY_COORDS[m.municipio]! },
          properties: {
            name: m.municipio,
            total: m.total,
            pct: totalVal > 0 ? ((m.total / totalVal) * 100).toFixed(1) : "0",
            tecCount: tecnicos.filter(t => t.municipio === m.municipio).length,
          },
        }));

      map.addSource("vm-muni-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });

      // Glow ring
      map.addLayer({
        id: "vm-muni-glow",
        type: "circle",
        source: "vm-muni-src",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "total"], 0, 16, maxVal, 48],
          "circle-color": "#8B5CF6",
          "circle-opacity": 0.10,
          "circle-blur": 1.0,
        },
      });

      // Main circle — radius + hover state color
      map.addLayer({
        id: "vm-muni-circles",
        type: "circle",
        source: "vm-muni-src",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "total"], 0, 6, maxVal, 26],
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            "#7C3AED",
            "#8B5CF6",
          ] as mapboxgl.Expression,
          "circle-opacity": 0.72,
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            2.5,
            1.5,
          ] as mapboxgl.Expression,
          "circle-stroke-color": "#7C3AED",
          "circle-stroke-opacity": 0.88,
        },
      });

      // Count label inside circles (only for top-3)
      map.addLayer({
        id: "vm-muni-labels",
        type: "symbol",
        source: "vm-muni-src",
        filter: [">=", ["get", "total"], Math.max(Math.floor(maxVal * 0.25), 1)],
        layout: {
          "text-field": ["to-string", ["get", "total"]],
          "text-size": 9,
          "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
          "text-anchor": "center",
        },
        paint: { "text-color": "#fff" },
      });

      let hoveredId: string | number | null = null;

      map.on("mousemove", "vm-muni-circles", (e) => {
        if (!e.features?.length) return;
        const f = e.features[0];
        map.getCanvas().style.cursor = "pointer";
        if (hoveredId !== null && hoveredId !== f.id) {
          map.setFeatureState({ source: "vm-muni-src", id: hoveredId }, { hover: false });
        }
        hoveredId = f.id ?? null;
        if (hoveredId !== null) {
          map.setFeatureState({ source: "vm-muni-src", id: hoveredId }, { hover: true });
        }
        const { name, total: t, pct, tecCount } = f.properties as {
          name: string; total: number; pct: string; tecCount: number;
        };
        const rank = topMunicipios.findIndex(m => m.municipio === name) + 1;
        popup.setLngLat(e.lngLat).setHTML(`
          <div style="font-family:ui-sans-serif;padding:10px 13px;min-width:150px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
              ${rank > 0 ? `<span style="display:flex;width:18px;height:18px;border-radius:50%;background:rgba(139,92,246,0.15);color:#8B5CF6;font-size:9px;font-weight:800;align-items:center;justify-content:center">${rank}</span>` : ""}
              <span style="font-size:12px;font-weight:700;color:#111827">${name}</span>
            </div>
            <div style="font-size:11px;color:#374151;margin-bottom:2px"><strong>${t}</strong> vistorias</div>
            <div style="font-size:10.5px;color:#6B7280">${pct}% do total</div>
            ${tecCount > 0 ? `<div style="font-size:10px;color:#8B5CF6;margin-top:4px;padding-top:4px;border-top:1px solid #F3F4F6">${tecCount} técnico${tecCount !== 1 ? "s" : ""} ativo${tecCount !== 1 ? "s" : ""}</div>` : ""}
          </div>`).addTo(map);
      });

      map.on("mouseleave", "vm-muni-circles", () => {
        map.getCanvas().style.cursor = "";
        if (hoveredId !== null) {
          map.setFeatureState({ source: "vm-muni-src", id: hoveredId }, { hover: false });
          hoveredId = null;
        }
        popup.remove();
      });
    });

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[#8B5CF6]" strokeWidth={2} />
          <span className="text-[13px] font-semibold text-[#111827]">Top Municípios · 30d</span>
        </div>
        <span className="text-[10px] text-[#9CA3AF]">passe o mouse</span>
      </div>
      <div ref={containerRef} className="vm-dash-muni h-[200px] w-full shrink-0" />
      <ol className="flex flex-col gap-1 px-4 py-3">
        {topMunicipios.slice(0, 5).map((m, i) => {
          const pct = totalGlobal > 0 ? (m.total / totalGlobal) * 100 : 0;
          return (
            <li key={m.municipio} className="flex items-center gap-2">
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[8px] font-bold tabular-nums"
                style={{
                  background: i < 3 ? "rgba(139,92,246,0.12)" : "rgba(6,59,59,0.05)",
                  color:      i < 3 ? "#8B5CF6"               : "#7A8896",
                }}
              >
                {i + 1}
              </span>
              <span className="flex-1 truncate text-[10.5px] font-medium text-[#374151]">{m.municipio}</span>
              <span className="text-[10px] text-[#9CA3AF]">{pct.toFixed(0)}%</span>
              <span className="w-7 text-right tabular-nums text-[10.5px] font-semibold text-[#111827]">{m.total}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WIDGET 07 — Revisitas: SP map background + highlight problem areas
   ══════════════════════════════════════════════════════════════════════════ */

function RevisitasMapWidget({ revisitas }: { revisitas: RevisitaPendente[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const markersRef   = useRef<mapboxgl.Marker[]>([]);
  const token        = getMapboxToken();
  const hasRevisitas = revisitas.length > 0;

  useEffect(() => {
    if (!containerRef.current || !token) return;
    injectStyle(
      "vm-dash-rev-css",
      ".vm-dash-rev .mapboxgl-ctrl-logo,.vm-dash-rev .mapboxgl-ctrl-attrib{display:none!important}",
    );
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-48.5, -22.0] as [number, number],
      zoom: 5.6,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    return () => {
      markersRef.current.forEach(mk => mk.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const place = () => {
      markersRef.current.forEach(mk => mk.remove());
      markersRef.current = [];
      if (revisitas.length === 0) return;
      const groups = new Map<string, number>();
      revisitas.forEach(r => groups.set(r.municipio, (groups.get(r.municipio) ?? 0) + 1));
      groups.forEach((count, muni) => {
        const coords = CITY_COORDS[muni];
        if (!coords) return;
        const el = document.createElement("div");
        el.style.cssText = "position:relative;width:32px;height:32px";
        el.innerHTML = `
          <div style="position:absolute;inset:0;border-radius:50%;background:#F97316;opacity:0.2;animation:vm-pulse 2s ease-in-out infinite"></div>
          <div style="position:absolute;inset:6px;border-radius:50%;background:#F97316;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:#fff">${count}</div>`;
        const mk = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat(coords)
          .addTo(map);
        markersRef.current.push(mk);
      });
    };
    if (map.isStyleLoaded()) place(); else map.once("load", place);
  }, [revisitas]);

  return (
    <Card style={{ border: hasRevisitas ? "1px solid rgba(249,115,22,0.22)" : "1px solid #E8EAED" }}>
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${hasRevisitas ? "#FFEDD5" : "#F3F4F6"}` }}
      >
        <div className="flex items-center gap-2">
          <RotateCw className="h-3.5 w-3.5 text-orange-500" strokeWidth={2} />
          <span className="text-[12.5px] font-semibold text-[#111827]">
            Revisitas
            {hasRevisitas && (
              <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 py-px text-[10px] font-bold text-orange-600">
                {revisitas.length}
              </span>
            )}
          </span>
        </div>
        <Link href="/painel/revisitas" className="flex items-center gap-1 text-[10.5px] font-semibold text-orange-500 hover:underline">
          Central <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Map always visible as background */}
      <div className="relative">
        <div ref={containerRef} className="vm-dash-rev h-[155px] w-full" />
        {/* Success overlay when no revisitas */}
        {!hasRevisitas && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 backdrop-blur-[3px]">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 shadow-sm">
              <Sparkles className="h-5 w-5 text-emerald-500" strokeWidth={1.5} />
            </div>
            <p className="text-[12px] font-semibold text-[#374151]">Operação em dia</p>
            <p className="text-[10.5px] text-[#9CA3AF]">Sem revisitas pendentes.</p>
          </div>
        )}
      </div>

      {hasRevisitas && (
        <ul className="divide-y divide-orange-50">
          {revisitas.slice(0, 3).map(r => (
            <li key={r.id} className="flex items-start gap-2.5 px-4 py-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-100">
                <ShieldAlert className="h-3 w-3 text-orange-500" strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-semibold text-[#374151]">{r.equipamento}</p>
                <p className="line-clamp-1 text-[10px] text-[#9CA3AF]">{r.municipio} · {relativo(r.reprovadoEm)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE
   ══════════════════════════════════════════════════════════════════════════ */

export default function PainelOverviewPage() {
  const [stats,        setStats]        = useState<PainelStats | null>(null);
  const [tecnicos,     setTecnicos]     = useState<TecnicoAtivo[]>([]);
  const [revisitas,    setRevisitas]    = useState<RevisitaPendente[]>([]);
  const [audit,        setAudit]        = useState<AuditEntry[]>([]);
  const [historico,    setHistorico]    = useState<HistoricoAnalytics | null>(null);
  const [mapaRealtime, setMapaRealtime] = useState<PainelMapaResponse | null>(null);
  const [now,          setNow]          = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [s, t, r, a, h, mp] = await Promise.all([
        painelService.fetchStats(),
        painelService.fetchTecnicos(),
        painelService.fetchRevisitas(),
        painelService.fetchAudit({ limit: 8 }),
        painelService.fetchHistorico(30),
        api.get<PainelMapaResponse>("/api/painel/mapa-realtime").then(res => res.data).catch(() => null),
      ]);
      if (!alive) return;
      setStats(s); setTecnicos(t); setRevisitas(r); setAudit(a); setHistorico(h);
      if (mp) setMapaRealtime(mp);
      setNow(new Date());
    };
    load();
    const poll = window.setInterval(load, 20_000);
    const tick = window.setInterval(() => setNow(new Date()), 1_000);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, []);

  /* ── derived ── */
  const emCampo    = useMemo(() => tecnicos.filter(t => t.status === "em-campo").length, [tecnicos]);
  const expediente = useMemo(
    () => tecnicos.filter(t => t.status === "em-campo" || t.status === "base").length,
    [tecnicos],
  );
  const taxaAprov    = historico?.taxas.aprovacaoPct ?? 0;
  const taxaRevisita = historico?.taxas.revisitaPct  ?? 0;
  const topMunis     = (historico?.topMunicipios  ?? []).slice(0, 8);
  const topTecs      = (historico?.rankingTecnicos ?? []).slice(0, 5);
  const mapaTeam     = mapaRealtime?.tecnicos ?? [];

  const velocity = useMemo(() => {
    if (!historico) return { values: [] as number[], labels: [] as string[], avg: 0, peak: 0, total: 0, delta: 0 };
    const all    = historico.serieDiaria;
    const last   = all.slice(-14);
    const prev   = all.slice(-28, -14);
    const values = last.map(d => d.finalizadas);
    const labels = last.map(d => diaCurto(d.dia));
    const avg    = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const peak   = Math.max(...values, 0);
    const total  = values.reduce((a, b) => a + b, 0);
    const totalPrev = prev.reduce((a, b) => a + b.finalizadas, 0);
    const delta  = totalPrev > 0 ? ((total - totalPrev) / totalPrev) * 100 : 0;
    return { values, labels, avg, peak, total, delta };
  }, [historico]);

  const alertaRevisitas = revisitas.filter(
    r => r.prioridade === "CRITICA" || r.prioridade === "ALTA",
  );

  const heroStats = stats
    ? [
        { val: fmtNum(stats.pendentes + stats.emVistoria), label: "vistorias na fila" },
        { val: String(expediente),                         label: "em expediente"     },
        { val: String(emCampo),                            label: "técnico em campo"  },
        { val: fmtNum(stats.municipiosAtivos),             label: "municípios ativos" },
      ]
    : null;

  const kpis = [
    { label: "Backlog",     value: stats ? fmtNum(stats.pendentes)  : "—",  sub: "aguardando atribuição",  color: "#F59E0B", icon: ClipboardList, href: "/painel/vistorias" },
    { label: "Em vistoria", value: stats ? fmtNum(stats.emVistoria) : "—",  sub: `${emCampo} técnico${emCampo !== 1 ? "s" : ""} em campo`, color: "#3B82F6", icon: Activity,    href: "/painel/mapa" },
    { label: "Concluídas",  value: stats ? fmtNum(stats.vistoriadas): "—",  sub: "aguardando aprovação",   color: "#10B981", icon: CheckCircle2, href: "/painel/historico" },
    { label: "Revisitas",   value: stats ? fmtNum((stats.aguardandoRevisita ?? 0) + (stats.emRevisita ?? 0)) : "—", sub: `${stats?.aguardandoRevisita ?? 0} sem técnico`, color: "#F97316", icon: RotateCw, href: "/painel/revisitas" },
    { label: "Municípios",  value: stats ? fmtNum(stats.municipiosAtivos)   : "—", sub: "com equipamentos ativos", color: "#8B5CF6", icon: Building2, href: undefined as string | undefined },
    { label: "Equipe",      value: stats ? fmtNum(stats.tecnicosAtivos)     : "—", sub: `${emCampo} em campo agora`, color: ACCENT, icon: Users, href: "/painel/tecnicos" },
  ];

  /* ══════════════════════════════ RENDER ══════════════════════════════ */
  return (
    <div className="space-y-4 pb-4">

      {/* ════════════ HERO (não alterar) ════════════ */}
      <div className="relative overflow-hidden rounded-2xl" style={{ height: 500, background: "#050505" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset("/vis.png")}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(105deg, rgba(2,8,5,0.93) 0%, rgba(2,8,5,0.88) 20%, rgba(0,6,4,0.32) 42%, rgba(0,4,3,0.06) 58%, rgba(0,6,4,0.16) 76%, rgba(0,10,7,0.46) 100%)" }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: ["linear-gradient(rgba(0,208,132,0.04) 1px,transparent 1px)", "linear-gradient(90deg,rgba(0,208,132,0.04) 1px,transparent 1px)"].join(","),
            backgroundSize: "40px 40px",
          }}
        />
        <div
          className="absolute inset-x-0 top-0 z-10 flex h-11 items-center gap-4 px-6"
          style={{ borderBottom: "1px solid rgba(0,208,132,0.13)" }}
        >
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
          <span className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: ACCENT }}>SISTEMA EM OPERAÇÃO</span>
          <span className="h-3 w-px" style={{ background: "rgba(255,255,255,0.09)" }} />
          <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.22)" }}>atualiza a cada 20s</span>
          <div className="ml-auto flex items-center gap-2.5">
            {alertaRevisitas.length > 0 && (
              <Link href="/painel/revisitas" className="flex items-center gap-1.5 rounded-lg border border-amber-800/40 bg-amber-900/30 px-2.5 py-1 text-[10.5px] font-semibold text-amber-400 transition hover:bg-amber-900/50">
                <ShieldAlert className="h-3 w-3" />{alertaRevisitas.length} alerta{alertaRevisitas.length !== 1 ? "s" : ""}
              </Link>
            )}
            <div className="rounded-lg px-3 py-[5px]" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <span className="text-[12px] font-mono font-semibold tabular-nums" style={{ color: "#C8D8E0" }}>
                {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
            <Link
              href="/painel/vistorias"
              className="flex items-center gap-1.5 rounded-lg px-3 py-[6px] text-[11.5px] font-bold tracking-wide transition-all hover:brightness-110 hover:scale-105 active:scale-[.97]"
              style={{ background: ACCENT, color: "#050505", boxShadow: `0 0 18px ${ACCENT}55` }}
            >
              <UserPlus className="h-3.5 w-3.5" />Atribuir
            </Link>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 top-11 flex items-stretch">
          <div className="flex w-[360px] shrink-0 flex-col justify-between p-8">
            <div>
              <div className="mb-5 flex items-center gap-2">
                <span className="h-px w-6" style={{ background: "rgba(0,208,132,0.35)" }} />
                <span className="text-[8.5px] font-bold uppercase tracking-[0.30em]" style={{ color: "rgba(0,208,132,0.55)" }}>CENTRAL GIOC</span>
              </div>
              <h1 className="text-[38px] font-bold leading-[1.12] tracking-tight" style={{ color: "#DDF2EC" }}>
                Operação em<br />
                <span style={{ color: ACCENT, textShadow: `0 0 32px ${ACCENT}55` }}>movimento.</span>
              </h1>
              <div className="mt-6 space-y-2.5">
                {heroStats ? (
                  heroStats.map((s, i) => (
                    <motion.div
                      key={s.label}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 + i * 0.07, ease: "easeOut", duration: 0.35 }}
                      className="flex items-baseline gap-2"
                    >
                      <span className="text-[26px] font-bold tabular-nums leading-none" style={{ color: ACCENT }}>{s.val}</span>
                      <span className="text-[11.5px] font-medium" style={{ color: "rgba(255,255,255,0.50)" }}>{s.label}</span>
                    </motion.div>
                  ))
                ) : (
                  [80, 72, 64, 56].map((w, i) => (
                    <div key={i} className="h-7 animate-pulse rounded-lg" style={{ background: "rgba(255,255,255,0.07)", width: `${w}%` }} />
                  ))
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <Link
                href="/painel/vistorias"
                className="flex items-center justify-center gap-2 rounded-[16px] py-3 text-[13px] font-bold tracking-wide transition-all hover:brightness-110 hover:scale-[1.02] active:scale-[.98]"
                style={{ background: ACCENT, color: "#050505", boxShadow: `0 4px 22px ${ACCENT}50` }}
              >
                <UserPlus className="h-4 w-4" />Atribuir Vistorias
              </Link>
              <Link
                href="/painel/mapa"
                className="flex items-center justify-center gap-2 rounded-[16px] py-3 text-[13px] font-semibold tracking-wide transition-all hover:scale-[1.02] active:scale-[.98]"
                style={{ background: "rgba(0,208,132,0.08)", color: ACCENT, border: "1px solid rgba(0,208,132,0.28)" }}
              >
                <MapIcon className="h-4 w-4" />Mapa em Tempo Real
              </Link>
            </div>
          </div>
          <div className="flex flex-1 items-center p-4 pl-2">
            <div className="grid w-full grid-cols-3 gap-3">
              {kpis.map((k, i) => {
                const Icon = k.icon;
                const card = (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 + i * 0.07, ease: "easeOut", duration: 0.38 }}
                    whileHover={{ scale: 1.04, y: -3, transition: { type: "spring", stiffness: 300, damping: 22 } }}
                    className="relative flex flex-col justify-between overflow-hidden rounded-[18px] p-4"
                    style={{
                      background: "rgba(4,14,10,0.66)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      backdropFilter: "blur(24px)",
                      boxShadow: "0 6px 28px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.06)",
                      cursor: k.href ? "pointer" : "default",
                    }}
                  >
                    {/* top accent bar */}
                    <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-[18px]" style={{ background: `linear-gradient(90deg, ${k.color}, ${k.color}00)` }} />
                    {/* ambient glow */}
                    <div className="pointer-events-none absolute -bottom-8 -right-8 h-24 w-24 rounded-full" style={{ background: k.color, filter: "blur(30px)", opacity: 0.10 }} />
                    <div className="flex items-start justify-between">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${k.color}1F`, boxShadow: `0 0 16px ${k.color}26` }}>
                        <Icon className="h-4 w-4" style={{ color: k.color }} strokeWidth={1.75} />
                      </span>
                      {k.href && <span className="text-[12px] font-light" style={{ color: "rgba(255,255,255,0.18)" }}>›</span>}
                    </div>
                    <div className="mt-3">
                      <div className="text-[32px] font-bold leading-none tabular-nums tracking-tight" style={{ color: "#EEF9F4", textShadow: `0 0 32px ${k.color}28` }}>{k.value}</div>
                      <div className="mt-2 text-[9.5px] font-bold uppercase tracking-[0.22em]" style={{ color: `${k.color}CC` }}>{k.label}</div>
                      <div className="mt-0.5 text-[9px] leading-tight" style={{ color: "rgba(255,255,255,0.30)" }}>{k.sub}</div>
                    </div>
                  </motion.div>
                );
                return k.href
                  ? <Link key={k.label} href={k.href} className="block">{card}</Link>
                  : <div key={k.label}>{card}</div>;
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ════════════ LINHA 1: Velocity | Heatmap SP | Equipe ════════════ */}
      <div className="grid grid-cols-3 gap-4">

        {/* Widget 01 — Vistorias Finalizadas · 14 dias */}
        <Card>
          <div className="flex items-start justify-between px-5 pt-5">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#059669]" strokeWidth={2} />
                <span className="text-[13px] font-semibold text-[#111827]">Vistorias Finalizadas · 14 dias</span>
              </div>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="text-[42px] font-bold tabular-nums leading-none tracking-tight text-[#111827]">
                  {velocity.total > 0 ? velocity.total : "—"}
                </span>
                {velocity.delta !== 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{
                      background: velocity.delta >= 0 ? "#ECFDF5" : "#FEF2F2",
                      color:      velocity.delta >= 0 ? "#059669" : "#DC2626",
                    }}
                  >
                    {velocity.delta >= 0 ? "+" : ""}{velocity.delta.toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-[#9CA3AF]">
                Média/dia: <span className="font-semibold text-[#374151]">{velocity.avg.toFixed(1).replace(".", ",")}</span>
                {" "}· Pico: <span className="font-semibold text-[#059669]">{velocity.peak}</span>
              </p>
            </div>
            <Link href="/painel/historico" className="flex items-center gap-1 text-[11px] font-semibold text-[#059669] hover:underline">
              Ver histórico <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="relative mt-4 px-4 pb-4">
            {/* Subtle geographic grid texture behind chart */}
            <div
              className="pointer-events-none absolute inset-0 rounded-xl"
              style={{
                backgroundImage: [
                  "linear-gradient(rgba(5,150,105,0.04) 1px,transparent 1px)",
                  "linear-gradient(90deg,rgba(5,150,105,0.04) 1px,transparent 1px)",
                  "linear-gradient(rgba(5,150,105,0.02) 1px,transparent 1px)",
                  "linear-gradient(90deg,rgba(5,150,105,0.02) 1px,transparent 1px)",
                ].join(","),
                backgroundSize: "40px 40px, 40px 40px, 8px 8px, 8px 8px",
                opacity: 0.9,
              }}
            />
            <div className="relative h-[160px]">
              {velocity.values.length > 0 ? (
                <>
                  <AreaChart data={velocity.values} labels={velocity.labels} color="#059669" height={160} showAxis />
                  {velocity.avg > 0 && (
                    <div
                      className="pointer-events-none absolute left-2 right-2 border-t border-dashed border-amber-400/70"
                      style={{ top: `${12 + (1 - velocity.avg / Math.max(velocity.peak, 1)) * (160 - 24)}px` }}
                    >
                      <span className="absolute -top-[11px] right-0 rounded bg-amber-50 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-700">
                        Média
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <Skeleton h={160} />
              )}
            </div>
          </div>
        </Card>

        {/* Widget 02 — Padrão Diário: SP fill heatmap */}
        {historico ? (
          <HeatmapMapWidget
            topMunicipios={historico.topMunicipios}
            totais={historico.totais}
            mediaSemanal={historico.medias.semanalVistorias}
          />
        ) : (
          <Card><div className="flex-1 p-5"><Skeleton h={280} /></div></Card>
        )}

        {/* Widget 04 — Equipe ao Vivo */}
        <TeamMapWidget
          mapaTeam={mapaTeam}
          tecnicosAtivos={tecnicos.filter(t => t.status === "em-campo" || t.status === "base")}
          taxaAprov={taxaAprov}
          taxaRevisita={taxaRevisita}
        />
      </div>

      {/* ════════════ LINHA 2: Municípios | Técnicos | Atividade | Revisitas ════════════ */}
      <div className="grid grid-cols-4 gap-4">

        {/* Widget 03 — Top Municípios: map IS the chart */}
        <MunicipiosMapWidget topMunicipios={topMunis} tecnicos={tecnicos} />

        {/* Widget 05 — Top Técnicos: performance cockpit */}
        <Card>
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#059669]" strokeWidth={2} />
              <span className="text-[13px] font-semibold text-[#111827]">Top Técnicos · 30d</span>
            </div>
            <Link href="/painel/tecnicos" className="text-[10.5px] font-semibold text-[#059669] hover:underline">ver todos</Link>
          </div>
          <div className="flex flex-col gap-0 px-3 pb-3">
            {topTecs.length > 0 ? (
              topTecs.map((t, i) => {
                const maxTotal = topTecs[0]?.total ?? 1;
                const pct = (t.total / maxTotal) * 100;
                const aprovPct = t.total > 0 ? Math.round((t.aprovadas / t.total) * 100) : 0;
                const badgeColors = ["#F59E0B", "#9CA3AF", "#B45309", "#6B7280", "#6B7280"];
                const badgeBg    = ["#FEF3C7", "#F3F4F6", "#FEF3C7", "#F9FAFB", "#F9FAFB"];
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * i, duration: 0.35, ease: "easeOut" }}
                    className="rounded-xl px-2 py-2.5 transition hover:bg-[#F9FAFB]"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
                        style={{ background: badgeBg[i], color: badgeColors[i] }}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="truncate text-[12px] font-semibold text-[#111827]">{t.nome.split(" ")[0]}</span>
                          <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-[#111827]">{t.total}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F3F4F6]">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: "linear-gradient(90deg,#059669,#34D399)" }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, delay: 0.06 * i + 0.1, ease: [0.22, 0.7, 0.2, 1] }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 pl-[34px]">
                      <span className="rounded-full bg-emerald-50 px-1.5 py-[2px] text-[9px] font-semibold text-emerald-700">
                        {aprovPct}% aprov.
                      </span>
                      {t.cidades > 0 && (
                        <span className="rounded-full bg-[#EDE9FE] px-1.5 py-[2px] text-[9px] font-semibold text-[#7C3AED]">
                          {t.cidades} cidade{t.cidades !== 1 ? "s" : ""}
                        </span>
                      )}
                      {t.revisitas > 0 && (
                        <span className="rounded-full bg-amber-50 px-1.5 py-[2px] text-[9px] font-semibold text-amber-700">
                          {t.revisitas} rev.
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <Skeleton h={200} />
            )}
          </div>
        </Card>

        {/* Widget 06 — Atividade ao Vivo: operational timeline */}
        <Card>
          <div className="flex items-center justify-between border-b border-[#F3F4F6] px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-[#3B82F6]" strokeWidth={2} />
              <span className="text-[12.5px] font-semibold text-[#111827]">Atividade ao vivo</span>
            </div>
            <Link href="/painel/auditoria" className="flex items-center gap-1 text-[10.5px] font-semibold text-[#3B82F6] hover:underline">
              Auditoria <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="px-4 py-3">
            {audit.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-[#D1D5DB]">Sem eventos recentes.</p>
            ) : (
              <div className="relative flex flex-col">
                {/* vertical connector line */}
                <div className="absolute left-[10px] top-3 bottom-3 w-px bg-gradient-to-b from-[#E8EAED] via-[#E8EAED] to-transparent" />
                {audit.slice(0, 6).map((e, i) => {
                  const color = auditColor(e.acao);
                  const Icon  = auditIcon(e.acao);
                  return (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i, duration: 0.3 }}
                      className="relative flex items-start gap-3 py-2"
                    >
                      <span
                        className="relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                        style={{ background: `${color}18`, border: `1.5px solid ${color}44` }}
                      >
                        <Icon className="h-2.5 w-2.5" style={{ color }} strokeWidth={2.5} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] leading-snug text-[#374151]">
                          <span className="font-semibold">{e.ator.nome.split(" ")[0]}</span>{" "}
                          <span className="text-[#9CA3AF]">{e.acao.replace(/[-_]/g, " ")}</span>
                          {e.alvo && <span className="ml-1 font-semibold" style={{ color }}>{e.alvo.label}</span>}
                        </p>
                        <p className="text-[9.5px] text-[#9CA3AF]">{relativo(e.timestamp)}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Widget 07 — Revisitas: SP map + problem areas */}
        <RevisitasMapWidget revisitas={revisitas} />
      </div>

      {/* ════════════ RODAPÉ ════════════ */}
      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-5 py-3 text-[11px] text-[#6B7280]"
        style={{ background: "#F8FAFC", border: "1px solid #E8EAED" }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <span className="font-medium text-[#374151]">Sistema em operação</span>
          <span className="text-[#D1D5DB]">·</span>
          <span>Atualizado {relativo(now.toISOString())}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          <span>Técnicos em campo: <span className="font-semibold text-[#374151]">{emCampo}</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" />
          <span>Em vistoria: <span className="font-semibold text-[#374151]">{stats?.emVistoria ?? 0}</span></span>
        </div>
        {alertaRevisitas.length > 0 && (
          <div className="flex items-center gap-1.5 text-orange-500">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Alertas: <span className="font-semibold">{alertaRevisitas.length}</span></span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 font-mono tabular-nums text-[#9CA3AF]">
          <Clock className="h-3.5 w-3.5" />
          <span>
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
          </span>
        </div>
      </div>

    </div>
  );
}
