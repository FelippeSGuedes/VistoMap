"use client";

/**
 * Mapa "Rota do dia" da Análise Operacional dos Técnicos — mostra o
 * TRAJETO REAL do técnico (trilha de GPS, glpi_plugin_vistomap_locations,
 * mesma fonte de /painel/tecnicos/[id] e do endpoint /api/painel/
 * tecnico-trail) como uma linha sólida, com os pontos de vistoria
 * plotados por cima como marcadores numerados. Antes (até 2026-09-30) a
 * linha só conectava os pins de vistoria em linha reta — não era a rota
 * de verdade, e o campo reclamou ("deve mostrar a rota que o técnico está
 * fazendo"). Cor dos pins por status: verde=realizada, vermelho=reprovada,
 * laranja=em aberto. Arquivo separado do componente principal porque
 * Mapbox é verboso (init seguro + fonte/camada da linha + marcadores +
 * popups).
 */

import mapboxgl from "mapbox-gl";
import { novoMapa } from "@/lib/mapaSeguro";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import { getMapboxToken, DEFAULT_CENTER } from "@/services/maps";
import type { VistoriaTecnicoPeriodo } from "@/services/painel";

const ROUTE_SRC = "vm-analise-rota-src";
const ROUTE_LAYER = "vm-analise-rota-layer";

function toDate(iso: string): Date {
  return new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
}

function fmtHora(iso: string | null): string {
  if (!iso) return "—";
  return toDate(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Realizada(verde)/reprovada(vermelho)/em aberto(laranja) — cor local, não reaproveita sinal.ts (paleta lá diverge do que o usuário pediu aqui). */
function corDoStatus(v: VistoriaTecnicoPeriodo): string {
  if (v.statusName && ["Aprovada", "Aprovado", "Aprovado com Pendências"].includes(v.statusName)) return "#16A34A";
  if (v.statusName && ["Reprovada", "Reprovado"].includes(v.statusName)) return "#DC2626";
  return "#F59E0B";
}

function labelDoStatus(v: VistoriaTecnicoPeriodo): string {
  if (v.statusName && ["Aprovada", "Aprovado", "Aprovado com Pendências"].includes(v.statusName)) return "Realizada";
  if (v.statusName && ["Reprovada", "Reprovado"].includes(v.statusName)) return "Reprovada";
  return "Em aberto";
}

export default function AnaliseOperacionalMapa({
  vistorias,
  trail = [],
}: {
  vistorias: VistoriaTecnicoPeriodo[];
  /** Trilha real de GPS (lng,lat), ordenada cronologicamente — ver /api/painel/tecnico-trail. */
  trail?: Array<[number, number]>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const stops = vistorias.filter(
    (v) => v.latitude != null && v.longitude != null
  ) as Array<VistoriaTecnicoPeriodo & { latitude: number; longitude: number }>;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = getMapboxToken();
    if (!token) return;
    mapboxgl.accessToken = token;
    const { map } = novoMapa(
      {
        container: containerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: DEFAULT_CENTER,
        zoom: 10,
        attributionControl: false,
      },
      "painel/analise-operacional-tecnicos"
    );
    if (!map) return;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      // linha do trajeto real (trilha de GPS), não mais uma reta entre pins
      const lineGeojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: trail },
      };
      const src = map.getSource(ROUTE_SRC) as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(lineGeojson);
      } else {
        map.addSource(ROUTE_SRC, { type: "geojson", data: lineGeojson });
        map.addLayer({
          id: ROUTE_LAYER,
          type: "line",
          source: ROUTE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#2563EB", "line-width": 3, "line-opacity": 0.75 },
        });
      }

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      stops.forEach((s, i) => {
        const cor = corDoStatus(s);
        const el = document.createElement("div");
        el.style.cssText = `
          width:24px;height:24px;border-radius:50%;background:${cor};
          border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);
          display:flex;align-items:center;justify-content:center;
          font:700 10px/1 system-ui,sans-serif;color:#fff;cursor:pointer;
        `;
        el.textContent = String(i + 1);

        const popupHtml = `
          <div style="font:500 12px/1.5 system-ui,sans-serif;min-width:180px">
            <strong>${fmtHora(s.dataVistoria)}</strong> · ${labelDoStatus(s)}<br/>
            <span style="color:#475569">${s.equipamento}</span><br/>
            <span style="color:#64748B">${s.municipio}${s.endereco ? " — " + s.endereco : ""}</span>
            ${s.motivo ? `<br/><span style="color:#B91C1C">${s.motivo}</span>` : ""}
          </div>
        `;
        const popup = new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(popupHtml);
        const marker = new mapboxgl.Marker({ element: el }).setLngLat([s.longitude, s.latitude]).setPopup(popup).addTo(map);
        markersRef.current.push(marker);
      });

      // Bounds cobrem trilha + pins — a trilha real costuma ir além de onde
      // as vistorias aconteceram (trajeto entre paradas).
      const lngs = [...trail.map((c) => c[0]), ...stops.map((s) => s.longitude)];
      const lats = [...trail.map((c) => c[1]), ...stops.map((s) => s.latitude)];
      if (lngs.length > 0) {
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 48, maxZoom: 15, duration: 400 }
        );
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistorias, trail]);

  if (!getMapboxToken()) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-xl bg-[var(--vm-tile)] text-[12px] text-[var(--vm-faint)]">
        Token do Mapbox não configurado.
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden rounded-xl">
      <div ref={containerRef} className="h-full w-full" />
      {stops.length === 0 && trail.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--vm-tile)]/70 text-[12px] font-medium text-[var(--vm-faint)]">
          Sem coordenadas registradas nesse período.
        </div>
      )}
    </div>
  );
}
