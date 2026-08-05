"use client";

/**
 * Mapa em tempo real do módulo de Instalação — Fase 1 da observabilidade
 * (ver plano). Versão enxuta do /painel/mapa (Vistoria): pins de instalador
 * (posição GPS, mesmo pipeline que já funciona hoje) + pins de poste
 * (liberado/em instalação). Sem trilha, heatmap, camadas 3D ou modais de
 * detalhe — fica pra uma Fase 2. Reconstruído do zero, só reaproveitando
 * Mapbox (infra genérica) — nenhum import de código da Vistoria.
 */

import mapboxgl from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_STYLE, getMapboxToken } from "@/services/maps";
import { fetchInstalacoesMapa } from "@/services/painel-instalacoes";
import type {
  MapaInstaladorStatus,
  PainelInstalacoesMapaInstalador,
  PainelInstalacoesMapaPoste,
  PainelInstalacoesMapaResponse,
} from "@/types/painel-instalacoes";

const POLL_MS = 5_000;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const PIN_ICON = {
  liberado: `${BASE_PATH}/icons/pin-pendente.svg`,
  "em-instalacao": `${BASE_PATH}/icons/pin-em-campo.svg`,
} as const;

const STATUS_COLOR: Record<MapaInstaladorStatus, string> = {
  "em-instalacao": "#3B82F6",
  "em-operacao": "#06D6A0",
  parado: "#F59E0B",
  offline: "#9CA3AF",
};

const STATUS_LABEL: Record<MapaInstaladorStatus, string> = {
  "em-instalacao": "Em instalação",
  "em-operacao": "Em deslocamento",
  parado: "Parado",
  offline: "Offline",
};

const GLASS = {
  background: "var(--vm-glass)",
  backdropFilter: "blur(20px) saturate(160%)",
  WebkitBackdropFilter: "blur(20px) saturate(160%)",
  border: "1px solid var(--vm-glass-border)",
  boxShadow: "var(--vm-glass-shadow)",
  borderRadius: 16,
} as const;

if (typeof document !== "undefined" && !document.getElementById("vm-painel-inst-pin-style")) {
  const style = document.createElement("style");
  style.id = "vm-painel-inst-pin-style";
  style.textContent = `
    .vm-pinst-poste { cursor: pointer; transition: transform .18s ease; }
    .vm-pinst-poste:hover { transform: translateY(-3px) scale(1.08); }
    .vm-pinst-poste img { display: block; pointer-events: none; }
    .vm-pinst-tec { cursor: pointer; width: 20px; height: 20px; border-radius: 9999px; border: 3px solid #fff; }
    .vm-pinst-tec-halo { position: absolute; inset: -8px; border-radius: 9999px; animation: vmPinstPulse 2.2s ease-out infinite; }
    @keyframes vmPinstPulse { 0% { transform: scale(0.6); opacity: 0.55; } 100% { transform: scale(1.8); opacity: 0; } }
  `;
  document.head.appendChild(style);
}

function posteMarkerEl(poste: PainelInstalacoesMapaPoste) {
  const root = document.createElement("div");
  root.className = "vm-pinst-poste";
  root.style.cssText = "width:40px;height:50px;";
  const img = document.createElement("img");
  img.src = PIN_ICON[poste.status];
  img.width = 40;
  img.height = 50;
  img.alt = poste.status;
  root.appendChild(img);
  return root;
}

function instaladorMarkerEl(status: MapaInstaladorStatus) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:relative;width:20px;height:20px;";
  const color = STATUS_COLOR[status];
  if (status !== "offline") {
    const halo = document.createElement("div");
    halo.className = "vm-pinst-tec-halo";
    halo.style.background = color;
    wrap.appendChild(halo);
  }
  const dot = document.createElement("div");
  dot.className = "vm-pinst-tec";
  dot.style.background = color;
  wrap.appendChild(dot);
  return wrap;
}

