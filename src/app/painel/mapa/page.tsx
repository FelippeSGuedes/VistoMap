"use client";

import mapboxgl, {
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
} from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AnimatePresence, motion } from "framer-motion";
import { TechModel3DLayer, TECH_MODEL_LAYER_ID, type TechEntrySpec } from "./techModel3DLayer";
import {
  getRouteFor,
  peekRoute,
  haversineM,
  projectOntoRoute,
  routeAheadCoordinates,
  type RouteResult,
} from "./routeService";
import { useAuthStore } from "@/store/auth";
import { DEFAULT_CENTER, getMapboxToken } from "@/services/maps";
import { api } from "@/services/api";
import { fetchPostesProximos } from "@/services/postes";
import { asset } from "@/utils/asset";
import type { Poste } from "@/types";
import type {
  PainelMapaResponse,
  PainelMapaTecnico,
  PainelMapaVistoria,
} from "@/types/painel-mapa";
// Instalação — centralizada NESTE mesmo mapa (não é mais uma tela separada),
// com pins de ícone/cor próprios. Fetch e sync 100% independentes do resto
// do arquivo (services/tipos isolados, refs de marker próprios) — nunca
// toca no estado/lógica da Vistoria.
import { fetchInstalacoesMapa } from "@/services/painel-instalacoes";
import type {
  MapaInstaladorStatus,
  PainelInstalacoesMapaInstalador,
  PainelInstalacoesMapaResponse,
} from "@/types/painel-instalacoes";
import { VistoriaDetalheModal } from "@/components/painel/VistoriaDetalheModal";
import { StreetViewModal } from "@/components/painel/StreetViewModal";
import { MapaLoading } from "./MapaLoading";
import {
  ANEL_SEM_TECNICO,
  BORDA_ATRIBUIDO,
  R_EXTERNO,
  R_INTERNO,
  R_NUCLEO_ATRIBUIDO,
  CHAVES_SINAL,
  SITUACAO_LABEL,
  chaveSinal,
  type ChaveSinal,
  corMarcador,
  corSituacao,
  labelSituacao,
  iconeDe,
  registrarSpritesSinal,
  shade,
} from "./sinal";
import {
  Activity,
  Ban,
  Box,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  Globe,
  Info,
  Layers,
  MapPin,
  MapPinned,
  Navigation,
  RadioTower,
  RefreshCw,
  Route,
  Search,
  Wrench,
  Target,
  User,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

// ── Instalação — pins próprios no mapa unificado, ícone/cor diferentes dos
// da Vistoria (instalador = losango roxo, poste = ícone svg próprio, já
// usado no app de campo). Constantes de módulo (não recriam a cada render).
const BP_INST = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const INST_POSTE_ICON = {
  liberado: `${BP_INST}/icons/pin-pendente.svg`,
  "em-instalacao": `${BP_INST}/icons/pin-em-campo.svg`,
} as const;
const INST_TEC_COLOR: Record<MapaInstaladorStatus, string> = {
  "em-instalacao": "#7C3AED",
  "em-operacao": "#A78BFA",
  parado: "#FB923C",
  offline: "#9CA3AF",
};
const INST_TEC_LABEL: Record<MapaInstaladorStatus, string> = {
  "em-instalacao": "Instalando",
  "em-operacao": "Em deslocamento",
  parado: "Parado",
  offline: "Offline",
};

// Glifo do pin de instalador — path oficial do ícone Wrench do lucide-react
// (copiado direto de node_modules/lucide-react/dist/esm/icons/wrench.js, v0.460.0),
// embutido como string estática pra não puxar react-dom/server no bundle do
// cliente só pra renderizar um ícone fixo (custava ~47kB extra no /painel/mapa).
const wrenchSvg = (cor: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">` +
  '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' +
  "</svg>";

// Aba "Equipe" — vistoriador e instalador na mesma lista/mapa, só cor muda.
type PapelEquipe = "vistoriador" | "instalador";

interface MembroEquipe {
  key: string;
  papel: PapelEquipe;
  nome: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  createdAt: string | null;
  bucket: "online" | "parado" | "offline";
  statusColor: string;
  statusLabel: string;
  tecnico?: PainelMapaTecnico;
  instalador?: PainelInstalacoesMapaInstalador;
}

function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ─── painel de seleção do mapa — paleta fixa (enterprise dark) ──────────── */
const PANEL = {
  bg: "#1C222B",
  border: "#2D3642",
  card: "#1C222B",
  cardAlt: "rgba(255,255,255,0.03)",
  text: "#FFFFFF",
  textSoft: "#A5ADB8",
  blue: "#2563EB",
  amber: "#F4B400",
  success: "#22C55E",
  danger: "#EF4444",
} as const;
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

/** Mesmo raio do backend (POSTE_TROCA_RAIO_M) — consistência com o app técnico. */
const POSTES_PROXIMOS_RAIO_M = 100;
const POSTES_PROX_SRC = "vm-postes-prox-src";
const POSTES_PROX_LAYER = "vm-postes-prox-layer";

/* ─── constantes ──────────────────────────────────────────────────────────── */

const VISTORIAS_SRC = "vm-vistorias-src";
// Camadas do marcador "Sinal", de baixo pra cima. O heatmap saiu: virava uma
// mancha verde que escondia justamente o que o mapa precisa mostrar.
const SIG_PULSO = "vm-sig-pulso";     // respiro só de quem está EM VISTORIA
const SIG_SOMBRA = "vm-sig-sombra";   // profundidade — separa o pin do mapa
const SIG_HOVER = "vm-sig-hover";     // halo sob o cursor
const SIG_FOCO = "vm-sig-foco";       // anel do selecionado
const SIG_ANEL = "vm-sig-anel";       // identidade do técnico + miolo branco
const VISTORIAS_POINTS = "vm-vistorias-points"; // sprite de status + etiqueta
const BUILDINGS_LAYER = "vm-3d-buildings";

// O antigo "Padrão" (key "dark") foi REMOVIDO: ele e o 3D já usavam o mesmo
// estilo de mapa, e o 3D é um superconjunto — mesmo mapa, com prédios
// extrudados, inclinação e a camada dos veículos. Manter os dois era oferecer
// a mesma coisa duas vezes, uma delas pior. O 3D virou o padrão do painel.
const LAYER_OPTIONS = [
  { key: "3d" as const,        label: "Padrão",   style: "mapbox://styles/mapbox/light-v11" },
  { key: "satellite" as const, label: "Satélite", style: "mapbox://styles/mapbox/satellite-v9" },
  { key: "hybrid" as const,    label: "Híbrido",  style: "mapbox://styles/mapbox/satellite-streets-v12" },
] as const;
type LayerKey = (typeof LAYER_OPTIONS)[number]["key"];

const MAP_DARK_STYLE = "mapbox://styles/mapbox/dark-v11";

// O padrão (3D) usa mapa claro no tema light e escuro no dark.
// Satélite/Híbrido são imagens de satélite — não mudam com o tema.
function mapStyleFor(key: LayerKey, isDark: boolean): string {
  const base = LAYER_OPTIONS.find((l) => l.key === key)!.style;
  if (key === "3d" && isDark) return MAP_DARK_STYLE;
  return base;
}

function readDarkTheme(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("vm_painel_theme") === "dark";
}

function add3DBuildings(map: mapboxgl.Map) {
  const isDark = readDarkTheme();
  const apply = () => {
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
          // Cor por TEMA. #091616 foi escolhido pro tema escuro; com o 3D
          // virando o modo padrao, no tema claro ele enchia o mapa de blocos
          // pretos — o "fica preto quando chega perto" relatado (predios so
          // aparecem a partir do zoom 13).
          "fill-extrusion-color": isDark ? "#091616" : "#C9D2D6",
          "fill-extrusion-height": [
            "interpolate", ["linear"], ["zoom"], 13, 0, 15.05, ["get", "height"],
          ],
          "fill-extrusion-base": ["get", "min_height"],
          "fill-extrusion-opacity": isDark ? 0.72 : 0.55,
        },
      });
    } catch { /* composite source pode não existir no estilo atual */ }
  };
  if (map.loaded()) apply();
  else map.once("load", apply);
}

/** Camada 3D (Three.js) — carro seguindo rota (em deslocamento) ou beacon
 * (parado/em vistoria) por técnico. Idempotente. */
function ensureTechModelLayer(
  map: mapboxgl.Map,
  layerRef: MutableRefObject<TechModel3DLayer | null>,
  onSelect?: (usersId: number) => void
) {
  if (map.getLayer(TECH_MODEL_LAYER_ID)) {
    if (layerRef.current && onSelect) layerRef.current.onSelect = onSelect;
    return;
  }
  const layer = new TechModel3DLayer();
  layer.onSelect = onSelect;
  map.addLayer(layer);
  layerRef.current = layer;
}

function removeTechModelLayer(map: mapboxgl.Map, layerRef: MutableRefObject<TechModel3DLayer | null>) {
  if (map.getLayer(TECH_MODEL_LAYER_ID)) map.removeLayer(TECH_MODEL_LAYER_ID);
  layerRef.current = null;
}

/**
 * Vistoria que representa o que o técnico está fazendo AGORA — usada como
 * "destino" da rota no mapa 3D.
 *
 * A ordem importa mais que a distância. Um técnico pode ter várias vistorias
 * abertas ao mesmo tempo, em estados diferentes: uma em andamento no local
 * onde ele está e outra já marcada como deslocamento para o próximo
 * equipamento. Escolhendo só pela mais próxima (como era antes), a de
 * deslocamento podia vencer e o painel mostrava o técnico dirigindo enquanto
 * ele estava parado vistoriando.
 *
 * EM_VISTORIA ganha de tudo: significa que ele está fisicamente num local
 * trabalhando, e ninguém vistoria e dirige ao mesmo tempo. Só entre vistorias
 * do MESMO estado é que a distância desempata.
 */
const PRIORIDADE_SITUACAO: Record<string, number> = {
  EM_VISTORIA: 0,
  EM_DESLOCAMENTO: 1,
  ATRIBUIDO: 2,
};

function resolveDestino(t: PainelMapaTecnico, vistorias: PainelMapaVistoria[]): PainelMapaVistoria | null {
  if (t.latitude == null || t.longitude == null) return null;
  let best: PainelMapaVistoria | null = null;
  let bestPrio = Infinity;
  let bestD = Infinity;
  for (const v of vistorias) {
    if (v.tecnico_id !== t.users_id) continue;
    const prio = PRIORIDADE_SITUACAO[v.situacao];
    if (prio === undefined) continue;
    const d = haversineM({ lng: t.longitude, lat: t.latitude }, { lng: v.longitude, lat: v.latitude });
    if (prio < bestPrio || (prio === bestPrio && d < bestD)) {
      bestPrio = prio; bestD = d; best = v;
    }
  }
  return best;
}

const ROUTES_SRC = "vm-tech-routes-src";
const ROUTES_GLOW_LAYER = "vm-tech-routes-glow";
const ROUTES_LINE_LAYER = "vm-tech-routes-line";

/** Linha de rota (estilo Waze/Maps) — uma fonte só com todas as rotas ativas. */
function ensureRouteLayers(map: mapboxgl.Map) {
  if (map.getSource(ROUTES_SRC)) return;
  map.addSource(ROUTES_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: ROUTES_GLOW_LAYER,
    type: "line",
    source: ROUTES_SRC,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#00D4A0", "line-width": 10, "line-blur": 6, "line-opacity": 0.35 },
  });
  map.addLayer({
    id: ROUTES_LINE_LAYER,
    type: "line",
    source: ROUTES_SRC,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#00D4A0", "line-width": 3, "line-opacity": 0.9 },
  });
}

function removeRouteLayers(map: mapboxgl.Map) {
  if (map.getLayer(ROUTES_LINE_LAYER)) map.removeLayer(ROUTES_LINE_LAYER);
  if (map.getLayer(ROUTES_GLOW_LAYER)) map.removeLayer(ROUTES_GLOW_LAYER);
  if (map.getSource(ROUTES_SRC)) map.removeSource(ROUTES_SRC);
}

/** Recebe já os trechos À FRENTE de cada técnico (ver routeAheadCoordinates). */
function updateRouteLineSource(map: mapboxgl.Map, trechos: [number, number][][]) {
  const src = map.getSource(ROUTES_SRC) as GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: "FeatureCollection",
    features: trechos.map((coords) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: coords },
    })),
  });
}

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

/* ─── camadas "Sinal" dos equipamentos ────────────────────────────────────── */

// Tudo que o marcador precisa sai do próprio dado — nenhuma imagem é gerada
// por técnico, então a camada aguenta os 10 mil pontos do LIMIT do backend.
function buildGeoJSON(vistorias: PainelMapaVistoria[]) {
  return {
    type: "FeatureCollection" as const,
    features: vistorias.map((v) => ({
      type: "Feature" as const,
      properties: {
        id: v.id,
        situacao: v.situacao,
        icone: iconeDe(v.situacao, v.is_revisita, v.bloqueio),
        // Cor dominante do marcador (halo de hover, anel de foco, pulso) —
        // em ATRIBUÍDO é a do técnico, no resto é a da família de status.
        cor_marcador: corMarcador(v.situacao, v.tecnico_cor, v.bloqueio),
        // -1 (e não null) pra comparação de expressão funcionar sem coalesce.
        tecnico_id: v.tecnico_id ?? -1,
        tecnico_cor: v.tecnico_cor ?? ANEL_SEM_TECNICO,
        tem_tecnico: v.tecnico_id ? 1 : 0,
        atribuido: v.situacao === "ATRIBUIDO" ? 1 : 0,
        equipamento: v.equipamento,
      },
      geometry: { type: "Point" as const, coordinates: [v.longitude, v.latitude] },
    })),
  };
}

/** As expressões abaixo são montadas em JS; os casts centralizam a tipagem do GL. */
const E = (v: unknown) => v as ExpressionSpecification;
const F = (v: unknown) => v as FilterSpecification;

/**
 * Escala do marcador por zoom.
 *
 * ARMADILHA CARA: a curva de zoom TEM que ser a raiz da expressão. Escrever
 * `["*", raio, ["interpolate", ..., ["zoom"], ...]]` é inválido no Mapbox
 * ("zoom expression may only be used as the input to a top-level step or
 * interpolate") — e `addLayer` NÃO lança: ele só emite um erro no console e
 * descarta a camada inteira em silêncio. Foi assim que disco, anel e sombra
 * sumiram do mapa enquanto o sprite (cujo icon-size já estava na raiz)
 * continuava aparecendo.
 *
 * Então o valor por feature entra nas PARADAS da curva, nunca multiplicando a
 * curva.
 */
const ZOOM_PARADAS: Array<[number, number]> = [[10, 0.55], [14, 0.78], [18, 1]];

function porZoom(valor: unknown): unknown {
  return [
    "interpolate", ["linear"], ["zoom"],
    ...ZOOM_PARADAS.flatMap(([z, f]) => [z, ["*", valor, f]]),
  ];
}

/** O selecionado cresce 18%; o hover usa halo, pra não forçar relayout. */
function comEnfase(valor: unknown, selecionadoId: number | null): unknown {
  if (selecionadoId == null) return valor;
  return ["*", valor, ["case", ["==", ["get", "id"], selecionadoId], 1.18, 1]];
}

const EH_ATRIBUIDO = ["==", ["get", "atribuido"], 1];

/**
 * Disco do marcador. Em ATRIBUÍDO ele é o próprio núcleo, cheio na cor do
 * técnico; nos outros estados é só o vão branco entre anel e núcleo.
 */
function raioDisco(selecionadoId: number | null): unknown {
  return porZoom(comEnfase(["case", EH_ATRIBUIDO, R_NUCLEO_ATRIBUIDO, R_INTERNO], selecionadoId));
}

/** A borda sempre fecha em R_EXTERNO — todo marcador tem o mesmo tamanho. */
function espessuraBorda(selecionadoId: number | null): unknown {
  return porZoom(
    comEnfase(["case", EH_ATRIBUIDO, BORDA_ATRIBUIDO, R_EXTERNO - R_INTERNO], selecionadoId)
  );
}

/** ATRIBUÍDO inverte: dentro é o técnico, fora é um aro branco fino. */
const COR_DISCO = ["case", EH_ATRIBUIDO, ["get", "tecnico_cor"], "#FFFFFF"];
const COR_BORDA = ["case", EH_ATRIBUIDO, "#FFFFFF", ["get", "tecnico_cor"]];
/** Sem técnico o anel é cinza-claro e recuado — o pino "não tem dono". */
const OPACIDADE_BORDA = [
  "case",
  EH_ATRIBUIDO, 0.95,
  ["==", ["get", "tem_tecnico"], 1], 1,
  0.6,
];

/**
 * Fator de opacidade por técnico destacado: as vistorias dele ficam cheias e o
 * resto cai pra 25% — some o ruído sem sumir o contexto (ninguém pediu ocultar).
 */
function fatorDestaque(tecnicoId: number | null): unknown {
  if (tecnicoId == null) return 1;
  return ["case", ["==", ["get", "tecnico_id"], tecnicoId], 1, 0.25];
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
  // Mesma FORMA de sempre — só a cor passa a ser a identidade do técnico, a
  // mesma do anel das vistorias dele. É o que liga pessoa ↔ equipamento sem
  // precisar clicar em nada.
  const cor = t.cor || "#00C896";
  const claro = shade(cor, 0.14);
  const escuro = shade(cor, -0.26);

  const root = document.createElement("div");
  root.className = "vm-pin-root";
  root.dataset.cor = cor;
  root.style.cssText = "position:relative;width:54px;height:68px;cursor:pointer;";

  const pinWrap = document.createElement("div");
  const sombraBase = `drop-shadow(0 6px 14px ${tint(escuro, 0.42)})`;
  pinWrap.style.cssText = `position:absolute;inset:0;filter:${sombraBase};transition:filter .18s ease;`;
  pinWrap.innerHTML = `
    <svg viewBox="0 0 54 68" width="54" height="68" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${claro}"/>
          <stop offset="100%" stop-color="${escuro}"/>
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
      <g transform="translate(20.5,13)" stroke="${escuro}" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <rect x=".5" y=".5" width="12" height="5.5" rx="1.2"/>
        <path d="M3 3l1.2 1.1L6.2 1.8"/>
      </g>
      <text x="27" y="35" text-anchor="middle"
            font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif"
            font-size="11" font-weight="700" fill="var(--vm-ink)" letter-spacing="0.6">
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
    background:rgba(6,11,11,0.90);border:1px solid ${tint(claro, 0.4)};
    box-shadow:0 4px 12px rgba(0,0,0,.4);
    color:#EDF3F2;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;
    font-size:11px;font-weight:600;letter-spacing:.2px;
    white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;
    pointer-events:none;
  `;
  label.textContent = firstName;

  root.appendChild(pinWrap);
  root.appendChild(label);
  root.addEventListener("mouseenter", () => {
    pinWrap.style.filter = `drop-shadow(0 10px 22px ${tint(claro, 0.75)}) brightness(1.12)`;
  });
  root.addEventListener("mouseleave", () => {
    pinWrap.style.filter = sombraBase;
  });
  return root;
}

/* ─── instalador pin — mesmo formato/qualidade do pin de técnico (teardrop,
   gradiente, iniciais, badge de status), só que roxo e com o glifo de chave
   de boca (WRENCH_SVG, path oficial do lucide-react). O antigo marcador
   (losango roxo liso) foi trocado por esse — ficava feio e sem nenhum
   acabamento comparado ao pin do técnico. ────────────────────────────────── */

function instaladorMarkerEl(t: PainelInstalacoesMapaInstalador): HTMLElement {
  const dotColor = INST_TEC_COLOR[t.status_operacional];
  const isOnline = t.status_operacional === "em-instalacao" || t.status_operacional === "em-operacao";
  const gradId = `vmgi-${t.users_id}`;
  const firstName = t.nome.split(/\s+/)[0] ?? t.nome;
  // Instalador também tem cor de identidade (mesma paleta). O papel continua
  // legível pela chave de boca e pela etiqueta roxa — a cor agora diz QUEM é.
  const cor = t.cor || "#A78BFA";
  const claro = shade(cor, 0.14);
  const escuro = shade(cor, -0.26);

  const root = document.createElement("div");
  root.className = "vm-pin-root";
  root.dataset.cor = cor;
  root.style.cssText = "position:relative;width:54px;height:68px;cursor:pointer;";

  const pinWrap = document.createElement("div");
  const sombraBase = `drop-shadow(0 6px 14px ${tint(escuro, 0.42)})`;
  pinWrap.style.cssText = `position:absolute;inset:0;filter:${sombraBase};transition:filter .18s ease;`;
  pinWrap.innerHTML = `
    <svg viewBox="0 0 54 68" width="54" height="68" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${claro}"/>
          <stop offset="100%" stop-color="${escuro}"/>
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
      <text x="27" y="35" text-anchor="middle"
            font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif"
            font-size="11" font-weight="700" fill="var(--vm-ink)" letter-spacing="0.6">
        ${initials(t.nome)}
      </text>
    </svg>
    <div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);width:15px;height:15px;pointer-events:none;">
      ${wrenchSvg(escuro)}
    </div>
    <div style="position:absolute;top:1px;right:1px;width:14px;height:14px;border-radius:50%;
                background:${dotColor};border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.28);
                ${isOnline ? "animation:vmStatusPulse 1.8s ease-out infinite;" : ""}"></div>
  `;

  const label = document.createElement("div");
  label.style.cssText = `
    position:absolute;top:100%;left:50%;transform:translateX(-50%);
    margin-top:6px;padding:3px 10px;border-radius:999px;
    background:rgba(43,18,74,0.90);border:1px solid rgba(124,58,237,0.35);
    box-shadow:0 4px 12px rgba(0,0,0,.4);
    color:#E4D9FB;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;
    font-size:11px;font-weight:600;letter-spacing:.2px;
    white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;
    pointer-events:none;
  `;
  label.textContent = firstName;

  root.appendChild(pinWrap);
  root.appendChild(label);
  root.addEventListener("mouseenter", () => {
    pinWrap.style.filter = `drop-shadow(0 10px 22px ${tint(claro, 0.75)}) brightness(1.12)`;
  });
  root.addEventListener("mouseleave", () => {
    pinWrap.style.filter = sombraBase;
  });
  return root;
}

if (typeof document !== "undefined" && !document.getElementById("vm-op-style")) {
  const s = document.createElement("style");
  s.id = "vm-op-style";
  s.textContent = `
    @keyframes vmStatusPulse{0%{box-shadow:0 0 0 0 currentColor,0 2px 5px rgba(0,0,0,.28)}70%{box-shadow:0 0 0 8px transparent,0 2px 5px rgba(0,0,0,.28)}100%{box-shadow:0 0 0 0 transparent,0 2px 5px rgba(0,0,0,.28)}}
    .vm-map-cursor-cross{cursor:crosshair!important}
    .mapboxgl-ctrl-group{background:var(--vm-glass)!important;border:1px solid var(--vm-glass-border)!important;border-radius:12px!important;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.09)!important}
    .mapboxgl-ctrl-group button{background:transparent!important;color:var(--vm-muted)!important}
    .mapboxgl-ctrl-group button:hover{background:rgba(0,179,136,0.08)!important}
    .mapboxgl-ctrl-logo{display:none!important}
    .mapboxgl-ctrl-attrib{display:none!important}

    /* ── tela de carregamento do mapa (ver MapaLoading.tsx) ── */
    .vm-ld{background:rgba(15,23,42,.82);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
      background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);
      background-size:40px 40px;box-shadow:inset 0 0 120px rgba(0,0,0,.55)}
    .vm-ld-stack{display:flex;flex-direction:column;align-items:center;gap:18px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .vm-ld-radar{position:relative;width:160px;height:160px;display:flex;align-items:center;justify-content:center}
    .vm-ld-ring{position:absolute;inset:0;border-radius:999px;border:2px solid rgba(0,212,160,.45);animation:vmRadar 3s ease-out infinite;opacity:0}
    .vm-ld-ring:nth-of-type(2){animation-delay:1s}
    .vm-ld-ring:nth-of-type(3){animation-delay:2s}
    @keyframes vmRadar{0%{transform:scale(.18);opacity:.9}100%{transform:scale(1.05);opacity:0}}
    .vm-ld-logo{position:relative;height:78px;width:auto;animation:vmFloat 2s ease-in-out infinite;filter:drop-shadow(0 10px 20px rgba(0,212,160,.42))}
    @keyframes vmFloat{0%,100%{transform:translateY(-5px)}50%{transform:translateY(5px)}}
    .vm-ld-sombra{position:absolute;bottom:22px;width:22px;height:6px;border-radius:999px;background:rgba(0,0,0,.55);filter:blur(3px);animation:vmSombra 2s ease-in-out infinite}
    @keyframes vmSombra{0%,100%{transform:scaleX(.7);opacity:.35}50%{transform:scaleX(1.15);opacity:.7}}
    .vm-ld-wm{margin:0;font-size:3rem;font-weight:800;letter-spacing:-.03em;line-height:1;color:#fff}
    .vm-ld-wm b{color:#00D4A0;font-weight:800}
    .vm-ld-lbl{margin:0;font-size:11px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:#94a3b8}
    .vm-ld-bar{display:block;width:120px;height:2px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;position:relative}
    .vm-ld-bar i{position:absolute;top:0;left:-40%;width:40%;height:100%;background:#00D4A0;border-radius:2px;animation:vmSlide 1.5s ease-in-out infinite}
    @keyframes vmSlide{0%{left:-40%}100%{left:100%}}
    .vm-ld-sub{margin:-6px 0 0;font-size:11px;color:#64748b}
    @media (prefers-reduced-motion:reduce){
      .vm-ld-ring,.vm-ld-logo,.vm-ld-sombra,.vm-ld-bar i{animation:none}
      .vm-ld-ring:first-of-type{opacity:.5}
    }
  `;
  document.head.appendChild(s);
}