export default function InstalacoesPainelMapa() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const posteMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const tecMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const [data, setData] = useState<PainelInstalacoesMapaResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const token = getMapboxToken();
    if (!containerRef.current || mapRef.current || !token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      posteMarkersRef.current.clear();
      tecMarkersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchInstalacoesMapa()
        .then((d) => {
          if (alive) {
            setData(d);
            setErro(null);
          }
        })
        .catch(() => {
          if (alive) setErro("Falha ao atualizar o mapa.");
        });
    };
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    const sync = () => {
      const seenPostes = new Set<string>();
      data.postes.forEach((p) => {
        seenPostes.add(p.id);
        const existing = posteMarkersRef.current.get(p.id);
        if (existing) {
          existing.setLngLat([p.longitude, p.latitude]);
          return;
        }
        const el = posteMarkerEl(p);
        const popupHtml = `<div style="padding:8px 10px;font:600 12px system-ui;color:#073B4C;">
          ${p.equipamento}<br/>
          <span style="font-weight:400;color:#667280;">${p.municipio ?? "—"} · ${p.status === "liberado" ? "Liberado" : "Em instalação"}${p.instalador_nome ? " · " + p.instalador_nome : ""}</span>
        </div>`;
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([p.longitude, p.latitude])
          .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(popupHtml))
          .addTo(map);
        posteMarkersRef.current.set(p.id, marker);
      });
      posteMarkersRef.current.forEach((marker, id) => {
        if (!seenPostes.has(id)) {
          marker.remove();
          posteMarkersRef.current.delete(id);
        }
      });

      const seenTecs = new Set<number>();
      data.instaladores
        .filter((t): t is PainelInstalacoesMapaInstalador & { latitude: number; longitude: number } =>
          t.latitude != null && t.longitude != null
        )
        .forEach((t) => {
          seenTecs.add(t.users_id);
          const popupHtml = `<div style="padding:8px 10px;font:600 12px system-ui;color:#073B4C;">
            ${t.nome}<br/>
            <span style="font-weight:400;color:#667280;">${STATUS_LABEL[t.status_operacional]}${t.minutos_atras != null ? " · há " + t.minutos_atras + "min" : ""}</span>
          </div>`;
          const existing = tecMarkersRef.current.get(t.users_id);
          if (existing) {
            existing.setLngLat([t.longitude, t.latitude]);
            existing.getPopup()?.setHTML(popupHtml);
            return;
          }
          const el = instaladorMarkerEl(t.status_operacional);
          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([t.longitude, t.latitude])
            .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(popupHtml))
            .addTo(map);
          tecMarkersRef.current.set(t.users_id, marker);
        });
      tecMarkersRef.current.forEach((marker, id) => {
        if (!seenTecs.has(id)) {
          marker.remove();
          tecMarkersRef.current.delete(id);
        }
      });
    };

    if (map.loaded()) sync();
    else map.once("load", sync);
  }, [data]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute left-3 top-3 z-10 flex flex-col gap-2 p-3 text-[11.5px]" style={{ ...GLASS, width: 220 }}>
        <p className="text-[12px] font-bold" style={{ color: "var(--vm-text)" }}>
          Instalação — Tempo real
        </p>
        <div className="flex flex-col gap-1.5">
          {(Object.keys(STATUS_LABEL) as MapaInstaladorStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              <span style={{ color: "var(--vm-text-muted)" }}>{STATUS_LABEL[s]}</span>
            </div>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-between border-t pt-1.5" style={{ borderColor: "var(--vm-border)" }}>
          <span style={{ color: "var(--vm-text-muted)" }}>Instaladores</span>
          <span className="font-bold" style={{ color: "var(--vm-text)" }}>
            {data?.instaladores.length ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--vm-text-muted)" }}>Postes ativos</span>
          <span className="font-bold" style={{ color: "var(--vm-text)" }}>
            {data?.postes.length ?? "—"}
          </span>
        </div>
      </div>

      {erro && (
        <div
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-xl px-3 py-2 text-[12px] font-semibold text-white"
          style={{ background: "#DC2626" }}
        >
          {erro}
        </div>
      )}
    </div>
  );
}