/* ─── glassmorphism dark helper ───────────────────────────────────────────── */

const GLASS = {
  background: "var(--vm-glass)",
  backdropFilter: "blur(20px) saturate(160%)",
  WebkitBackdropFilter: "blur(20px) saturate(160%)",
  border: "1px solid var(--vm-glass-border)",
  boxShadow: "var(--vm-glass-shadow)",
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
  const vistoriasFiltradasRef = useRef<PainelMapaVistoria[]>([]);
  // Camada 3D (Three.js) — só existe/atualiza no modo "3d".
  const tech3DLayerRef = useRef<TechModel3DLayer | null>(null);
  // Refs próprios da Instalação — nunca compartilha marker/cache com a Vistoria.
  const instaladorMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const posteInstMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  const [data, setData] = useState<PainelMapaResponse | null>(null);
  const [instalacaoData, setInstalacaoData] = useState<PainelInstalacoesMapaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeLayer, setActiveLayer] = useState<LayerKey>("3d");
  // Tema lido apenas no init — o toggle no client-layout recarrega a página,
  // então o mapa sempre nasce no tema certo (sem setStyle reativo/flicker).
  const activeLayerRef = useRef<LayerKey>("3d");
  useEffect(() => { activeLayerRef.current = activeLayer; }, [activeLayer]);

  // Seleção
  const [selectedTec, setSelectedTec] = useState<PainelMapaTecnico | null>(null);
  const [selectedVistoria, setSelectedVistoriaRaw] = useState<PainelMapaVistoria | null>(null);
  // Marca quem esta selecionado na lista lateral. Nasceu como "quem tem
  // rastro ligado"; o rastro saiu, a selecao ficou.
  const [selecionadoNaLista, setSelecionadoNaLista] = useState<number | null>(null);

  // Postes próximos / detalhe completo / Street View — a partir do pino selecionado
  const [postesProximos, setPostesProximos] = useState<Poste[]>([]);
  const [postesProximosLoading, setPostesProximosLoading] = useState(false);
  const [postesProximosAtivo, setPostesProximosAtivo] = useState(false);
  const [detalheVistoria, setDetalheVistoria] = useState<PainelMapaVistoria | null>(null);
  const [streetViewVistoria, setStreetViewVistoria] = useState<PainelMapaVistoria | null>(null);

  // Troca/fecha a vistoria selecionada → limpa a camada de postes próximos
  // (senão os pontos roxos de uma seleção anterior ficavam "grudados" no mapa).
  const setSelectedVistoria = useCallback((v: PainelMapaVistoria | null) => {
    setSelectedVistoriaRaw(v);
    setPostesProximosAtivo(false);
    setPostesProximos([]);
    const map = mapRef.current;
    if (map?.getSource(POSTES_PROX_SRC)) {
      (map.getSource(POSTES_PROX_SRC) as GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
    }
  }, []);

  // Mantém o painel de detalhe em dia com o polling (5s) — sem isso, depois
  // de atribuir um técnico (ou qualquer outra mudança) pelo próprio painel,
  // o card ficava preso no snapshot de antes da ação até fechar e reabrir.
  // setSelectedVistoriaRaw direto (não o wrapper) pra não resetar o toggle
  // de "postes próximos" a cada re-sincronização.
  useEffect(() => {
    if (!selectedVistoria || !data) return;
    const atualizada = data.vistorias.find((v) => v.id === selectedVistoria.id);
    if (atualizada && atualizada !== selectedVistoria) {
      setSelectedVistoriaRaw(atualizada);
    }
  }, [data, selectedVistoria]);

  // Hover card da vistoria (equipamento sob o cursor no mapa)
  const [hoveredVis, setHoveredVis] = useState<PainelMapaVistoria | null>(null);
  const [hoveredVisPos, setHoveredVisPos] = useState<{ x: number; y: number } | null>(null);
  // Tela de carregamento: primeiro load e troca de estilo — nunca no poll.
  const [mapaCarregando, setMapaCarregando] = useState(true);

  // Hover card do técnico
  const [hoveredTec, setHoveredTec] = useState<PainelMapaTecnico | null>(null);
  const [hoveredMetrics, setHoveredMetrics] = useState<TechTodayMetrics | null>(null);
  const [hoveredMetricsLoading, setHoveredMetricsLoading] = useState(false);
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number } | null>(null);

  // Painel lateral
  const [aba, setAba] = useState<"tecnicos" | "vistorias" | "instalacao">("tecnicos");
  const [filtroSit, setFiltroSit] = useState<"todas" | ChaveSinal>("todas");
  const [filtroTec, setFiltroTec] = useState<"todos" | "online" | "parado" | "offline">("todos");
  // Aba "Equipe" mostra vistoriadores + instaladores juntos, diferenciados só
  // por cor — esse filtro decide qual papel aparece na lista/mapa.
  const [filtroPapel, setFiltroPapel] = useState<"todos" | "vistoriador" | "instalador">("todos");
  const [buscaVis, setBuscaVis] = useState("");

  // Modo correção GPS
  const [gpsEditMode, setGpsEditMode] = useState(false);
  const [correctedPos, setCorrectedPos] = useState<{ lat: number; lng: number } | null>(null);

  // Atribuição direta do mapa
  const [atribuirVistoria, setAtribuirVistoria] = useState<PainelMapaVistoria | null>(null);
  const [atribuirTecId, setAtribuirTecId] = useState<number | "">("");
  const [atribuirMotivo, setAtribuirMotivo] = useState("");
  const [atribuirLoading, setAtribuirLoading] = useState(false);

  // Recusar vistoria em nome do técnico — pra quando ele fica incapacitado
  // de fazer isso pelo próprio app (acidente, celular quebrado, etc).
  const [recusarVistoria, setRecusarVistoria] = useState<PainelMapaVistoria | null>(null);
  const [recusarJustificativa, setRecusarJustificativa] = useState("");
  const [recusarLoading, setRecusarLoading] = useState(false);
  const [recusarError, setRecusarError] = useState<string | null>(null);

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

  // Instalação — poll totalmente independente do fetchMapa acima (nunca
  // entra no mesmo request/estado da Vistoria); mesma cadência (5s).
  useEffect(() => {
    let alive = true;
    const loadInstalacao = () => {
      fetchInstalacoesMapa()
        .then((d) => { if (alive) setInstalacaoData(d); })
        .catch(() => {});
    };
    loadInstalacao();
    const id = window.setInterval(loadInstalacao, 5_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  // Rastreia posição do cursor globalmente — usado pelo tooltip dos marcadores
  useEffect(() => {
    const handler = (e: MouseEvent) => { cursorRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", handler, { passive: true });
    return () => window.removeEventListener("mousemove", handler);
  }, []);



  /* ── init map ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!token || !mapElRef.current || mapRef.current) return;
    const container = mapElRef.current;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container,
      style: mapStyleFor(activeLayerRef.current, readDarkTheme()),
      center: DEFAULT_CENTER,
      zoom: 10,
      attributionControl: false,
      pitchWithRotate: true,
      antialias: true, // custom layer 3D (Three.js) precisa disso pra não serrilhar
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
    mapRef.current = map;
    // CustomLayerInterface só funciona certo em projeção mercator — mapbox-gl v3
    // usa "globe" por padrão nesses estilos, e todo setStyle() reseta pra globe
    // de novo (reforçado nos callbacks de style.load abaixo).
    map.setProjection("mercator");

    // Bulletproof resize: in some webviews 100dvh settles late (>1.5s) and a single
    // resize latches onto a transient short height (canvas stays e.g. 272px while the
    // container is 855px). Keep on(load) + ResizeObserver, AND poll-resize until the
    // canvas height matches the container for a few consecutive ticks, then stop.
    const resize = () => map.resize();
    map.on("load", resize);

    // O 3D agora é o modo padrão, então ele precisa ser montado já na carga
    // inicial. Antes esse preparo só rodava em switchLayer(), porque o mapa
    // sempre nascia no modo "Padrão" plano e o 3D era uma escolha do usuário.
    map.on("load", () => {
      if (activeLayerRef.current !== "3d") return;
      map.setProjection("mercator");
      map.easeTo({ pitch: 50, bearing: -17, duration: 0 });
      add3DBuildings(map);
      ensureRouteLayers(map);
    });
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
      tech3DLayerRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const clearAll = () => {
      instaladorMarkersRef.current.forEach((m) => m.remove());
      instaladorMarkersRef.current.clear();
      posteInstMarkersRef.current.forEach((m) => m.remove());
      posteInstMarkersRef.current.clear();
    };

    if (!instalacaoData) {
      clearAll();
      return;
    }

    const sync = () => {
      const seenPostes = new Set<string>();
      instalacaoData.postes.forEach((p) => {
        seenPostes.add(p.id);
        const existing = posteInstMarkersRef.current.get(p.id);
        if (existing) {
          existing.setLngLat([p.longitude, p.latitude]);
          return;
        }
        const el = document.createElement("div");
        el.style.cssText = "width:34px;height:42px;cursor:pointer;";
        const img = document.createElement("img");
        img.src = INST_POSTE_ICON[p.status];
        img.width = 34;
        img.height = 42;
        img.alt = p.status;
        el.appendChild(img);
        const popup = new mapboxgl.Popup({ offset: 18 }).setHTML(
          `<div style="padding:8px 10px;font:600 12px system-ui;color:#073B4C;">
            ${p.equipamento}<br/>
            <span style="font-weight:400;color:#667280;">${p.municipio ?? "—"} · ${p.status === "liberado" ? "Liberado" : "Em instalação"}${p.instalador_nome ? " · " + p.instalador_nome : ""}</span>
          </div>`
        );
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([p.longitude, p.latitude])
          .setPopup(popup)
          .addTo(map);
        posteInstMarkersRef.current.set(p.id, marker);
      });
      posteInstMarkersRef.current.forEach((m, id) => {
        if (!seenPostes.has(id)) { m.remove(); posteInstMarkersRef.current.delete(id); }
      });

      // Pins de instalador respeitam os MESMOS filtros de papel/status da
      // aba Equipe (consistência lista ↔ mapa) — igual ao que já acontece
      // com os pins de técnico em syncTechMarkers.
      const seenTecs = new Set<number>();
      const showInstaladores = filtroPapel !== "vistoriador";
      if (showInstaladores) {
        instalacaoData.instaladores
          .filter((t): t is PainelInstalacoesMapaInstalador & { latitude: number; longitude: number } =>
            t.latitude != null && t.longitude != null
          )
          .filter((t) => {
            const bucket =
              t.status_operacional === "em-instalacao" || t.status_operacional === "em-operacao"
                ? "online"
                : t.status_operacional === "parado"
                ? "parado"
                : "offline";
            if (filtroTec === "todos") return bucket !== "offline";
            return bucket === filtroTec;
          })
          .forEach((t) => {
            seenTecs.add(t.users_id);
            const existing = instaladorMarkersRef.current.get(t.users_id);
            if (existing) {
              existing.setLngLat([t.longitude, t.latitude]);
              return;
            }
            const el = instaladorMarkerEl(t);
            el.addEventListener("click", () => {
              setSelectedTec(null);
              setSelectedVistoria(null);
              setSelecionadoNaLista(t.users_id);
            });
            const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
              .setLngLat([t.longitude, t.latitude])
              .addTo(map);
            instaladorMarkersRef.current.set(t.users_id, marker);
          });
      }
      instaladorMarkersRef.current.forEach((m, id) => {
        if (!seenTecs.has(id)) { m.remove(); instaladorMarkersRef.current.delete(id); }
      });
    };

    if (map.loaded()) sync();
    else map.once("load", sync);

  }, [instalacaoData, filtroTec, filtroPapel, setSelectedVistoria]);

  /* ── layer switcher ─────────────────────────────────────────────────────── */

  const switchLayer = useCallback((key: LayerKey) => {
    const map = mapRef.current;
    if (!map) return;

    const prev = activeLayer;

    // Saindo do 3D: remove buildings + rota + a camada 3D (Three.js) + pitch,
    // e reexibe os pins 2D (senão ficam escondidos até o próximo poll).
    if (prev === "3d" && key !== "3d") {
      if (map.getLayer(BUILDINGS_LAYER)) map.removeLayer(BUILDINGS_LAYER);
      removeRouteLayers(map);
      removeTechModelLayer(map, tech3DLayerRef);
      techMarkersRef.current.forEach((m) => { m.getElement().style.display = ""; });
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    }

    setActiveLayer(key);

    if (key === "3d") {
      // 3D pode trocar de estilo (claro/escuro) se o tema mudou desde o último.
      map.easeTo({ pitch: 50, bearing: -17, duration: 800 });
      // Esconde os pins 2D na hora — sem isso ficam "grudados" no mapa até
      // o próximo poll (5s), duplicados com os objetos 3D na mesma posição.
      techMarkersRef.current.forEach((m) => { m.getElement().style.display = "none"; });
      const target3d = mapStyleFor("3d", readDarkTheme());
      if (prev !== "3d") {
        setMapaCarregando(true);
        map.setStyle(target3d);
        map.once("style.load", () => {
          map.setProjection("mercator"); // setStyle reseta pra globe (default do estilo novo)
          if (lastDataRef.current) ensureVistoriaLayers(map, vistoriasFiltradasRef.current);
          add3DBuildings(map);
          ensureRouteLayers(map);
          ensureTechModelLayer(map, tech3DLayerRef);
          aplicarEnfaseRef.current();
          setMapaCarregando(false);
        });
      } else {
        add3DBuildings(map);
        ensureRouteLayers(map);
        ensureTechModelLayer(map, tech3DLayerRef);
      }
      return;
    }

    // Para satellite/hybrid/dark: troca estilo
    const targetStyle = mapStyleFor(key, readDarkTheme());
    const currentStyle = mapStyleFor(prev, readDarkTheme());
    if (targetStyle === currentStyle) return;

    setMapaCarregando(true);
    map.setStyle(targetStyle);
    map.once("style.load", () => {
      map.setProjection("mercator"); // idem — reforça mesmo fora do 3D
      // Re-adiciona layers de vistorias perdidos com a troca de estilo
      if (lastDataRef.current) ensureVistoriaLayers(map, vistoriasFiltradasRef.current);
      // Idem pra rota: setStyle descarta todas as layers, e a rota vale em
      // qualquer modo (o próximo poll repopula os dados da linha).
      ensureRouteLayers(map);
      aplicarEnfaseRef.current();
      setMapaCarregando(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayer]);

  /* ── GL layer helpers ───────────────────────────────────────────────────── */

  const onPosteSelectRef = useRef<undefined>(undefined);
  // map.on(tipo, camada, fn) sobrevive ao setStyle — sem esta trava, cada
  // troca de estilo registraria os handlers de novo.
  const handlersSinalRef = useRef(false);
  const hoveredVisIdRef = useRef<number | null>(null);

  function ensureVistoriaLayers(map: mapboxgl.Map, vistorias: PainelMapaVistoria[]) {
    const geojson = buildGeoJSON(vistorias);
    if (map.getSource(VISTORIAS_SRC)) {
      (map.getSource(VISTORIAS_SRC) as GeoJSONSource).setData(geojson);
      return;
    }

    map.addSource(VISTORIAS_SRC, { type: "geojson", data: geojson });
    registrarSpritesSinal(map);

    // Satélite/Híbrido nunca são claros; o modo Padrão segue o tema do painel.
    const sobreEscuro = activeLayerRef.current !== "3d" || readDarkTheme();
    // Satélite-v9 não declara fontes; sem isto a etiqueta simplesmente não sai.
    try {
      if (!map.getStyle()?.glyphs) {
        map.setGlyphsUrl("mapbox://fonts/mapbox/{fontstack}/{range}.pbf");
      }
    } catch { /* estilo sem suporte — segue sem etiqueta */ }

    // 1. Respiro de quem está EM VISTORIA agora (raio/opacidade animados no
    //    efeito de pulso lá embaixo). É a ÚNICA animação dos equipamentos.
    map.addLayer({
      id: SIG_PULSO,
      type: "circle",
      source: VISTORIAS_SRC,
      filter: F(["==", ["get", "situacao"], "EM_VISTORIA"]),
      paint: {
        "circle-color": E(["get", "cor_marcador"]),
        "circle-radius": 16,
        "circle-opacity": 0.28,
        "circle-blur": 0.2,
      },
    });

    // 2. Sombra — descola o marcador do mapa sem precisar de contorno grosso.
    map.addLayer({
      id: SIG_SOMBRA,
      type: "circle",
      source: VISTORIAS_SRC,
      paint: {
        "circle-color": "rgba(15,23,42,0.22)",
        "circle-radius": E(porZoom(16)),
        "circle-blur": 0.45,
        "circle-translate": [0, 1.5],
      },
    });

    // 3/4. Halo de hover e anel de foco — filtros por id, trocados sem relayout.
    for (const [id, raio, op] of [[SIG_HOVER, 20, 0.16], [SIG_FOCO, 23, 0.2]] as const) {
      map.addLayer({
        id,
        type: "circle",
        source: VISTORIAS_SRC,
        filter: F(["==", ["get", "id"], -1]),
        paint: {
          "circle-color": E(["get", "cor_marcador"]),
          "circle-opacity": op,
          "circle-radius": E(porZoom(raio)),
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": id === SIG_FOCO ? 2 : 1.5,
          "circle-stroke-opacity": id === SIG_FOCO ? 0.95 : 0.8,
        },
      });
    }

    // 5. Disco + borda num só passe. No caso geral: fill branco = o vão entre
    //    anel e núcleo, stroke = a cor do técnico. Em ATRIBUÍDO inverte — o
    //    disco inteiro fica na cor do técnico, com um aro branco fino. É a
    //    diferença entre "o João está com isso" e "isso está em tal estado".
    map.addLayer({
      id: SIG_ANEL,
      type: "circle",
      source: VISTORIAS_SRC,
      paint: {
        "circle-color": E(COR_DISCO),
        "circle-radius": E(raioDisco(null)),
        "circle-stroke-color": E(COR_BORDA),
        "circle-stroke-width": E(espessuraBorda(null)),
        "circle-stroke-opacity": E(OPACIDADE_BORDA),
      },
    });

    // 6. Núcleo (status + glifo + selo de revisita) e a etiqueta do equipamento.
    map.addLayer({
      id: VISTORIAS_POINTS,
      type: "symbol",
      source: VISTORIAS_SRC,
      layout: {
        "icon-image": E(["get", "icone"]),
        "icon-anchor": "center",
        // O pin NUNCA some (sem cluster, sem heatmap). Mas entra no índice de
        // colisão, então as etiquetas desviam dos pins vizinhos em vez de
        // escrever por cima deles.
        "icon-allow-overlap": true,
        "icon-ignore-placement": false,
        "icon-size": E(porZoom(1)),
        "text-field": E(["get", "equipamento"]),
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": E(["interpolate", ["linear"], ["zoom"], 10, 9.5, 14, 10.5, 18, 12]),
        "text-anchor": "top",
        "text-offset": [0, 1.15],
        "text-optional": true,   // sem espaço → cai a etiqueta, nunca o marcador
        "text-padding": 3,
        "text-max-width": 12,
      },
      paint: {
        "text-color": sobreEscuro ? "#EAF2F6" : "#1F2937",
        "text-halo-color": sobreEscuro ? "rgba(8,14,20,0.92)" : "rgba(255,255,255,0.95)",
        "text-halo-width": 1.4,
      },
    });

    // addLayer com paint/layout inválido não lança: o Mapbox descarta a camada
    // e só deixa um erro no console. Sem esta conferência, o mapa simplesmente
    // aparece sem os marcadores e ninguém sabe por quê.
    for (const id of [SIG_PULSO, SIG_SOMBRA, SIG_HOVER, SIG_FOCO, SIG_ANEL, VISTORIAS_POINTS]) {
      if (!map.getLayer(id)) console.error("[vm] camada recusada pelo Mapbox (expressão inválida):", id);
    }

    if (!handlersSinalRef.current) {
      handlersSinalRef.current = true;
      map.on("click", VISTORIAS_POINTS, (e) => {
        const vId = e.features?.[0]?.properties?.id as number | undefined;
        if (vId == null) return;
        const v = lastDataRef.current?.vistorias.find((x) => x.id === vId);
        if (v) { setSelectedVistoria(v); setSelectedTec(null); }
      });
      // mousemove dispara dezenas de vezes por segundo; só re-renderiza quando
      // o equipamento sob o cursor MUDA. O card fica ancorado onde o ponteiro
      // entrou, em vez de perseguir o mouse.
      map.on("mousemove", VISTORIAS_POINTS, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const vId = e.features?.[0]?.properties?.id as number | undefined;
        if (vId == null || hoveredVisIdRef.current === vId) return;
        hoveredVisIdRef.current = vId;
        setHoveredVis(lastDataRef.current?.vistorias.find((x) => x.id === vId) ?? null);
        setHoveredVisPos({ ...cursorRef.current });
      });
      map.on("mouseleave", VISTORIAS_POINTS, () => {
        map.getCanvas().style.cursor = "";
        hoveredVisIdRef.current = null;
        setHoveredVis(null);
        setHoveredVisPos(null);
      });
    }
  }

  /** Camada temporária dos postes próximos (círculos roxos) — some ao trocar/fechar a seleção. */
  function ensurePostesProximosLayer(map: mapboxgl.Map) {
    if (map.getSource(POSTES_PROX_SRC)) return;
    map.addSource(POSTES_PROX_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

    // Mesmo ícone real do poste (posteico.png) usado no mapa do app técnico
    // (MapView.tsx) — antes aqui era bolinha roxa genérica, sem padronização.
    const addLayer = () => {
      if (map.getLayer(POSTES_PROX_LAYER)) return;
      map.addLayer({
        id: POSTES_PROX_LAYER,
        type: "symbol",
        source: POSTES_PROX_SRC,
        layout: {
          "icon-image": "poste-ico",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.16, 14, 0.28, 18, 0.46],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });
    };

    if (map.hasImage("poste-ico")) {
      addLayer();
    } else {
      map.loadImage(asset("/posteico.png"), (err, img) => {
        if (!err && img && !map.hasImage("poste-ico")) {
          map.addImage("poste-ico", img, { pixelRatio: 2 });
        }
        addLayer();
      });
    }
  }

  function setPostesProximosGeoJSON(postes: Poste[]) {
    const map = mapRef.current;
    if (!map) return;
    ensurePostesProximosLayer(map);
    const geojson = {
      type: "FeatureCollection" as const,
      features: postes.map((p) => ({
        type: "Feature" as const,
        properties: { id: p.id, psposte: p.pspostefield },
        geometry: { type: "Point" as const, coordinates: [p.longitudefield, p.latitudefield] },
      })),
    };
    (map.getSource(POSTES_PROX_SRC) as GeoJSONSource | undefined)?.setData(geojson);
  }

  async function handleTogglePostesProximos(v: PainelMapaVistoria) {
    if (postesProximosAtivo) {
      setPostesProximosAtivo(false);
      setPostesProximos([]);
      setPostesProximosGeoJSON([]);
      return;
    }
    setPostesProximosAtivo(true);
    setPostesProximosLoading(true);
    try {
      const res = await fetchPostesProximos({ lat: v.latitude, lng: v.longitude, raio: POSTES_PROXIMOS_RAIO_M, limit: 30 });
      setPostesProximos(res.items);
      setPostesProximosGeoJSON(res.items);
    } catch {
      setPostesProximos([]);
    } finally {
      setPostesProximosLoading(false);
    }
  }

  /* ── sync markers + layers ──────────────────────────────────────────────── */

  // Pins do mapa mostram só o que bate com os filtros de situação/busca da
  // lista lateral — antes disso o mapa sempre renderizava TUDO independente
  // do filtro selecionado, só a lista lateral respeitava.
  const SITUACAO_SORT: Record<string, number> = {
    DEVOLVIDA: -1, A_VISTORIAR: 0, ATRIBUIDO: 1, EM_VISTORIA: 2, VISTORIADO: 3,
    AGUARDANDO_REVISITA: 4, EM_REVISITA: 5, REVISITADO: 6, REJEITADA_IMP: 7, REJEITADA: 8,
  };

  const vistoriasFiltradas = useMemo(() => {
    const all = data?.vistorias ?? [];
    const q = buscaVis.trim().toLowerCase();
    return all
      .filter((v) => {
        if (filtroSit !== "todas" && chaveSinal(v.situacao, v.bloqueio) !== filtroSit) return false;
        if (!q) return true;
        return (
          v.equipamento.toLowerCase().includes(q) ||
          (v.municipio ?? "").toLowerCase().includes(q) ||
          (v.tecnico_nome ?? "").toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          (SITUACAO_SORT[chaveSinal(a.situacao, a.bloqueio)] ?? 9) -
          (SITUACAO_SORT[chaveSinal(b.situacao, b.bloqueio)] ?? 9)
      );
  }, [data, filtroSit, buscaVis]);

  // Espelha em ref pra reaproveitar em callbacks de troca de estilo do mapa
  // (satellite/dark/3d), que rodam fora do ciclo normal de render.
  useEffect(() => {
    vistoriasFiltradasRef.current = vistoriasFiltradas;
  }, [vistoriasFiltradas]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    const syncTechMarkers = () => {
      const visible = filtroPapel === "instalador" ? [] : data.tecnicos.filter((t) => {
        if (t.latitude == null || t.longitude == null) return false;
        if (filtroTec === "online") return t.status_operacional === "em-operacao" || t.status_operacional === "em-vistoria";
        if (filtroTec === "parado") return t.status_operacional === "parado";
        if (filtroTec === "offline") return t.status_operacional === "offline";
        // "todos" — exclui offline do mapa para evitar falso positivo de localização
        return t.status_operacional !== "offline";
      });
      // Camada 3D (Three.js) — carro em rota / beacon parado por técnico,
      // só existe/atualiza no modo "3d"; nos outros modos o pin 2D
      // (SVG/HTML) criado abaixo já é suficiente e fica visível.
      const in3D = activeLayerRef.current === "3d";

      // A ROTA vale em qualquer modo de mapa — é uma linha comum do Mapbox e
      // não tem nada a ver com o 3D. Ela ficava dentro do bloco do 3D por
      // acidente de implementação (nasceu junto com o carro), então em
      // Padrão/Satélite/Híbrido nunca era desenhada. Só o VEÍCULO 3D
      // continua restrito ao modo 3D; nos outros o pin 2D já dá conta.
      const specs: TechEntrySpec[] = [];
      const trechosParaLinha: [number, number][][] = [];
      visible.forEach((t) => {
        const destino = resolveDestino(t, data.vistorias);
        let route: RouteResult | null = null;
        // situacao_id 7 = SITUACAO_EM_DESLOCAMENTO (constants.ts, server-only —
        // não dá pra importar aqui). O status_operacional do TÉCNICO
        // (status_operacional==="em-operacao") não serve pra isso: ele vem de
        // um dropdown legado (statusvistoriafield="Em campo") que fica ligado
        // do momento da atribuição até a conclusão, sem distinguir "a
        // caminho" de "chegou" — o sinal certo é a situação da PRÓPRIA
        // vistoria de destino, setada quando o técnico escolhe a rota.
        if (destino && destino.situacao_id === 7) {
          route = peekRoute(t.users_id);
          // Busca/atualiza em segundo plano — o próprio routeService decide
          // se precisa ir à rede (cache por destino/desvio/TTL) ou não.
          void getRouteFor(
            t.users_id,
            { lng: t.longitude!, lat: t.latitude! },
            { lng: destino.longitude, lat: destino.latitude }
          );
          if (route) {
            // Só o caminho à frente: o que ficou pra trás é descartado, como
            // no Waze.
            //
            // O progresso vem da CAMADA 3D quando ela existe, não da projeção
            // crua do GPS. A camada extrapola por velocidade e é monotônica;
            // a projeção crua não é. Usando fontes diferentes, a linha
            // encolhia e crescia de leve enquanto o carro seguia liso — agora
            // linha e veículo consomem a rota exatamente juntos.
            const doLayer = tech3DLayerRef.current?.progressoAtual(t.users_id);
            const distAlongM =
              doLayer ?? projectOntoRoute(route, { lng: t.longitude!, lat: t.latitude! }).distAlongM;
            trechosParaLinha.push(routeAheadCoordinates(route, distAlongM));
          }
        }
        specs.push({
          usersId: t.users_id,
          nome: t.nome,
          lng: t.longitude!,
          lat: t.latitude!,
          speedKmh: t.speed_kmh,
          corHex: statusColor(t.status_operacional),
          // Uniforme + capacete do boneco 3D. Disco, pulso e etiqueta seguem
          // no corHex (status) — o carro não usa nem uma coisa nem outra.
          corIdentidadeHex: t.cor,
          route,
          paradoDesdeMin: t.parado_desde_min,
        });
      });

      ensureRouteLayers(map);
      updateRouteLineSource(map, trechosParaLinha);

      if (in3D) {
        // Clicar na etiqueta do carro abre o técnico, igual ao pin 2D — que
        // fica escondido no 3D e, sem isto, deixava o modo 3D sem nenhuma
        // forma de saber de quem é cada veículo.
        ensureTechModelLayer(map, tech3DLayerRef, (usersId) => {
          const tec = visible.find((v) => v.users_id === usersId);
          if (!tec) return;
          setSelectedTec(tec);
          setSelectedVistoria(null);
          setSelecionadoNaLista(usersId);
        });
        tech3DLayerRef.current?.syncEntries(specs);
      }

      const seen = new Set<number>();
      visible.forEach((t) => {
        seen.add(t.users_id);
        const existing = techMarkersRef.current.get(t.users_id);
        // O pin é montado uma vez; se o admin trocar a cor de identidade em
        // Colaboradores, refaz — senão o mapa ficaria na cor antiga até o F5.
        if (existing && existing.getElement().dataset.cor === t.cor) {
          animateMarkerTo(existing, t.longitude!, t.latitude!);
          existing.getElement().style.display = in3D ? "none" : "";
          return;
        }
        if (existing) { existing.remove(); techMarkersRef.current.delete(t.users_id); }
        const el = techMarkerEl(t);
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([t.longitude!, t.latitude!])
          .addTo(map);
        el.style.display = in3D ? "none" : "";
        el.addEventListener("click", () => {
          setSelectedTec(t);
          setSelectedVistoria(null);
          setSelecionadoNaLista(t.users_id);
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
      ensureVistoriaLayers(map, vistoriasFiltradas);
      // Equipamentos posicionados — pode tirar a tela de carregamento.
      setMapaCarregando(false);
    };

    if (map.loaded()) sync();
    else map.once("load", sync);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filtroTec, filtroPapel, vistoriasFiltradas]);

  // Rede lenta / estilo que nunca dispara style.load: a tela de carregamento
  // nunca pode ficar presa em cima do mapa.
  useEffect(() => {
    if (!mapaCarregando) return;
    const id = window.setTimeout(() => setMapaCarregando(false), 12_000);
    return () => window.clearTimeout(id);
  }, [mapaCarregando]);

  /* ── ênfase: seleção, hover e destaque por técnico ──────────────────────── */

  // Vínculo nos dois sentidos: clicar no técnico destaca as vistorias dele;
  // clicar numa vistoria destaca o técnico dela (e as outras dele junto).
  const tecnicoDestacado = useMemo<number | null>(() => {
    if (selectedTec) return selectedTec.users_id;
    if (selectedVistoria?.tecnico_id) return selectedVistoria.tecnico_id;
    return null;
  }, [selectedTec, selectedVistoria]);

  // Seleção e destaque por técnico. Guardado em ref porque a troca de estilo
  // recria as camadas do zero e precisa reaplicar isto na hora — senão o
  // destaque sumiria até o próximo poll.
  const aplicarEnfaseRef = useRef<() => void>(() => {});
  useEffect(() => {
    const aplicar = () => {
      const map = mapRef.current;
      if (!map || !map.getLayer(SIG_ANEL)) return;
      const selId = selectedVistoria?.id ?? null;
      const fator = fatorDestaque(tecnicoDestacado);

      map.setFilter(SIG_FOCO, F(["==", ["get", "id"], selId ?? -1]));
      map.setPaintProperty(SIG_ANEL, "circle-radius", E(raioDisco(selId)));
      map.setPaintProperty(SIG_ANEL, "circle-stroke-width", E(espessuraBorda(selId)));
      map.setPaintProperty(SIG_ANEL, "circle-opacity", E(fator));
      map.setPaintProperty(SIG_ANEL, "circle-stroke-opacity", E(["*", OPACIDADE_BORDA, fator]));
      map.setPaintProperty(SIG_SOMBRA, "circle-opacity", E(["*", 1, fator]));
      map.setPaintProperty(SIG_PULSO, "circle-opacity", E(["*", 0.28, fator]));
      map.setPaintProperty(VISTORIAS_POINTS, "icon-opacity", E(fator));
      map.setPaintProperty(VISTORIAS_POINTS, "text-opacity", E(fator));
      map.setLayoutProperty(VISTORIAS_POINTS, "icon-size", E(porZoom(comEnfase(1, selId))));
      map.setPaintProperty(SIG_SOMBRA, "circle-radius", E(porZoom(comEnfase(16, selId))));
    };
    aplicarEnfaseRef.current = aplicar;
    aplicar();
  }, [selectedVistoria, tecnicoDestacado, vistoriasFiltradas, activeLayer]);

  // Hover fica FORA do efeito acima de propósito: mexer no icon-size force um
  // relayout da camada de símbolos, e isso a cada movimento do mouse trava. O
  // halo é uma camada de círculos — trocar o filtro dela é barato.
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer(SIG_HOVER)) return;
    map.setFilter(SIG_HOVER, F(["==", ["get", "id"], hoveredVis?.id ?? -1]));
  }, [hoveredVis]);

  /* ── respiro de quem está EM VISTORIA ───────────────────────────────────── */

  const temEmVistoria = useMemo(
    () => vistoriasFiltradas.some((v) => v.situacao === "EM_VISTORIA"),
    [vistoriasFiltradas]
  );

  useEffect(() => {
    if (!temEmVistoria) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      const map = mapRef.current;
      if (map?.getLayer(SIG_PULSO)) {
        const f = ((performance.now() - t0) % 2400) / 2400;
        map.setPaintProperty(SIG_PULSO, "circle-radius", 13 + f * 19);
        map.setPaintProperty(SIG_PULSO, "circle-opacity", E(["*", 0.34 * (1 - f), fatorDestaque(tecnicoDestacado)]));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [temEmVistoria, tecnicoDestacado]);

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

  const [savingGps, setSavingGps] = useState(false);
  const saveGpsCorrection = useCallback(async () => {
    if (!selectedVistoria || !correctedPos || !session?.token) return;
    setSavingGps(true);
    try {
      await api.patch(
        `/painel/vistoria/${selectedVistoria.id}`,
        {
          campos: {
            latitudefield: correctedPos.lat.toFixed(6),
            longitudefield: correctedPos.lng.toFixed(6),
          },
          regenerar_pdf: true,
        },
        { headers: { Authorization: `Bearer ${session.token}` } }
      );
      exitGpsEditMode();
      await fetchMapa();
    } catch {
      alert("Falha ao salvar a correção de GPS. Tente de novo.");
    } finally {
      setSavingGps(false);
    }
  }, [selectedVistoria, correctedPos, session?.token, exitGpsEditMode, fetchMapa]);

  /* ── derived ────────────────────────────────────────────────────────────── */

  const techComGps = useMemo(
    () => (data?.tecnicos ?? []).filter((t) => t.latitude != null && t.longitude != null).length,
    [data]
  );
  const techOnline = useMemo(
    () => (data?.tecnicos ?? []).filter((t) => t.status_operacional === "em-operacao" || t.status_operacional === "em-vistoria").length,
    [data]
  );


  const contagemSit = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const v of data?.vistorias ?? []) {
      const k = chaveSinal(v.situacao, v.bloqueio);
      acc[k] = (acc[k] ?? 0) + 1;
    }
    return acc;
  }, [data]);

  // Aba "Equipe" — vistoriadores e instaladores juntos na MESMA lista, só
  // diferenciados por cor/badge (nunca em abas separadas — pedido do
  // usuário: a aba "Instalação" é só pra equipamento, não pra pessoas).
  const equipeUnificada = useMemo<MembroEquipe[]>(() => {
    const vistoriadores: MembroEquipe[] = (data?.tecnicos ?? []).map((t) => ({
      key: `v-${t.users_id}`,
      papel: "vistoriador",
      nome: t.nome,
      latitude: t.latitude,
      longitude: t.longitude,
      accuracyMeters: t.accuracy_meters,
      createdAt: t.created_at,
      bucket:
        t.status_operacional === "em-operacao" || t.status_operacional === "em-vistoria"
          ? "online"
          : t.status_operacional === "parado"
          ? "parado"
          : "offline",
      statusColor: statusColor(t.status_operacional),
      statusLabel: statusLabel(t.status_operacional),
      tecnico: t,
    }));
    const instaladores: MembroEquipe[] = (instalacaoData?.instaladores ?? []).map((t) => ({
      key: `i-${t.users_id}`,
      papel: "instalador",
      nome: t.nome,
      latitude: t.latitude,
      longitude: t.longitude,
      accuracyMeters: t.accuracy_meters,
      createdAt: t.created_at,
      bucket:
        t.status_operacional === "em-instalacao" || t.status_operacional === "em-operacao"
          ? "online"
          : t.status_operacional === "parado"
          ? "parado"
          : "offline",
      statusColor: INST_TEC_COLOR[t.status_operacional],
      statusLabel: INST_TEC_LABEL[t.status_operacional],
      instalador: t,
    }));
    return [...vistoriadores, ...instaladores];
  }, [data, instalacaoData]);

  const equipeFiltrada = useMemo(
    () =>
      equipeUnificada.filter((m) => {
        if (filtroPapel !== "todos" && m.papel !== filtroPapel) return false;
        if (filtroTec !== "todos" && m.bucket !== filtroTec) return false;
        return true;
      }),
    [equipeUnificada, filtroPapel, filtroTec]
  );

  /* ── render ─────────────────────────────────────────────────────────────── */

  if (!token) {
    return (
      <div className="grid h-full place-items-center" style={{ color: "var(--vm-muted)" }}>
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
            badge={equipeUnificada.length}
          />
          <TabBtn
            active={aba === "vistorias"}
            onClick={() => setAba("vistorias")}
            icon={<ClipboardList className="h-3 w-3" />}
            label="Vistorias"
            badge={data?.vistorias.length}
          />
          <TabBtn
            active={aba === "instalacao"}
            onClick={() => setAba("instalacao")}
            icon={<Wrench className="h-3 w-3" />}
            label="Instalação"
            badge={instalacaoData?.postes.length}
            accent="#7C3AED"
          />
        </div>

        {aba === "tecnicos" && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Filtro de papel — vistoriador/instalador na mesma lista */}
            <div className="shrink-0 px-2 pt-2">
              <div className="flex gap-1">
                {(["todos", "vistoriador", "instalador"] as const).map((k) => {
                  const on = filtroPapel === k;
                  const cor = k === "instalador" ? "#7C3AED" : "#00D4A0";
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFiltroPapel(k)}
                      className="flex-1 truncate rounded-lg px-1.5 py-1 text-[9.5px] font-semibold transition"
                      style={{
                        background: on ? tint(cor, 0.16) : "var(--vm-fill)",
                        color: on ? cor : "var(--vm-muted)",
                        border: `1px solid ${on ? tint(cor, 0.35) : "var(--vm-fill-2)"}`,
                      }}
                    >
                      {k === "todos" ? "Todos" : k === "vistoriador" ? "Vistoriadores" : "Instaladores"}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Filtro de status */}
            <div className="shrink-0 p-2">
              <div className="flex gap-1">
                {(["todos", "online", "parado", "offline"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFiltroTec(k)}
                    className="flex-1 rounded-lg px-1.5 py-1 text-[9.5px] font-semibold capitalize transition"
                    style={{
                      background: filtroTec === k ? "rgba(0,179,136,0.18)" : "var(--vm-fill)",
                      color: filtroTec === k ? "#00D4A0" : "var(--vm-muted)",
                      border: `1px solid ${filtroTec === k ? "rgba(0,179,136,0.35)" : "var(--vm-fill-2)"}`,
                    }}
                  >
                    {k === "todos" ? "Todos" : k === "online" ? "Online" : k === "parado" ? "Parado" : "Offline"}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              <div className="space-y-1.5">
                {equipeFiltrada.map((m) => {
                  const isOnl = m.bucket === "online";
                  const isInstalador = m.papel === "instalador";
                  const selected = isInstalador
                    ? selecionadoNaLista === m.instalador?.users_id
                    : selectedTec?.users_id === m.tecnico?.users_id;
                  // Cor de identidade da pessoa — a mesma do pin e do anel das
                  // vistorias dela. O papel continua no badge à direita.
                  const cor = (isInstalador ? m.instalador?.cor : m.tecnico?.cor) || (isInstalador ? "#7C3AED" : "#00875F");
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => {
                        if (isInstalador && m.instalador) {
                          setSelectedTec(null);
                          setSelectedVistoria(null);
                          setSelecionadoNaLista(m.instalador.users_id);
                        } else if (m.tecnico) {
                          setSelectedTec(m.tecnico);
                          setSelectedVistoria(null);
                          setSelecionadoNaLista(m.tecnico.users_id);
                        }
                        if (m.latitude != null && m.longitude != null) {
                          mapRef.current?.flyTo({ center: [m.longitude, m.latitude], zoom: Math.max(14, mapRef.current.getZoom()), duration: 700 });
                        }
                      }}
                      className="w-full rounded-xl p-2.5 text-left transition"
                      style={{
                        background: selected ? tint(cor, 0.1) : "var(--vm-fill)",
                        border: `1px solid ${selected ? tint(cor, 0.25) : "var(--vm-fill-2)"}`,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                          style={{ background: `linear-gradient(135deg,${shade(cor, 0.14)},${shade(cor, -0.26)})` }}
                        >
                          {initials(m.nome)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold" style={{ color: "var(--vm-text)" }}>
                            {m.nome}
                          </p>
                          <div className="flex items-center gap-1.5 text-[9.5px]" style={{ color: m.statusColor }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.statusColor, boxShadow: isOnl ? `0 0 6px ${m.statusColor}` : "none" }} />
                            <span>{m.statusLabel}</span>
                            <span style={{ color: "var(--vm-faint)" }}>·</span>
                            <span style={{ color: "var(--vm-faint)" }}>{relTime(m.createdAt)}</span>
                          </div>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-wide"
                          style={{
                            background: isInstalador ? "rgba(124,58,237,0.14)" : "rgba(0,179,136,0.14)",
                            color: isInstalador ? "#7C3AED" : "#00875F",
                          }}
                        >
                          {isInstalador ? "Instalador" : "Vistoriador"}
                        </span>
                      </div>
                      {m.accuracyMeters != null && (
                        <span
                          className="mt-1.5 inline-block rounded-full px-1.5 py-[2px] text-[8.5px] font-semibold"
                          style={{
                            background: m.accuracyMeters < 20 ? "rgba(0,179,136,0.14)" : "rgba(245,158,11,0.14)",
                            color: m.accuracyMeters < 20 ? "#00B388" : "#F59E0B",
                          }}
                        >
                          ±{Math.round(m.accuracyMeters)}m
                        </span>
                      )}
                    </button>
                  );
                })}
                {equipeFiltrada.length === 0 && (
                  <p className="py-10 text-center text-[11px]" style={{ color: "var(--vm-faint)" }}>
                    Ninguém ativo com esses filtros.
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
                style={{ background: "var(--vm-fill)", border: "1px solid rgba(0,0,0,0.06)" }}
              >
                <Search className="h-3 w-3 shrink-0" style={{ color: "var(--vm-faint)" }} />
                <input
                  type="search"
                  value={buscaVis}
                  onChange={(e) => setBuscaVis(e.target.value)}
                  placeholder="Equipamento, técnico, município…"
                  className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                  style={{ color: "var(--vm-text)" }}
                />
              </div>
            </div>
            {/* Filtros situação */}
            <div className="shrink-0 px-2 pb-1.5">
              <div className="flex flex-wrap gap-1">
                <FiltroPill active={filtroSit === "todas"} label="Todas" n={data?.vistorias.length ?? 0} color="var(--vm-text)" onClick={() => setFiltroSit("todas")} />
                {/* As 10 situações continuam filtráveis uma a uma; a COR agora
                    vem da família (5), que é o que o mapa desenha. */}
                {CHAVES_SINAL.map((key) => (
                  <FiltroPill
                    key={key}
                    active={filtroSit === key}
                    label={SITUACAO_LABEL[key]}
                    n={contagemSit[key] ?? 0}
                    color={corSituacao(key)}
                    onClick={() => setFiltroSit(key)}
                  />
                ))}
              </div>
            </div>
            {/* Lista */}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              <div className="space-y-1">
                {vistoriasFiltradas.map((v) => {
                  // Mesma regra do mapa: atribuída aparece na cor do técnico.
                  const cor = corMarcador(v.situacao, v.tecnico_cor, v.bloqueio);
                  const corTec = v.tecnico_cor ?? ANEL_SEM_TECNICO;
                  const apagada = tecnicoDestacado != null && v.tecnico_id !== tecnicoDestacado;
                  return (
                    <div
                      key={v.id}
                      className="w-full rounded-xl p-2 text-left transition"
                      style={{
                        background: selectedVistoria?.id === v.id ? "rgba(0,179,136,0.10)" : "var(--vm-fill)",
                        border: `1px solid ${selectedVistoria?.id === v.id ? "rgba(0,179,136,0.22)" : "var(--vm-fill)"}`,
                        borderLeft: `3px solid ${cor}`,
                        opacity: apagada ? 0.42 : 1,
                      }}
                    >
                      {/* clique para focar no mapa */}
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          setSelectedVistoria(v);
                          setSelectedTec(null);
                          mapRef.current?.flyTo({
                            center: [v.longitude, v.latitude],
                            zoom: Math.max(16, mapRef.current?.getZoom() ?? 16),
                            duration: 700,
                          });
                        }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <p className="truncate text-[11px] font-semibold" style={{ color: "var(--vm-text)" }}>
                            {v.equipamento}
                          </p>
                          <span
                            className="shrink-0 rounded-full px-1.5 py-[1px] text-[8px] font-bold uppercase"
                            style={{ background: `${cor}20`, color: cor }}
                          >
                            {labelSituacao(v.situacao, v.bloqueio)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-[9.5px]" style={{ color: "var(--vm-faint)" }}>
                          <MapPin className="h-2.5 w-2.5" />
                          <span className="truncate">{v.municipio ?? "—"}</span>
                          {v.tecnico_nome && <>
                            <span>·</span>
                            {/* mesmo ponto de cor do anel do marcador no mapa */}
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: corTec }} />
                            <span className="truncate" style={{ color: "var(--vm-faint)" }}>{v.tecnico_nome}</span>
                          </>}
                        </div>
                      </button>
                      {/* atribuição direta — só pra quem ainda não tem técnico;
                          reatribuir/desvincular um técnico já em campo é só
                          na Central de Vistorias (2026-08-21). Não faz
                          sentido pra vistorias concluídas; leitura não age. */}
                      {session?.role !== "leitura" && !v.tecnico_nome && v.situacao !== "VISTORIADO" && v.situacao !== "REVISITADO" && (
                        <button
                          type="button"
                          onClick={() => {
                            setAtribuirVistoria(v);
                            setAtribuirTecId("");
                            setAtribuirMotivo("");
                          }}
                          className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg py-1 text-[10px] font-semibold transition"
                          style={{ background: "rgba(59,130,246,0.08)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.15)" }}
                        >
                          <UserCheck className="h-3 w-3" />
                          Atribuir técnico
                        </button>
                      )}
                    </div>
                  );
                })}
                {vistoriasFiltradas.length === 0 && (
                  <p className="py-8 text-center text-[11px]" style={{ color: "var(--vm-faint)" }}>
                    Nenhuma vistoria nesse filtro.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {aba === "instalacao" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-2 pt-2">
              <p className="rounded-lg px-2 py-1.5 text-[9.5px] leading-relaxed" style={{ background: "rgba(124,58,237,0.08)", color: "#7C3AED" }}>
                Equipamentos do módulo de Instalação — postes liberados ou em
                instalação agora. Os instaladores (pessoas) aparecem na aba
                Equipe.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {instalacaoData && instalacaoData.postes.length > 0 && (
                <>
                  <p className="mb-1.5 mt-3 px-1 text-[9.5px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
                    Postes
                  </p>
                  <div className="space-y-1.5">
                    {instalacaoData.postes.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => mapRef.current?.flyTo({ center: [p.longitude, p.latitude], zoom: Math.max(15, mapRef.current.getZoom()), duration: 700 })}
                        className="w-full rounded-xl p-2.5 text-left transition"
                        style={{ background: "var(--vm-fill)", border: "1px solid var(--vm-fill-2)" }}
                      >
                        <p className="truncate text-[12px] font-semibold" style={{ color: "var(--vm-text)" }}>{p.equipamento}</p>
                        <div className="flex items-center gap-1.5 text-[9.5px]" style={{ color: "var(--vm-faint)" }}>
                          <span>{p.municipio ?? "—"}</span>
                          <span>·</span>
                          <span
                            className="rounded-full px-1.5 py-[1px] font-bold uppercase tracking-wide"
                            style={{
                              background: p.status === "liberado" ? "rgba(245,158,11,0.14)" : "rgba(59,130,246,0.14)",
                              color: p.status === "liberado" ? "#F59E0B" : "#3B82F6",
                            }}
                          >
                            {p.status === "liberado" ? "Poste liberado" : "Poste em instalação"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {instalacaoData && instalacaoData.postes.length === 0 && (
                <p className="py-10 text-center text-[11px]" style={{ color: "var(--vm-faint)" }}>
                  Nenhum poste liberado ou em instalação agora.
                </p>
              )}
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
          const Icon = opt.key === "satellite" ? Globe
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
                color: active ? "#00D4A0" : "var(--vm-muted)",
                border: `1px solid ${active ? "rgba(0,179,136,0.40)" : "transparent"}`,
              }}
            >
              <Icon className="h-3 w-3" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* ── HOVER CARD DO EQUIPAMENTO ─────────────────────────────────────── */}
      {hoveredVis && hoveredVisPos && !selectedVistoria && (
        <div
          className="pointer-events-none fixed z-[200] w-[212px] rounded-2xl p-3"
          style={{
            left: Math.min(Math.max(hoveredVisPos.x - 106, 8), (typeof window !== "undefined" ? window.innerWidth : 1200) - 220),
            top: hoveredVisPos.y - 12,
            transform: "translateY(-100%)",
            ...GLASS,
          }}
        >
          <p className="truncate text-[12.5px] font-bold" style={{ color: "var(--vm-text)" }}>
            {hoveredVis.equipamento}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px]" style={{ color: "var(--vm-muted)" }}>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: corMarcador(hoveredVis.situacao, hoveredVis.tecnico_cor, hoveredVis.bloqueio) }}
            />
            <span>{labelSituacao(hoveredVis.situacao, hoveredVis.bloqueio)}</span>
            <span style={{ color: "var(--vm-faint)" }}>·</span>
            <span className="truncate">{hoveredVis.municipio ?? "—"}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10.5px]" style={{ color: "var(--vm-muted)" }}>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: hoveredVis.tecnico_cor ?? ANEL_SEM_TECNICO }}
            />
            <span className="truncate">{hoveredVis.tecnico_nome ?? "Sem atribuição"}</span>
            {hoveredVis.is_revisita && (
              <span
                className="ml-auto shrink-0 rounded-full px-1.5 text-[8.5px] font-bold text-white"
                style={{ background: "#111827" }}
              >
                R
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── TELA DE CARREGAMENTO ──────────────────────────────────────────── */}
      <MapaLoading
        visivel={mapaCarregando}
        equipamentos={data?.vistorias.length}
        tecnicos={data?.tecnicos.length}
      />

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
                disabled={savingGps}
                className="rounded-lg px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-60"
                style={{ background: "rgba(245,158,11,0.20)", color: "#FDE68A", border: "1px solid rgba(245,158,11,0.30)" }}
              >
                {savingGps ? "Salvando…" : "Confirmar"}
              </button>
              <button
                type="button"
                onClick={exitGpsEditMode}
                disabled={savingGps}
                className="flex h-6 w-6 items-center justify-center rounded-lg disabled:opacity-60"
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
              style={{
                background: `linear-gradient(135deg,${shade(hoveredTec.cor, 0.14)},${shade(hoveredTec.cor, -0.26)})`,
              }}
            >
              {initials(hoveredTec.nome)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold" style={{ color: "var(--vm-text)" }}>
                {hoveredTec.nome}
              </p>
              <p className="text-[10px]" style={{ color: statusColor(hoveredTec.status_operacional) }}>
                {statusLabel(hoveredTec.status_operacional)}
              </p>
            </div>
          </div>
          {hoveredMetricsLoading ? (
            <p className="text-center text-[10px]" style={{ color: "var(--vm-faint)" }}>carregando…</p>
          ) : hoveredMetrics ? (
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[
                { v: hoveredMetrics.vistorias_hoje, l: "vistorias" },
                { v: `${hoveredMetrics.km_hoje.toFixed(1)}`, l: "km hoje" },
                { v: hoveredMetrics.tempo_medio_min != null ? `${hoveredMetrics.tempo_medio_min}m` : "—", l: "média" },
              ].map((m) => (
                <div key={m.l} className="rounded-lg px-1 py-1.5" style={{ background: "var(--vm-fill-2)" }}>
                  <p className="text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>{m.v}</p>
                  <p className="text-[9px]" style={{ color: "var(--vm-faint)" }}>{m.l}</p>
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
                    style={{
                      background: `linear-gradient(135deg,${shade(selectedTec.cor, 0.14)},${shade(selectedTec.cor, -0.26)})`,
                    }}
                  >
                    {initials(selectedTec.nome)}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--vm-text)" }}>
                      {selectedTec.nome}
                    </p>
                    <p className="text-[10px]" style={{ color: statusColor(selectedTec.status_operacional) }}>
                      {statusLabel(selectedTec.status_operacional)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedTec(null); setSelecionadoNaLista(null); }}
                  className="flex h-6 w-6 items-center justify-center rounded-lg"
                  style={{ color: "var(--vm-faint)" }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {selectedTec.accuracy_meters != null && (
                <div
                  className="mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5"
                  style={{ background: "var(--vm-fill)", border: "1px solid rgba(0,0,0,0.06)" }}
                >
                  <Target className="h-3 w-3 shrink-0" style={{ color: selectedTec.accuracy_meters < 20 ? "#00B388" : "#F59E0B" }} />
                  <span className="text-[10px]" style={{ color: "var(--vm-muted)" }}>
                    Precisão GPS: <strong style={{ color: selectedTec.accuracy_meters < 20 ? "#00B388" : "#F59E0B" }}>
                      ±{Math.round(selectedTec.accuracy_meters)} m
                    </strong>
                    {selectedTec.speed_kmh != null && (
                      <> · <strong style={{ color: "var(--vm-text)" }}>{selectedTec.speed_kmh.toFixed(1)} km/h</strong></>
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
                    style={{ background: "var(--vm-fill)", border: "1px solid var(--vm-fill-2)" }}
                  >
                    <span style={{ color: "var(--vm-faint)" }}>{m.icon}</span>
                    <div>
                      <p className="text-[9px]" style={{ color: "var(--vm-faint)" }}>{m.label}</p>
                      <p className="text-[12px] font-semibold" style={{ color: "var(--vm-text)" }}>{m.value}</p>
                    </div>
                  </div>
                ))}
              </div>

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
            className="absolute bottom-4 right-4 z-10 w-[336px] overflow-hidden"
            style={{
              background: PANEL.bg,
              border: `1px solid ${PANEL.border}`,
              borderRadius: 16,
              boxShadow: "0 20px 48px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)",
              backdropFilter: "blur(6px)",
            }}
          >
            <div className="p-4">
              {/* Header */}
              <div className="mb-4 flex items-start gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "rgba(37,99,235,0.14)", border: `1px solid ${PANEL.border}` }}
                >
                  <RadioTower className="h-4.5 w-4.5" style={{ color: PANEL.blue }} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[16px] font-bold leading-tight" style={{ color: PANEL.text }}>
                      {selectedVistoria.equipamento}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedVistoria(null)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/5"
                      style={{ color: PANEL.textSoft }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <MapPin className="h-3 w-3 shrink-0" style={{ color: PANEL.textSoft }} />
                      <span className="truncate text-[11.5px]" style={{ color: PANEL.textSoft }}>
                        {selectedVistoria.municipio ?? "—"}
                      </span>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-wide"
                      style={{
                        background: tint(corMarcador(selectedVistoria.situacao, selectedVistoria.tecnico_cor, selectedVistoria.bloqueio), 0.16),
                        color: corMarcador(selectedVistoria.situacao, selectedVistoria.tecnico_cor, selectedVistoria.bloqueio),
                      }}
                    >
                      {labelSituacao(selectedVistoria.situacao, selectedVistoria.bloqueio)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Técnico */}
              <div
                className="mb-2.5 flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                style={{ background: PANEL.cardAlt, border: `1px solid ${PANEL.border}` }}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    // Mesma cor de identidade do anel do marcador — o card
                    // confirma visualmente de quem é o pin que foi clicado.
                    background: selectedVistoria.tecnico_cor
                      ? tint(selectedVistoria.tecnico_cor, 0.24)
                      : "rgba(255,255,255,0.06)",
                    color: selectedVistoria.tecnico_cor
                      ? shade(selectedVistoria.tecnico_cor, 0.45)
                      : PANEL.textSoft,
                  }}
                >
                  {selectedVistoria.tecnico_nome ? initials(selectedVistoria.tecnico_nome) : "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold" style={{ color: selectedVistoria.tecnico_nome ? PANEL.text : PANEL.textSoft }}>
                    {selectedVistoria.tecnico_nome ?? "Sem atribuição"}
                  </p>
                  <p className="text-[9.5px] uppercase tracking-wide" style={{ color: PANEL.textSoft }}>Técnico atribuído</p>
                </div>
                <User className="h-3.5 w-3.5 shrink-0" style={{ color: PANEL.textSoft }} />
              </div>

              {/* Coordenadas GPS */}
              <div
                className="mb-3 rounded-xl px-3 py-2.5"
                style={{ background: PANEL.cardAlt, border: `1px solid ${PANEL.border}` }}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Target className="h-3 w-3" style={{ color: PANEL.success }} />
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: PANEL.textSoft }}>
                      Coordenadas GPS
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(`${selectedVistoria.latitude},${selectedVistoria.longitude}`)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9.5px] font-semibold transition hover:bg-white/5"
                    style={{ color: PANEL.textSoft, border: `1px solid ${PANEL.border}` }}
                  >
                    <Copy className="h-2.5 w-2.5" />
                    Copiar
                  </button>
                </div>
                <p className="font-mono text-[12px]" style={{ color: PANEL.text }}>
                  {selectedVistoria.latitude.toFixed(6)}, {selectedVistoria.longitude.toFixed(6)}
                </p>
              </div>

              {/* Ações primárias */}
              <div className="mb-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const url = `https://www.google.com/maps/search/?api=1&query=${selectedVistoria.latitude},${selectedVistoria.longitude}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold text-white transition hover:brightness-110"
                  style={{ background: PANEL.blue, borderRadius: 12 }}
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Navegar
                </button>
                {!gpsEditMode && session?.role !== "leitura" && (
                  <button
                    type="button"
                    onClick={() => enterGpsEditMode(selectedVistoria)}
                    className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold transition hover:brightness-110"
                    style={{ background: PANEL.amber, color: "#1C222B", borderRadius: 12 }}
                  >
                    <Target className="h-3.5 w-3.5" />
                    Corrigir GPS
                  </button>
                )}
              </div>

              {/* Ação secundária — só atribuir quem ainda não tem técnico;
                  reatribuir/desvincular já em campo é só na Central de
                  Vistorias (2026-08-21). Não aparece pra vistorias
                  concluídas; leitura não age. */}
              {session?.role !== "leitura" && !selectedVistoria.tecnico_nome && selectedVistoria.situacao !== "VISTORIADO" && selectedVistoria.situacao !== "REVISITADO" && (
                <button
                  type="button"
                  onClick={() => {
                    setAtribuirVistoria(selectedVistoria);
                    setAtribuirTecId("");
                    setAtribuirMotivo("");
                  }}
                  className="mb-3 flex w-full items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold transition hover:brightness-125"
                  style={{ background: "rgba(255,255,255,0.06)", color: PANEL.text, borderRadius: 12, border: `1px solid ${PANEL.border}` }}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Atribuir técnico
                </button>
              )}

              {/* Recusar em nome do técnico — só quando HÁ técnico atribuído e a
                  vistoria ainda está ativa (não faz sentido pra já concluída/
                  já rejeitada). Pensado pra técnico incapacitado de agir pelo
                  próprio app (2026-09-09). */}
              {session?.role !== "leitura" &&
                !!selectedVistoria.tecnico_nome &&
                selectedVistoria.situacao !== "VISTORIADO" &&
                selectedVistoria.situacao !== "REVISITADO" &&
                selectedVistoria.situacao !== "REJEITADA" && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecusarVistoria(selectedVistoria);
                      setRecusarJustificativa("");
                      setRecusarError(null);
                    }}
                    className="mb-3 flex w-full items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold transition hover:brightness-125"
                    style={{ background: "rgba(239,68,68,0.1)", color: PANEL.danger, borderRadius: 12, border: `1px solid rgba(239,68,68,0.3)` }}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Recusar vistoria
                  </button>
                )}

              {/* Quick actions */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleTogglePostesProximos(selectedVistoria)}
                  disabled={postesProximosLoading}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-center transition hover:brightness-125 disabled:opacity-60"
                  style={{
                    background: postesProximosAtivo ? "rgba(255,255,255,0.07)" : PANEL.cardAlt,
                    border: `1px solid ${postesProximosAtivo ? "#3D4753" : PANEL.border}`,
                  }}
                >
                  <MapPinned className="h-4 w-4" style={{ color: PANEL.textSoft }} />
                  <span className="text-[9.5px] font-semibold leading-tight" style={{ color: PANEL.textSoft }}>
                    {postesProximosLoading ? "Buscando…" : postesProximosAtivo ? `Postes (${postesProximos.length})` : "Postes próximos"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetalheVistoria(selectedVistoria)}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-center transition hover:brightness-125"
                  style={{ background: PANEL.cardAlt, border: `1px solid ${PANEL.border}` }}
                >
                  <Info className="h-4 w-4" style={{ color: PANEL.textSoft }} />
                  <span className="text-[9.5px] font-semibold leading-tight" style={{ color: PANEL.textSoft }}>Ver detalhes</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStreetViewVistoria(selectedVistoria)}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-center transition hover:brightness-125"
                  style={{ background: PANEL.cardAlt, border: `1px solid ${PANEL.border}` }}
                >
                  <Camera className="h-4 w-4" style={{ color: PANEL.textSoft }} />
                  <span className="text-[9.5px] font-semibold leading-tight" style={{ color: PANEL.textSoft }}>Street View</span>
                </button>
              </div>

              {postesProximosAtivo && postesProximos.length > 0 && (
                <div className="mt-2 max-h-[140px] space-y-1 overflow-y-auto rounded-xl p-1.5" style={{ background: PANEL.cardAlt, border: `1px solid ${PANEL.border}` }}>
                  {postesProximos.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <span className="truncate text-[10.5px] font-medium" style={{ color: PANEL.textSoft }}>
                        PSPOSTE {p.pspostefield}
                      </span>
                      {p.distancia_m != null && (
                        <span className="shrink-0 text-[9.5px] font-bold" style={{ color: "#A78BFA" }}>
                          {Math.round(p.distancia_m)} m
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {postesProximosAtivo && !postesProximosLoading && postesProximos.length === 0 && (
                <p className="mt-2 text-center text-[10.5px]" style={{ color: PANEL.textSoft }}>
                  Nenhum poste num raio de {POSTES_PROXIMOS_RAIO_M} m.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <VistoriaDetalheModal
        open={!!detalheVistoria}
        vistoriaId={detalheVistoria?.id ?? null}
        equipamentoLabel={detalheVistoria?.equipamento}
        onClose={() => setDetalheVistoria(null)}
      />
      <StreetViewModal
        open={!!streetViewVistoria}
        lat={streetViewVistoria?.latitude ?? 0}
        lng={streetViewVistoria?.longitude ?? 0}
        label={streetViewVistoria?.equipamento}
        onClose={() => setStreetViewVistoria(null)}
      />
      {/* ── MODAL ATRIBUIR TÉCNICO ───────────────────────────────────────── */}
      {/* Só abre pra vistoria sem técnico (gate nos dois gatilhos acima) —
          reatribuir/desvincular um já em campo é exclusivo da Central de
          Vistorias (2026-08-21). */}
      {atribuirVistoria && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--vm-tile-blue)" }}>
                  <UserCheck className="h-5 w-5" style={{ color: "#3B82F6" }} />
                </div>
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: "var(--vm-text)" }}>Atribuir técnico</h2>
                  <p className="truncate text-[11px]" style={{ color: "var(--vm-faint)", maxWidth: 200 }}>{atribuirVistoria.equipamento}</p>
                </div>
              </div>
              <button type="button" onClick={() => setAtribuirVistoria(null)} style={{ color: "var(--vm-faint)" }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Técnico</label>
            <div className="relative mb-3">
              <select
                value={atribuirTecId}
                onChange={(e) => setAtribuirTecId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full appearance-none rounded-xl py-2 pl-3 pr-8 text-[12px] outline-none focus:border-blue-400"
                style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)", color: "var(--vm-text)" }}
              >
                <option value="">Selecione…</option>
                {(data?.tecnicos ?? []).map((t) => (
                  <option key={t.users_id} value={t.users_id}>
                    {t.nome} {t.status_operacional !== "offline" ? "●" : "○"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--vm-faint)" }} />
            </div>

            <label className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Motivo *</label>
            <textarea
              value={atribuirMotivo}
              onChange={(e) => setAtribuirMotivo(e.target.value)}
              placeholder="Ex: técnico mais próximo…"
              rows={2}
              className="mb-4 w-full resize-none rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
              style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)", color: "var(--vm-text)" }}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAtribuirVistoria(null)}
                className="flex-1 rounded-xl py-2 text-[12px] font-semibold transition hover:brightness-95"
                style={{ border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)", background: "var(--vm-tile)" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!atribuirTecId || !atribuirMotivo.trim() || atribuirLoading}
                onClick={async () => {
                  if (!atribuirTecId || !atribuirMotivo.trim() || !session?.token) return;
                  setAtribuirLoading(true);
                  try {
                    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
                    await fetch(`${base}/api/painel/central-vistorias/${atribuirVistoria.id}/reatribuir`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
                      body: JSON.stringify({ tecnicoId: atribuirTecId, motivo: atribuirMotivo.trim() }),
                    });
                    setAtribuirVistoria(null);
                    setAtribuirTecId("");
                    setAtribuirMotivo("");
                    void fetchMapa();
                  } finally {
                    setAtribuirLoading(false);
                  }
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2 text-[12px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {atribuirLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RECUSAR VISTORIA (em nome do técnico) ─────────────────────── */}
      {recusarVistoria && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(239,68,68,0.12)" }}>
                  <Ban className="h-5 w-5" style={{ color: "#EF4444" }} />
                </div>
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: "var(--vm-text)" }}>Recusar vistoria</h2>
                  <p className="truncate text-[11px]" style={{ color: "var(--vm-faint)", maxWidth: 200 }}>{recusarVistoria.equipamento}</p>
                </div>
              </div>
              <button type="button" onClick={() => setRecusarVistoria(null)} style={{ color: "var(--vm-faint)" }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-3 rounded-xl px-3 py-2 text-[11px] leading-relaxed" style={{ background: "rgba(239,68,68,0.08)", color: "var(--vm-text-soft)" }}>
              Isso tira a vistoria de <strong style={{ color: "var(--vm-text)" }}>{recusarVistoria.tecnico_nome}</strong> pra
              sempre (mesmo efeito de uma recusa aprovada) — use só quando o técnico está incapacitado de fazer isso pelo
              próprio app.
            </p>

            <label className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Motivo *</label>
            <textarea
              value={recusarJustificativa}
              onChange={(e) => setRecusarJustificativa(e.target.value)}
              placeholder="Ex: técnico se acidentou, celular quebrado, sem contato desde..."
              rows={3}
              className="mb-1 w-full resize-none rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
              style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)", color: "var(--vm-text)" }}
            />
            {recusarError && (
              <p className="mb-2 text-[11px] font-medium" style={{ color: "#EF4444" }}>{recusarError}</p>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setRecusarVistoria(null)}
                className="flex-1 rounded-xl py-2 text-[12px] font-semibold transition hover:brightness-95"
                style={{ border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)", background: "var(--vm-tile)" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!recusarJustificativa.trim() || recusarLoading}
                onClick={async () => {
                  if (!recusarJustificativa.trim() || !session?.token) return;
                  setRecusarLoading(true);
                  setRecusarError(null);
                  try {
                    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
                    const res = await fetch(`${base}/api/painel/central-vistorias/${recusarVistoria.id}/recusar`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
                      body: JSON.stringify({ justificativa: recusarJustificativa.trim() }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      setRecusarError(data?.message ?? "Falha ao recusar a vistoria.");
                      return;
                    }
                    setRecusarVistoria(null);
                    setSelectedVistoria(null);
                    void fetchMapa();
                  } catch {
                    setRecusarError("Falha ao recusar a vistoria. Verifique a conexão e tente de novo.");
                  } finally {
                    setRecusarLoading(false);
                  }
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                style={{ background: "#DC2626" }}
              >
                {recusarLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                Recusar
              </button>
            </div>
          </div>
        </div>
      )}
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
        background: "var(--vm-glass)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(0,179,136,0.18)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <span style={{ color: accent ?? "var(--vm-faint)" }}>{icon}</span>
      <span className="text-[10px]" style={{ color: "var(--vm-faint)" }}>{label}</span>
      <span className="text-[12px] font-semibold tabular-nums" style={{ color: accent ?? "var(--vm-text)" }}>{value}</span>
    </div>
  );
}

function TabBtn({
  active, onClick, icon, label, badge, accent = "#00B388",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1 overflow-hidden rounded-lg px-1.5 py-1.5 text-[10.5px] font-semibold transition"
      style={{
        background: active ? tint(accent, 0.15) : "transparent",
        color: active ? accent : "var(--vm-faint)",
        border: `1px solid ${active ? tint(accent, 0.3) : "transparent"}`,
      }}
    >
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span
          className="shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold tabular-nums"
          style={{
            background: active ? tint(accent, 0.2) : "rgba(0,0,0,0.06)",
            color: active ? accent : "var(--vm-faint)",
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
        background: active ? `${color}18` : "var(--vm-fill)",
        color: active ? color : "var(--vm-faint)",
        border: `1px solid ${active ? `${color}40` : "var(--vm-fill-2)"}`,
      }}
    >
      {label}
      <span
        className="rounded-full px-1 text-[9px] font-bold tabular-nums"
        style={{ background: active ? "rgba(255,255,255,0.12)" : "var(--vm-fill-2)" }}
      >
        {n}
      </span>
    </button>
  );
}
