"use client";

/**
 * SimulacaoDiaOverlay — o "agendar" deixa de ser um salvar seco e vira uma
 * simulação do dia do técnico montando na frente do analista.
 *
 * O servidor devolve só o esqueleto (/preview/plano: ordem, SLA do
 * técnico, expediente) em milissegundos. Daí o NAVEGADOR traça cada perna
 * na Mapbox Directions e desenha a linha crescendo no mapa — com o MESMO
 * veículo 3D da tela de deslocamento (TechModel3DLayer) andando na ponta —
 * e cada parada ganha dia/horário na timeline naquele instante. Os horários
 * vêm da MESMA função pura que o servidor usa ao gravar
 * (roteirizacaoHorarios.ts): respeitam o expediente configurado no painel
 * (o que não cabe até o fim vai pro próximo dia útil), o almoço de 1h e a
 * margem de 30 min. O /preview completo roda em paralelo só pro clima.
 *
 * Editável: tirar uma parada da rota (clique no pin ou no ✕), reordenar
 * (◀ ▶) e restaurar. A primeira montagem é cinematográfica; edições
 * replanejam na hora, sem repetir a animação. A ordem final vai junto na
 * confirmação e o servidor a respeita.
 */

import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CloudRain,
  Crosshair,
  Flag,
  List,
  Loader2,
  MapPin,
  Moon,
  RotateCcw,
  Route,
  Sunrise,
  Timer,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { MAP_STYLE_DARK, getMapboxToken } from "@/services/maps";
import type { AgendamentoPlano, AgendamentoPreviewResponse } from "@/services/painel";
import { TechModel3DLayer, type TechEntrySpec } from "@/app/painel/mapa/techModel3DLayer";
import type { RouteResult } from "@/app/painel/mapa/routeService";
import {
  planejarDias,
  resumirDias,
  tsBrasilia,
  type ExpedienteJanela,
  type HorarioParada,
  type PernaCalculada,
} from "@/lib/roteirizacaoHorarios";

/* ─── paleta própria da simulação — mundo escuro deliberado, único tema ───── */
const SIM = {
  bg: "#04151A",
  glass: "rgba(5,24,28,0.84)",
  /** Opaco — pro cartão da parada não deixar o mapa vazar por trás do texto. */
  panelSolid: "#071D22",
  border: "rgba(94,255,217,0.16)",
  borderSoft: "rgba(255,255,255,0.07)",
  text: "#E9F7F2",
  soft: "rgba(233,247,242,0.66)",
  faint: "rgba(233,247,242,0.38)",
  accent: "#00D4A0",
  mint: "#5EFFD9",
  brand: "#00B388",
  brandDeep: "#00875F",
  amber: "#F4B400",
  danger: "#F87171",
  tile: "rgba(255,255,255,0.05)",
} as const;

/** Uma cor por dia de roteiro — linha, anel do pin e cabeçalho do dia batem. */
const DIA_CORES = ["#00D4A0", "#F4B400", "#A78BFA", "#60A5FA", "#F472B6", "#FB923C"];
const corDoDia = (i: number) => DIA_CORES[i % DIA_CORES.length];

/** Visão inicial: o estado de SP inteiro — o mapa aparece de cara, antes do plano, e depois "voa" até a rota. */
const SP_CENTER: [number, number] = [-48.6, -22.4];
const SP_ZOOM = 5.6;

if (typeof document !== "undefined" && !document.getElementById("vm-sim-style")) {
  const s = document.createElement("style");
  s.id = "vm-sim-style";
  s.textContent = `
    @keyframes simPop{0%{transform:scale(.55);opacity:.5}55%{transform:scale(1.25)}100%{transform:scale(1);opacity:1}}
    @keyframes simRing{0%{box-shadow:0 0 0 0 var(--ring,rgba(0,212,160,.65)),0 4px 14px rgba(0,0,0,.45)}100%{box-shadow:0 0 0 18px transparent,0 4px 14px rgba(0,0,0,.45)}}
    .sim-pin{--ring:rgba(0,212,160,.65);width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center;
      font:800 12px/1 ui-sans-serif,system-ui;color:#fff;background:linear-gradient(145deg,#00B388,#00875F);cursor:pointer;
      border:2.5px solid rgba(255,255,255,.9);box-shadow:0 4px 14px rgba(0,0,0,.45);opacity:.55;transform:scale(.88);
      transition:opacity .35s ease,transform .35s ease,filter .35s ease,box-shadow .35s ease;filter:saturate(.35)}
    .sim-pin[data-on="1"]{opacity:1;transform:scale(1);filter:none;box-shadow:0 0 0 3px var(--dia,transparent),0 4px 14px rgba(0,0,0,.45)}
    .sim-pin[data-on="1"][data-pop="1"]{animation:simPop .55s cubic-bezier(.22,.7,.2,1) both,simRing 1.1s ease-out .1s 1}
    .sim-pin[data-off="1"]{opacity:.7;transform:scale(.8);filter:none;background:#2A3740;border-color:rgba(255,255,255,.35);color:rgba(255,255,255,.6);text-decoration:line-through}
    .sim-pin:hover{transform:scale(1.08)}
    .sim-pin[data-hi="1"]{transform:scale(1.4);z-index:6;box-shadow:0 0 0 7px var(--dia,rgba(0,212,160,.35)),0 8px 22px rgba(0,0,0,.55)}
    .sim-bloco{position:absolute;top:5px;bottom:5px;border-radius:3px;padding:0;border:none;cursor:pointer;
      transition:transform .12s ease,filter .12s ease,box-shadow .12s ease;transform-origin:center}
    .sim-bloco:hover,.sim-bloco[data-sel="1"]{transform:scaleY(1.35);filter:brightness(1.35);box-shadow:0 0 12px currentColor;z-index:3}
    .sim-strip{scrollbar-width:thin;scrollbar-color:rgba(94,255,217,.25) transparent}
    .sim-strip::-webkit-scrollbar{height:6px}
    .sim-strip::-webkit-scrollbar-thumb{background:rgba(94,255,217,.25);border-radius:9999px}
    .mapboxgl-ctrl-logo{opacity:.35}
  `;
  document.head.appendChild(s);
}

/* ─── geometria ─────────────────────────────────────────────────────────── */
type LatLng = { lat: number; lng: number };
type Coord = [number, number];

interface Leg extends PernaCalculada {
  coords: Coord[];
  estimado: boolean;
}

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function cumulativo(coords: Coord[]): number[] {
  const acc = [0];
  for (let i = 1; i < coords.length; i++) {
    acc.push(acc[i - 1] + haversineM({ lng: coords[i - 1][0], lat: coords[i - 1][1] }, { lng: coords[i][0], lat: coords[i][1] }));
  }
  return acc;
}

function trechoParcial(coords: Coord[], acc: number[], alvoM: number): Coord[] {
  if (alvoM >= acc[acc.length - 1]) return coords;
  const out: Coord[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    if (acc[i] <= alvoM) {
      out.push(coords[i]);
      continue;
    }
    const seg = acc[i] - acc[i - 1];
    const t = seg > 0 ? (alvoM - acc[i - 1]) / seg : 0;
    out.push([coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t]);
    break;
  }
  return out;
}

/** Mesmo perfil (driving) e fallback (30 km/h em linha reta) do servidor — só acrescenta a geometria pro desenho. */
async function buscarPerna(de: LatLng, para: LatLng): Promise<Leg> {
  const reta: Coord[] = [[de.lng, de.lat], [para.lng, para.lat]];
  const distReta = haversineM(de, para);
  const fallback: Leg = { distanciaM: Math.round(distReta), duracaoMin: (distReta / 1000 / 30) * 60, coords: reta, estimado: true };
  const token = getMapboxToken();
  if (!token) return fallback;
  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${de.lng},${de.lat};${para.lng},${para.lat}` +
      `?geometries=geojson&overview=full&access_token=${token}`;
    const r = await fetch(url);
    if (!r.ok) return fallback;
    const json = await r.json();
    const route = json.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return fallback;
    return { distanciaM: Math.round(route.distance), duracaoMin: route.duration / 60, coords: route.geometry.coordinates as Coord[], estimado: false };
  } catch {
    return fallback;
  }
}

/* ─── formatação ─────────────────────────────────────────────────────────── */
const TZ = "America/Sao_Paulo";
const fmtHora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const fmtKm = (m: number) => (m / 1000).toFixed(1).replace(".", ",");
function fmtMin(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** "qui 10/09" — curto, tabular e sem o "Qui., 10 De Set." que o toLocaleDateString + capitalize produzia. */
function fmtDia(iso: string): string {
  // Meio-dia de Brasília = 15:00 UTC, então getUTCDay() cai sempre no dia certo.
  const semana = DIAS_SEMANA[new Date(`${iso}T12:00:00-03:00`).getUTCDay()];
  return `${semana} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** "HH:MM" → minutos desde a meia-noite. */
function hhmmMin(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}
/** Minutos desde a meia-noite (Brasília) que um instante ocupa dentro do seu dia. */
function minNoDia(d: Date, dia: string): number {
  return (d.getTime() - tsBrasilia(dia, "00:00")) / 60000;
}
function iniciais(nome: string): string {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/** Número animado (ease-out cúbico) com casas decimais — o CountUp do painel só faz inteiro compacto. */
function useTween(value: number, ms = 700): number {
  const [v, setV] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(step);
      else prev.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return v;
}

/* ─── mapa: fontes/camadas ───────────────────────────────────────────────── */
const SRC_DONE = "sim-route-done";
const SRC_ACTIVE = "sim-route-active";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const lineFC = (linhas: Array<{ coords: Coord[]; cor: string }>): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: linhas
    .filter((l) => l.coords.length >= 2)
    .map((l) => ({ type: "Feature", properties: { cor: l.cor }, geometry: { type: "LineString", coordinates: l.coords } })),
});

/** Mesma linha "estilo Waze" da tela de deslocamento (glow + traço), cor por dia. */
function montarCamadas(map: mapboxgl.Map) {
  if (map.getSource(SRC_DONE)) return;
  map.addSource(SRC_DONE, { type: "geojson", data: EMPTY_FC });
  map.addSource(SRC_ACTIVE, { type: "geojson", data: EMPTY_FC });
  const glow = (id: string, src: string, opacity: number) =>
    map.addLayer({
      id,
      type: "line",
      source: src,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "cor"], "line-width": 10, "line-blur": 6, "line-opacity": opacity },
    });
  const line = (id: string, src: string, width: number) =>
    map.addLayer({
      id,
      type: "line",
      source: src,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "cor"], "line-width": width, "line-opacity": 0.92 },
    });
  glow("sim-done-glow", SRC_DONE, 0.35);
  line("sim-done-line", SRC_DONE, 3);
  glow("sim-active-glow", SRC_ACTIVE, 0.55);
  line("sim-active-line", SRC_ACTIVE, 4);
}

/** Prédios extrudados — mesma camada do modo 3D do mapa (cor do tema escuro). */
function montarPredios(map: mapboxgl.Map) {
  if (map.getLayer("sim-buildings")) return;
  try {
    map.addLayer({
      id: "sim-buildings",
      source: "composite",
      "source-layer": "building",
      filter: ["==", "extrude", "true"],
      type: "fill-extrusion",
      minzoom: 13,
      paint: {
        "fill-extrusion-color": "#091616",
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 15.05, ["get", "height"]],
        "fill-extrusion-base": ["get", "min_height"],
        "fill-extrusion-opacity": 0.72,
      },
    });
  } catch {
    /* composite pode não existir no estilo */
  }
}

/* ─── componente ─────────────────────────────────────────────────────────── */
type Etapa = "pendente" | "ativa" | "ok" | "falhou";

interface SimulacaoDiaOverlayProps {
  open: boolean;
  tecnico: { id: string; nome: string } | null;
  dataAgendada: string;
  plano: AgendamentoPlano | null;
  planoErro: string | null;
  previewFinal: AgendamentoPreviewResponse | null;
  climaErro: boolean;
  confirmando: boolean;
  erro: string | null;
  onVoltar: () => void;
  /** Recebe a ordem final (ids), já sem as paradas retiradas. */
  onConfirmar: (ordem: number[]) => void;
  /** Avisa a cada edição (remover/reordenar/restaurar) — o painel refaz o clima em segundo plano. */
  onOrdemChange?: (ordem: number[]) => void;
}

interface Ponto extends LatLng {
  key: string;
}

export function SimulacaoDiaOverlay({
  open,
  tecnico,
  dataAgendada,
  plano,
  planoErro,
  previewFinal,
  climaErro,
  confirmando,
  erro,
  onVoltar,
  onConfirmar,
  onOrdemChange,
}: SimulacaoDiaOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const layer3dRef = useRef<TechModel3DLayer | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const pinElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const legCacheRef = useRef<Map<string, Promise<Leg>>>(new Map());
  const geracaoRef = useRef(0);
  const cinematicoFeitoRef = useRef(false);
  const ordemRef = useRef<number[]>([]);
  const removidasRef = useRef<number[]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [mapErro, setMapErro] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<number[]>([]);
  const [removidas, setRemovidas] = useState<number[]>([]);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [rotasResolvidas, setRotasResolvidas] = useState(0);
  const [concluido, setConcluido] = useState(false);
  const [replanejando, setReplanejando] = useState(false);
  const [dockAberto, setDockAberto] = useState(true);
  const [vista, setVista] = useState<"linha" | "lista">("linha");
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [selId, setSelId] = useState<number | null>(null);

  const reduzir = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const paradaPorId = useMemo(() => new Map((plano?.paradas ?? []).map((p) => [p.vistoria_id, p])), [plano]);
  const expediente: ExpedienteJanela | null = useMemo(
    () => (plano ? { inicio: plano.expediente.inicio, fim: plano.expediente.fim, fimDeSemana: plano.expediente.fim_de_semana } : null),
    [plano]
  );

  /* horários — a MESMA função pura do servidor */
  const horariosDe = useCallback(
    (pernas: PernaCalculada[]): HorarioParada[] =>
      plano && expediente ? planejarDias(plano.data_agendada, expediente, plano.sla_min, pernas, plano.hora_inicio) : [],
    [plano, expediente]
  );
  const horarios = useMemo(() => horariosDe(legs), [horariosDe, legs]);
  const dias = useMemo(() => resumirDias(horarios), [horarios]);
  const diaIndex = useCallback((dia: string) => Math.max(0, dias.findIndex((d) => d.dia === dia)), [dias]);

  /** Paradas já reveladas, agrupadas por dia — alimenta a linha do tempo. */
  const porDia = useMemo(() => {
    const m = new Map<string, BlocoParada[]>();
    ordem.forEach((id, i) => {
      const h = horarios[i];
      const p = paradaPorId.get(id);
      if (!h || !p || i >= legs.length) return;
      const arr = m.get(h.dia) ?? [];
      arr.push({ id, ordem: i + 1, equipamento: p.equipamento, chegada: h.chegada, saida: h.saida, almocoAntes: h.almocoAntes, legKm: legs[i].distanciaM, legMin: legs[i].duracaoMin });
      m.set(h.dia, arr);
    });
    return m;
  }, [ordem, horarios, legs, paradaPorId]);

  /**
   * Eixo de tempo COMPARTILHADO por todos os dias — sem isso cada dia teria
   * escala própria e um dia quase vazio pareceria tão cheio quanto um lotado.
   * Vai do início do expediente até o fim dele (ou até o término mais tarde,
   * quando a margem estoura a janela).
   */
  const eixo = useMemo(() => {
    if (!plano || dias.length === 0) return null;
    const ini = hhmmMin(plano.expediente.inicio);
    const fim = hhmmMin(plano.expediente.fim);
    const max = dias.reduce((mx, d) => Math.max(mx, minNoDia(d.termino, d.dia)), fim);
    return { ini, fim, max, span: Math.max(1, max - ini) };
  }, [plano, dias]);

  /** Destaca no mapa o pin da parada sob o cursor (ou selecionada) na linha do tempo. */
  useEffect(() => {
    pinElsRef.current.forEach((el, id) => {
      el.dataset.hi = id === hoverId || id === selId ? "1" : "0";
    });
  }, [hoverId, selId, legs.length]);

  const focarNoMapa = useCallback(
    (id: number) => {
      const p = paradaPorId.get(id);
      if (!p || !mapRef.current) return;
      mapRef.current.easeTo({ center: [p.lng, p.lat], zoom: Math.max(mapRef.current.getZoom(), 14), duration: 900 });
    },
    [paradaPorId]
  );

  /* ── mapa: nasce quando abre, morre quando fecha ───────────────────────── */
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const token = getMapboxToken();
    if (!token) {
      setMapErro("Token do Mapbox não configurado neste painel (NEXT_PUBLIC_MAPBOX_TOKEN).");
      return;
    }
    mapboxgl.accessToken = token;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAP_STYLE_DARK,
        center: SP_CENTER,
        zoom: SP_ZOOM,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        antialias: true, // a camada 3D (Three.js) precisa disso pra não serrilhar
      });
    } catch (e) {
      setMapErro(e instanceof Error ? e.message : String(e));
      return;
    }
    // CustomLayerInterface só funciona certo em mercator — o estilo escuro do v3 nasce em "globe".
    map.setProjection("mercator");
    mapRef.current = map;
    map.on("error", (ev) => {
      const msg = ev?.error?.message ?? "erro desconhecido no mapa";
      setMapErro(msg);
      void import("@/lib/reportClientError").then(({ reportClientError }) => reportClientError(msg, "SimulacaoDiaOverlay/mapa"));
    });
    map.on("load", () => {
      map.setProjection("mercator");
      map.resize();
      montarPredios(map);
      montarCamadas(map);
      try {
        const l3d = new TechModel3DLayer();
        map.addLayer(l3d);
        layer3dRef.current = l3d;
      } catch (e) {
        // sem o veículo 3D a simulação continua — só sem o carro
        void import("@/lib/reportClientError").then(({ reportClientError }) =>
          reportClientError(e instanceof Error ? e.message : String(e), "SimulacaoDiaOverlay/3d")
        );
      }
      setMapReady(true);
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    const geracao = geracaoRef; // contador, não nó do DOM — invalida qualquer execução em curso no cleanup

    // Resize à prova de bala (mesmo motivo do /painel/mapa): em alguns casos a
    // altura só assenta depois, e um resize único trava num valor curto.
    let estavel = 0;
    const poll = window.setInterval(() => {
      map.resize();
      const alvo = containerRef.current?.clientHeight ?? 0;
      if (alvo > 0 && Math.abs(map.getCanvas().clientHeight - alvo) <= 1) {
        if (++estavel >= 4) window.clearInterval(poll);
      } else estavel = 0;
    }, 250);

    // Cão de guarda: se depois de 3s o canvas continuar sem altura, mostra os
    // números reais em vez de deixar a tela preta sem explicação.
    const watchdog = window.setTimeout(() => {
      const cv = map.getCanvas();
      const el = containerRef.current;
      if ((cv?.clientHeight ?? 0) > 0 && (el?.clientHeight ?? 0) > 0) return;
      const diag = `container ${el?.clientWidth ?? 0}×${el?.clientHeight ?? 0} · canvas ${cv?.clientWidth ?? 0}×${cv?.clientHeight ?? 0} · estilo ${map.isStyleLoaded() ? "ok" : "não carregado"}`;
      setMapErro(diag);
      void import("@/lib/reportClientError").then(({ reportClientError }) => reportClientError(diag, "SimulacaoDiaOverlay/tamanho"));
    }, 3000);

    return () => {
      ro.disconnect();
      window.clearInterval(poll);
      window.clearTimeout(watchdog);
      geracao.current++;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      pinElsRef.current = new Map();
      legCacheRef.current = new Map();
      cinematicoFeitoRef.current = false;
      layer3dRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
      setMapErro(null);
      setOrdem([]);
      setRemovidas([]);
      setLegs([]);
      setRotasResolvidas(0);
      setConcluido(false);
      setReplanejando(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ── helpers de mapa ──────────────────────────────────────────────────── */
  /** Só as paradas — o roteiro não parte mais da posição do técnico. */
  const pontosDe = useCallback(
    (ids: number[]): Ponto[] => {
      const out: Ponto[] = [];
      for (const id of ids) {
        const p = paradaPorId.get(id);
        if (p) out.push({ key: String(id), lat: p.lat, lng: p.lng });
      }
      return out;
    },
    [paradaPorId]
  );

  const obterLeg = useCallback((de: Ponto, para: Ponto): Promise<Leg> => {
    const k = `${de.key}>${para.key}`;
    let p = legCacheRef.current.get(k);
    if (!p) {
      p = buscarPerna(de, para);
      legCacheRef.current.set(k, p);
    }
    return p;
  }, []);

  const spec3d = useCallback(
    (lng: number, lat: number, route: RouteResult | null, speedKmh: number | null): TechEntrySpec => ({
      usersId: Number(tecnico?.id) || 1,
      nome: tecnico?.nome ?? "",
      lng,
      lat,
      speedKmh,
      corHex: SIM.accent,
      route,
      paradoDesdeMin: null,
    }),
    [tecnico]
  );

  const enquadrar = useCallback(
    (ids: number[], voar: boolean) => {
      const map = mapRef.current;
      if (!map || !plano) return;
      const bounds = new mapboxgl.LngLatBounds();
      ids.forEach((id) => {
        const p = paradaPorId.get(id);
        if (p) bounds.extend([p.lng, p.lat]);
      });
      const h = map.getContainer().clientHeight || 800;
      const dockH = dockRef.current?.offsetHeight ?? 220;
      const bottom = Math.min(dockH + 48, Math.round(h * 0.45));
      const padding = { top: 120, bottom, left: 90, right: 90 };
      const cam = map.cameraForBounds(bounds, { padding, maxZoom: 15, pitch: reduzir ? 0 : 50, bearing: reduzir ? 0 : -18 });
      if (!cam) return;
      if (voar && !reduzir) map.flyTo({ ...cam, duration: 2400, curve: 1.25, essential: true });
      else map.easeTo({ ...cam, duration: reduzir ? 0 : 900, essential: true });
    },
    [plano, paradaPorId, reduzir]
  );

  /** Pins numerados na ordem atual + pins "fora da rota" (riscados). Clique alterna. */
  const montarPins = useCallback(
    (ids: number[], fora: number[], acesas: number, hs: HorarioParada[]) => {
      const map = mapRef.current;
      if (!map || !plano) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      pinElsRef.current = new Map();
      const diasLista = resumirDias(hs).map((d) => d.dia);
      ids.forEach((id, i) => {
        const p = paradaPorId.get(id);
        if (!p) return;
        const el = document.createElement("div");
        el.className = "sim-pin";
        el.textContent = String(i + 1);
        el.title = `${p.equipamento} — clique pra tirar da rota`;
        const ligada = i < acesas;
        el.dataset.on = ligada ? "1" : "0";
        if (ligada && hs[i]) {
          const cor = corDoDia(Math.max(0, diasLista.indexOf(hs[i].dia)));
          el.style.setProperty("--dia", cor);
          el.style.setProperty("--ring", cor);
        }
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          remover(id);
        });
        markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
        pinElsRef.current.set(id, el);
      });
      fora.forEach((id) => {
        const p = paradaPorId.get(id);
        if (!p) return;
        const el = document.createElement("div");
        el.className = "sim-pin";
        el.dataset.off = "1";
        el.textContent = "×";
        el.title = `${p.equipamento} — fora da rota · clique pra restaurar`;
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          restaurar(id);
        });
        markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
      });
    },
    // remover/restaurar são definidos abaixo e estáveis via ref de geração
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plano, paradaPorId]
  );

  const desenharFeitas = useCallback(
    (pernas: Leg[]) => {
      const src = mapRef.current?.getSource(SRC_DONE) as GeoJSONSource | undefined;
      if (!src) return;
      const hs = horariosDe(pernas);
      const diasLista = resumirDias(hs).map((d) => d.dia);
      src.setData(lineFC(pernas.map((leg, i) => ({ coords: leg.coords, cor: corDoDia(Math.max(0, diasLista.indexOf(hs[i]?.dia ?? ""))) }))));
    },
    [horariosDe]
  );

  /* ── execução: cinematográfica (1ª vez) ou rápida (edições) ───────────── */
  const executar = useCallback(
    async (gen: number, ids: number[], fora: number[], cinematico: boolean) => {
      const map = mapRef.current;
      if (!map || !plano) return;
      const vivo = () => gen === geracaoRef.current;
      const pts = pontosDe(ids);
      // A 1ª parada abre o dia (sem perna antes dela) — perna zerada só pra
      // manter o alinhamento legs[i] ↔ ordem[i] ↔ horarios[i].
      const promessas = pts.map((p, i) => {
        if (i === 0) {
          if (vivo()) setRotasResolvidas((n) => n + 1);
          return Promise.resolve<Leg>({ distanciaM: 0, duracaoMin: 0, coords: [], estimado: false });
        }
        return obterLeg(pts[i - 1], p).then((leg) => {
          if (vivo()) setRotasResolvidas((n) => n + 1);
          return leg;
        });
      });
      const srcActive = () => map.getSource(SRC_ACTIVE) as GeoJSONSource | undefined;
      const l3d = () => layer3dRef.current;
      const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, reduzir ? 0 : ms));

      setRotasResolvidas(0);
      setConcluido(false);
      setLegs([]);
      srcActive()?.setData(EMPTY_FC);
      (map.getSource(SRC_DONE) as GeoJSONSource | undefined)?.setData(EMPTY_FC);
      montarPins(ids, fora, cinematico ? 0 : ids.length, cinematico ? [] : horariosDe([]));

      if (!cinematico) {
        setReplanejando(true);
        const todas = await Promise.all(promessas);
        if (!vivo()) return;
        setLegs(todas);
        desenharFeitas(todas);
        montarPins(ids, fora, ids.length, horariosDe(todas));
        const ultimo = pts[pts.length - 1];
        l3d()?.syncEntries([]);
        l3d()?.syncEntries([spec3d(ultimo.lng, ultimo.lat, null, 0)]);
        enquadrar(ids, false);
        setReplanejando(false);
        setConcluido(true);
        return;
      }

      // cinematográfico: beacon na 1ª parada (onde o dia começa), voo até a
      // rota, depois perna a perna
      if (pts[0]) l3d()?.syncEntries([spec3d(pts[0].lng, pts[0].lat, null, 0)]);
      enquadrar(ids, true);
      await dormir(2500);
      if (!vivo()) return;

      const acumuladas: Leg[] = [];
      for (let i = 0; i < ids.length; i++) {
        const leg = await promessas[i];
        if (!vivo()) return;
        const destino = pts[i];
        // cor da perna = cor do dia em que a parada de destino vai cair
        const hs = horariosDe([...acumuladas, leg]);
        const diasLista = resumirDias(hs).map((d) => d.dia);
        const cor = corDoDia(Math.max(0, diasLista.indexOf(hs[i]?.dia ?? "")));
        const ms = reduzir ? 0 : Math.min(1500, Math.max(500, leg.distanciaM / 30));

        await new Promise<void>((resolve) => {
          const acc = cumulativo(leg.coords);
          const total = acc[acc.length - 1];
          if (ms <= 0 || total === 0 || leg.coords.length < 2) {
            srcActive()?.setData(lineFC([{ coords: leg.coords, cor }]));
            resolve();
            return;
          }
          const fim = leg.coords[leg.coords.length - 1];
          // Mesmo objeto de rota em todos os frames — a camada 3D usa a
          // identidade pra manter o progresso monotônico (o carro nunca anda de ré).
          const route: RouteResult = { coordinates: leg.coords, distanceM: total, fetchedAt: performance.now(), destLng: fim[0], destLat: fim[1] };
          const speedKmh = (total / 1000) / (ms / 3_600_000);
          const t0 = performance.now();
          const step = (t: number) => {
            if (!vivo()) return resolve();
            const p = Math.min(1, (t - t0) / ms);
            const e = 1 - Math.pow(1 - p, 3);
            const parte = trechoParcial(leg.coords, acc, e * total);
            const ponta = parte[parte.length - 1];
            srcActive()?.setData(lineFC([{ coords: parte, cor }]));
            l3d()?.syncEntries([spec3d(ponta[0], ponta[1], route, speedKmh)]);
            if (p < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
        if (!vivo()) return;

        acumuladas.push(leg);
        desenharFeitas(acumuladas);
        srcActive()?.setData(EMPTY_FC);
        // chegou: vira beacon (parado) na parada — recria a entrada pra não
        // herdar o tween de posição antiga do carro.
        l3d()?.syncEntries([]);
        l3d()?.syncEntries([spec3d(destino.lng, destino.lat, null, 0)]);
        const el = pinElsRef.current.get(ids[i]);
        if (el) {
          el.dataset.on = "1";
          el.dataset.pop = "1";
          el.style.setProperty("--dia", cor);
          el.style.setProperty("--ring", cor);
        }
        setLegs([...acumuladas]);
        await dormir(260);
      }
      if (!vivo()) return;
      cinematicoFeitoRef.current = true;
      setConcluido(true);
      map.easeTo({ pitch: reduzir ? 0 : 55, bearing: reduzir ? 0 : -26, duration: reduzir ? 0 : 1800 });
    },
    [plano, pontosDe, obterLeg, montarPins, horariosDe, desenharFeitas, spec3d, enquadrar, reduzir]
  );

  /* primeira montagem, quando mapa + plano estiverem prontos */
  useEffect(() => {
    if (!open || !mapReady || !plano || cinematicoFeitoRef.current || ordemRef.current.length > 0) return;
    const ids = plano.paradas.map((p) => p.vistoria_id);
    ordemRef.current = ids;
    removidasRef.current = [];
    setOrdem(ids);
    setRemovidas([]);
    const gen = ++geracaoRef.current;
    void executar(gen, ids, [], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mapReady, plano]);

  /* edições: replaneja na hora, sem animação */
  const replanejar = useCallback(
    (novaOrdem: number[], novasFora: number[]) => {
      ordemRef.current = novaOrdem;
      removidasRef.current = novasFora;
      setOrdem(novaOrdem);
      setRemovidas(novasFora);
      cinematicoFeitoRef.current = true;
      const gen = ++geracaoRef.current;
      void executar(gen, novaOrdem, novasFora, false);
      onOrdemChange?.(novaOrdem);
    },
    [executar, onOrdemChange]
  );
  function remover(id: number) {
    const o = ordemRef.current.filter((x) => x !== id);
    if (o.length === 0) return; // nunca deixa a rota vazia
    replanejar(o, [...removidasRef.current.filter((x) => x !== id), id]);
  }
  function restaurar(id: number) {
    replanejar([...ordemRef.current.filter((x) => x !== id), id], removidasRef.current.filter((x) => x !== id));
  }
  function mover(id: number, delta: -1 | 1) {
    const o = [...ordemRef.current];
    const i = o.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    replanejar(o, removidasRef.current);
  }

  /* a faixa da timeline acompanha a última parada revelada */
  useEffect(() => {
    const el = stripRef.current;
    if (!el || !dockAberto) return;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [legs.length, concluido, dockAberto]);

  /* teclado + scroll do body */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmando) onVoltar();
    };
    window.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [open, confirmando, onVoltar]);

  /* ── derivados pra UI ─────────────────────────────────────────────────── */
  const totalKmM = legs.reduce((s, l) => s + l.distanciaM, 0);
  const totalRotaMin = legs.reduce((s, l) => s + l.duracaoMin, 0);
  const totalVistoriaMin = plano ? legs.length * plano.sla_min : 0;
  const kmAnim = useTween(totalKmM / 1000);
  const rotaAnim = useTween(totalRotaMin);
  const vistoriaAnim = useTween(totalVistoriaMin);

  const climaPorId = useMemo(() => {
    const m = new Map<number, { pct: number | null; alerta: boolean }>();
    previewFinal?.itens.forEach((it) => m.set(it.vistoria_id, { pct: it.risco_chuva_pct, alerta: it.risco_chuva_alerta }));
    return m;
  }, [previewFinal]);
  const chuvaNoDia = ordem.some((id) => climaPorId.get(id)?.alerta);

  const n = ordem.length;
  const etapas: Array<{ key: string; label: string; detalhe?: string; estado: Etapa }> = [
    { key: "ordem", label: "Ordenando paradas", estado: plano ? "ok" : planoErro ? "falhou" : "ativa" },
    { key: "rotas", label: "Traçando rotas", detalhe: plano ? `${Math.min(rotasResolvidas, n)}/${n}` : undefined, estado: !plano ? "pendente" : rotasResolvidas >= n ? "ok" : "ativa" },
    { key: "horarios", label: "Encaixando no expediente", detalhe: plano ? `${legs.length}/${n}` : undefined, estado: !plano ? "pendente" : concluido ? "ok" : legs.length > 0 ? "ativa" : "pendente" },
    {
      key: "clima",
      label: "Conferindo clima",
      detalhe: climaErro ? "indisponível" : previewFinal ? (chuvaNoDia ? "chuva no percurso" : "sem alerta") : undefined,
      estado: !plano ? "pendente" : previewFinal ? "ok" : climaErro ? "falhou" : "ativa",
    },
  ];

  const primeiroNome = tecnico?.nome.split(" ")[0] ?? "";
  const podeConfirmar = concluido && !confirmando && !replanejando && !!plano && n > 0;
  const kmTxt = `${kmAnim.toFixed(1).replace(".", ",")} km`;
  const ultimoDia = dias[dias.length - 1];
  const primeiroDia = dias[0];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="sim"
          className="fixed inset-0 z-[320] overflow-hidden"
          style={{ background: SIM.bg, color: SIM.text }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          {/* O container do mapa precisa de altura EXPLÍCITA (h-full), não de
              `absolute inset-0`: o mapbox-gl.css entra depois do Tailwind (vem
              no chunk dinâmico deste componente) e o seletor
              `.mapboxgl-map{position:relative}` ganha do `.absolute`, zerando a
              altura — o próprio `overflow:hidden` do Mapbox então escondia tudo
              (mapa preto, sem pins nem rota, e sem nenhum erro). */}
          <div className="absolute inset-0">
            <div ref={containerRef} className="h-full w-full" />
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: "linear-gradient(180deg, rgba(4,21,26,0.6) 0%, rgba(4,21,26,0) 18%), linear-gradient(0deg, rgba(4,21,26,0.55) 0%, rgba(4,21,26,0) 26%)",
            }}
          />

          {mapErro && (
            <div className="absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-xl px-4 py-2 text-[12px]" style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)", color: "#FECACA" }}>
              Mapa indisponível: {mapErro}
            </div>
          )}

          {/* voltar */}
          <motion.button
            type="button"
            onClick={onVoltar}
            disabled={confirmando}
            className="absolute left-6 top-6 z-10 flex h-10 items-center gap-2 rounded-full px-4 text-[12.5px] font-semibold backdrop-blur-md transition hover:bg-white/10 disabled:opacity-40"
            style={{ background: SIM.glass, border: `1px solid ${SIM.borderSoft}`, color: SIM.soft }}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </motion.button>

          {/* topo central: técnico + data + etapas */}
          <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex flex-col items-center gap-2.5 px-28">
            <motion.div
              className="pointer-events-auto flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5 backdrop-blur-md"
              style={{ background: SIM.glass, border: `1px solid ${SIM.border}`, boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: "linear-gradient(145deg,#00B388,#00875F)", boxShadow: "0 4px 14px rgba(0,179,136,0.4)" }}>
                {tecnico ? iniciais(tecnico.nome) : "—"}
              </span>
              <div className="leading-tight">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: SIM.faint }}>Simulação do roteiro</p>
                <p className="text-[13.5px] font-semibold">
                  {tecnico?.nome ?? "—"}
                  <span className="mx-2" style={{ color: SIM.faint }}>·</span>
                  <span style={{ color: SIM.soft }}>a partir de {fmtDia(dataAgendada)}</span>
                  {plano && (
                    <>
                      <span className="mx-2" style={{ color: SIM.faint }}>·</span>
                      <span style={{ color: SIM.soft }}>expediente {plano.expediente.inicio}–{plano.expediente.fim}</span>
                    </>
                  )}
                </p>
              </div>
            </motion.div>

            <motion.div
              className="pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1 backdrop-blur-md"
              style={{ background: SIM.glass, border: `1px solid ${SIM.borderSoft}` }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              {etapas.map((et, i) => (
                <div key={et.key} className="flex items-center">
                  {i > 0 && <span className="mx-1 h-px w-4" style={{ background: SIM.borderSoft }} />}
                  <div className="flex items-center gap-1.5 rounded-full px-1.5 py-0.5" style={{ opacity: et.estado === "pendente" ? 0.45 : 1 }}>
                    <EtapaIcone estado={et.estado} />
                    <span className="text-[11.5px] font-semibold" style={{ color: et.estado === "pendente" ? SIM.faint : SIM.text }}>{et.label}</span>
                    {et.detalhe && (
                      <span className="text-[10px] font-semibold tabular-nums" style={{ color: et.estado === "falhou" ? SIM.danger : SIM.mint }}>{et.detalhe}</span>
                    )}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* dock inferior central */}
          <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-6">
            <motion.div
              ref={dockRef}
              className="pointer-events-auto w-full max-w-[1120px] rounded-[26px] backdrop-blur-xl"
              style={{ background: SIM.glass, border: `1px solid ${SIM.border}`, boxShadow: "0 24px 70px rgba(0,0,0,0.5)" }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.15 }}
            >
              {/* barra do dock: status + alternador de vista + recolher */}
              <div className="flex items-center gap-3 px-4 pt-3" style={{ borderBottom: dockAberto ? `1px solid ${SIM.borderSoft}` : "none", paddingBottom: dockAberto ? 10 : 12 }}>
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {concluido ? (
                    <>
                      <span className="text-[12.5px] font-semibold">
                        {n} parada{n !== 1 ? "s" : ""} em {dias.length} dia{dias.length !== 1 ? "s" : ""}
                      </span>
                      {removidas.length > 0 && (
                        <span className="text-[11px]" style={{ color: SIM.faint }}>· {removidas.length} fora da rota</span>
                      )}
                      {!dockAberto && ultimoDia && (
                        <span className="text-[11.5px]" style={{ color: SIM.soft }}>
                          · termina {fmtDia(ultimoDia.dia)} às <b className="tabular-nums" style={{ color: SIM.mint }}>{fmtHora(ultimoDia.termino)}</b>
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="flex items-center gap-2 text-[12px]" style={{ color: SIM.soft }}>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: SIM.accent }} />
                      {replanejando ? "Replanejando…" : plano ? `Montando o roteiro — ${legs.length}/${n}` : "Ordenando as paradas…"}
                    </span>
                  )}
                </div>

                {dockAberto && (
                  <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${SIM.borderSoft}` }}>
                    {([["linha", "Linha do tempo", BarChart3], ["lista", "Lista", List]] as const).map(([k, rotulo, Icone]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setVista(k)}
                        className="flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition"
                        style={vista === k ? { background: SIM.tile, color: SIM.text, boxShadow: `inset 0 0 0 1px ${SIM.border}` } : { color: SIM.faint }}
                      >
                        <Icone className="h-3.5 w-3.5" /> {rotulo}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setDockAberto((v) => !v)}
                  className="flex h-8 items-center gap-1 rounded-full px-3 text-[11px] font-semibold transition hover:bg-white/10"
                  style={{ color: SIM.soft, border: `1px solid ${SIM.borderSoft}` }}
                >
                  {dockAberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                  {dockAberto ? "Recolher" : "Roteiro"}
                </button>
              </div>

              <AnimatePresence initial={false}>
                {dockAberto && (
                  <motion.div key="corpo" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                    <div className="px-4 pt-3">
                      {planoErro ? (
                        <div className="rounded-2xl px-4 py-3 text-[12.5px]" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>{planoErro}</div>
                      ) : (
                        <>
                          {plano && plano.ignorados_sem_coordenada.length > 0 && (
                            <p className="mb-2 rounded-xl px-3 py-1.5 text-[11px]" style={{ background: "rgba(244,180,0,0.1)", color: "#FDE68A", border: "1px solid rgba(244,180,0,0.25)" }}>
                              {plano.ignorados_sem_coordenada.length} equipamento(s) sem coordenada ficaram fora do roteiro.
                            </p>
                          )}

                          {/* LINHA DO TEMPO — cada dia é uma barra proporcional do
                              expediente inteiro, no MESMO eixo, então dá pra ver de
                              relance a densidade, onde cai o almoço e o quanto sobra. */}
                          {vista === "linha" && (
                            <div className="pb-1">
                              {eixo && plano ? (
                                <>
                                  <EixoHoras eixo={eixo} />
                                  <div className="space-y-1.5">
                                    {dias.map((d, i) => (
                                      <RibbonDia
                                        key={d.dia}
                                        dia={d.dia}
                                        cor={corDoDia(i)}
                                        termino={d.termino}
                                        blocos={porDia.get(d.dia) ?? []}
                                        eixo={eixo}
                                        expediente={plano.expediente}
                                        slaMin={plano.sla_min}
                                        margemMin={plano.margem_min}
                                        climaPorId={climaPorId}
                                        hoverId={hoverId}
                                        selId={selId}
                                        onHover={setHoverId}
                                        onSelect={(id) => setSelId((atual) => (atual === id ? null : id))}
                                        onRemover={remover}
                                        onMover={mover}
                                        onFocar={focarNoMapa}
                                        podeMoverAntes={(id) => ordem.indexOf(id) > 0}
                                        podeMoverDepois={(id) => ordem.indexOf(id) < ordem.length - 1}
                                      />
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <div className="flex h-[76px] items-center justify-center gap-2 text-[12px]" style={{ color: SIM.soft }}>
                                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: SIM.accent }} /> desenhando a linha do tempo…
                                </div>
                              )}
                            </div>
                          )}

                          {/* timeline horizontal por dia */}
                          <div ref={stripRef} className="sim-strip flex items-stretch gap-2 overflow-x-auto pb-2" style={{ display: vista === "lista" ? undefined : "none" }}>
                            {plano && (
                              <>
                                <Chip>
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: SIM.mint, color: SIM.bg }}><Sunrise className="h-4 w-4" /></span>
                                  <div className="leading-tight">
                                    <p className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: SIM.faint }}>Começa em</p>
                                    <p className="text-[13px] font-bold tabular-nums capitalize">{fmtDia(dias[0]?.dia ?? plano.data_agendada)} · {plano.hora_inicio}</p>
                                  </div>
                                </Chip>

                                {ordem.map((id, i) => {
                                  const p = paradaPorId.get(id);
                                  if (!p) return null;
                                  const revelada = i < legs.length;
                                  const h = horarios[i];
                                  const leg = legs[i];
                                  const clima = climaPorId.get(id);
                                  const cor = h ? corDoDia(diaIndex(h.dia)) : SIM.accent;
                                  return (
                                    <div key={id} className="flex items-stretch gap-2">
                                      {revelada && h?.novoDia && (
                                        <>
                                          <Seta ativa cor={cor} />
                                          <Chip cor={cor} titulo={`Não coube até ${plano.expediente.fim} — segue no próximo dia útil`}>
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: cor, color: "#0B1A1A" }}><Moon className="h-3.5 w-3.5" /></span>
                                            <div className="leading-tight">
                                              <p className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: cor }}>Vira o dia</p>
                                              <p className="text-[12.5px] font-bold capitalize">{fmtDia(h.dia)} · {plano.expediente.inicio}</p>
                                            </div>
                                          </Chip>
                                        </>
                                      )}
                                      {revelada && h?.almocoAntes && (
                                        <>
                                          <Seta ativa cor={cor} />
                                          <Chip amber>
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: SIM.amber, color: "#1C222B" }}><UtensilsCrossed className="h-3.5 w-3.5" /></span>
                                            <div className="leading-tight">
                                              <p className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "#FDE68A" }}>Almoço</p>
                                              <p className="text-[12.5px] font-bold tabular-nums" style={{ color: "#FDE68A" }}>12:00–13:00</p>
                                            </div>
                                          </Chip>
                                        </>
                                      )}
                                      <Seta ativa={revelada} cor={cor} />
                                      {revelada && h && leg ? (
                                        <motion.div initial={{ opacity: 0, x: 14, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ type: "spring", stiffness: 280, damping: 24 }} className="group flex">
                                          <Chip alerta={!!clima?.alerta} cor={cor}>
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: "linear-gradient(145deg,#00B388,#00875F)", boxShadow: `0 0 0 3px ${cor}55` }}>{i + 1}</span>
                                            <div className="min-w-0 leading-tight">
                                              <p className="max-w-[150px] truncate text-[12px] font-semibold">{p.equipamento}</p>
                                              <p className="text-[12.5px] font-bold tabular-nums" style={{ color: SIM.mint }}>
                                                {fmtHora(h.chegada)} <span className="font-medium" style={{ color: SIM.faint }}>→</span> {fmtHora(h.saida)}
                                              </p>
                                              <p className="flex items-center gap-1 text-[10px] tabular-nums" style={{ color: SIM.soft }}>
                                                {i === 0 ? (
                                                  <span style={{ color: SIM.faint }}>abre o dia</span>
                                                ) : (
                                                  <>
                                                    <Route className="h-2.5 w-2.5" style={{ color: SIM.faint }} />
                                                    +{fmtKm(leg.distanciaM)} km · {fmtMin(leg.duracaoMin)}
                                                  </>
                                                )}
                                                {clima?.alerta && (
                                                  <span className="ml-1 inline-flex items-center gap-0.5 font-semibold" style={{ color: "#FCA5A5" }}><CloudRain className="h-2.5 w-2.5" /> {clima.pct}%</span>
                                                )}
                                              </p>
                                            </div>
                                            {/* ações — aparecem no hover */}
                                            <div className="ml-1 flex flex-col gap-0.5 opacity-0 transition group-hover:opacity-100">
                                              <button type="button" title="Tirar da rota" onClick={() => remover(id)} className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-white/10" style={{ color: SIM.danger }}><X className="h-3 w-3" /></button>
                                              <div className="flex gap-0.5">
                                                <button type="button" title="Mover antes" onClick={() => mover(id, -1)} disabled={i === 0} className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-25" style={{ color: SIM.soft }}><ChevronLeft className="h-3 w-3" /></button>
                                                <button type="button" title="Mover depois" onClick={() => mover(id, 1)} disabled={i === ordem.length - 1} className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-25" style={{ color: SIM.soft }}><ChevronRight className="h-3 w-3" /></button>
                                              </div>
                                            </div>
                                          </Chip>
                                        </motion.div>
                                      ) : (
                                        <Chip dim>
                                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "rgba(255,255,255,0.06)", border: `1px dashed ${SIM.border}`, color: SIM.faint }}>{i + 1}</span>
                                          <div className="leading-tight">
                                            <p className="max-w-[120px] truncate text-[11.5px] font-medium" style={{ color: SIM.faint }}>{p.equipamento}</p>
                                            <p className="flex items-center gap-1 text-[10px]" style={{ color: SIM.faint }}>
                                              {i === legs.length && !concluido ? (<><Loader2 className="h-2.5 w-2.5 animate-spin" style={{ color: SIM.accent }} /> traçando…</>) : "aguardando"}
                                            </p>
                                          </div>
                                        </Chip>
                                      )}
                                    </div>
                                  );
                                })}

                                {concluido && ultimoDia && (
                                  <>
                                    <Seta ativa cor={corDoDia(dias.length - 1)} />
                                    <motion.div initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.1 }} className="flex">
                                      <Chip>
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: SIM.mint, color: SIM.bg }}><Flag className="h-3.5 w-3.5" /></span>
                                        <div className="leading-tight">
                                          <p className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: SIM.faint }}>Término</p>
                                          <p className="text-[13px] font-bold tabular-nums">{fmtHora(ultimoDia.termino)}</p>
                                          <p className="text-[9.5px]" style={{ color: SIM.faint }}>+{plano.margem_min} min de margem</p>
                                        </div>
                                      </Chip>
                                    </motion.div>
                                  </>
                                )}
                              </>
                            )}
                          </div>

                          {/* fora da rota */}
                          {removidas.length > 0 && plano && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span style={{ color: SIM.faint }}>Fora da rota:</span>
                              {removidas.map((id) => (
                                <button key={id} type="button" onClick={() => restaurar(id)} title="Restaurar na rota" className="flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition hover:bg-white/10" style={{ background: SIM.tile, border: `1px solid ${SIM.borderSoft}`, color: SIM.soft }}>
                                  <RotateCcw className="h-3 w-3" style={{ color: SIM.accent }} />
                                  <span className="max-w-[160px] truncate line-through">{paradaPorId.get(id)?.equipamento ?? id}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* veredito · totais · ações */}
                    <div className="mx-4 mt-3 flex flex-wrap items-center gap-4 border-t pb-4 pt-3" style={{ borderColor: SIM.borderSoft }}>
                      <div className="min-w-[280px] flex-1">
                        <AnimatePresence mode="wait">
                          {concluido && plano && ultimoDia ? (
                            <motion.div key="veredito" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: dias.length === 1 ? SIM.mint : SIM.amber }}>
                                {dias.length > 1 && <Moon className="h-3 w-3" />}
                                {dias.length === 1
                                  ? "Cabe em um dia"
                                  : `Não cabe em um dia · ${dias.length} dias`}
                              </p>
                              {/* baseline + nowrap: a frase nunca mais quebra no meio nem
                                  joga o horário grande sozinho pra próxima linha. */}
                              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[14px] font-semibold leading-none">
                                <span className="whitespace-nowrap" style={{ color: SIM.soft }}>{primeiroNome} termina</span>
                                <span className="whitespace-nowrap">{fmtDia(ultimoDia.dia)} às</span>
                                <span className="text-[30px] font-bold tabular-nums tracking-tight" style={{ color: SIM.mint, textShadow: "0 0 24px rgba(94,255,217,0.35)" }}>{fmtHora(ultimoDia.termino)}</span>
                              </p>
                              <p className="mt-1.5 text-[10px]" style={{ color: SIM.faint }}>
                                início {plano.hora_inicio} · almoço 1h · margem {plano.margem_min} min · {plano.sla_min} min por vistoria
                                {chuvaNoDia && <span style={{ color: "#FCA5A5" }}> · risco de chuva no percurso</span>}
                              </p>
                            </motion.div>
                          ) : (
                            <motion.div key="montando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -6 }}>
                              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: SIM.faint }}>{replanejando ? "Replanejando" : `Montando o roteiro de ${primeiroNome || "—"}`}</p>
                              <div className="mt-2 h-1.5 w-full max-w-[320px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                                <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${SIM.brand}, ${SIM.mint})` }} animate={{ width: `${n > 0 ? Math.max(6, (legs.length / n) * 100) : 6}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
                              </div>
                              <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px]" style={{ color: SIM.faint }}><Timer className="h-3 w-3" /> Média de {plano?.sla_min ?? "—"} min por vistoria — histórico do próprio técnico.</p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        <Stat valor={kmTxt} label="percurso" dim={!concluido} />
                        <Stat valor={fmtMin(rotaAnim)} label="em rota" dim={!concluido} />
                        <Stat valor={fmtMin(vistoriaAnim)} label="em vistoria" dim={!concluido} />
                        <Stat valor={String(Math.max(dias.length, plano ? 1 : 0))} label={dias.length === 1 ? "dia" : "dias"} dim={!concluido} />
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        {erro && <p className="text-[11px] font-medium" style={{ color: SIM.danger }}>{erro}</p>}
                        <button
                          type="button"
                          onClick={() => onConfirmar(ordem)}
                          disabled={!podeConfirmar}
                          className="flex h-12 min-w-[250px] items-center justify-center gap-2 rounded-2xl px-5 text-[13.5px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                          style={{ background: `linear-gradient(135deg, ${SIM.brand}, ${SIM.brandDeep})`, boxShadow: podeConfirmar ? "0 10px 30px rgba(0,179,136,0.4)" : "none" }}
                        >
                          {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          {confirmando ? "Gravando…" : concluido ? `Confirmar ${n} vistoria${n !== 1 ? "s" : ""}${dias.length > 1 ? ` em ${dias.length} dias` : ""}` : "Montando…"}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── linha do tempo ─────────────────────────────────────────────────────── */

interface BlocoParada {
  id: number;
  ordem: number;
  equipamento: string;
  chegada: Date;
  saida: Date;
  almocoAntes: boolean;
  legKm: number;
  legMin: number;
}

interface Eixo {
  ini: number;
  fim: number;
  max: number;
  span: number;
}

const GRID_LINHA = "104px 1fr 74px";

/** Régua de horas — compartilhada por todos os dias, senão as barras não seriam comparáveis. */
function EixoHoras({ eixo }: { eixo: Eixo }) {
  const horas: number[] = [];
  for (let h = Math.ceil(eixo.ini / 60); h * 60 <= eixo.max; h++) horas.push(h);
  return (
    <div className="mb-1 grid items-end gap-3" style={{ gridTemplateColumns: GRID_LINHA }}>
      <span />
      <div className="relative h-3">
        {horas.map((h) => {
          const pct = ((h * 60 - eixo.ini) / eixo.span) * 100;
          const rotulada = h % 2 === 0;
          return (
            <span key={h} className="absolute bottom-0 -translate-x-1/2 text-[9px] tabular-nums" style={{ left: `${pct}%`, color: rotulada ? SIM.faint : "transparent" }}>
              {String(h).padStart(2, "0")}h
            </span>
          );
        })}
      </div>
      <span />
    </div>
  );
}

function RibbonDia({
  dia,
  cor,
  termino,
  blocos,
  eixo,
  expediente,
  slaMin,
  margemMin,
  climaPorId,
  hoverId,
  selId,
  onHover,
  onSelect,
  onRemover,
  onMover,
  onFocar,
  podeMoverAntes,
  podeMoverDepois,
}: {
  dia: string;
  cor: string;
  termino: Date;
  blocos: BlocoParada[];
  eixo: Eixo;
  expediente: { inicio: string; fim: string };
  slaMin: number;
  margemMin: number;
  climaPorId: Map<number, { pct: number | null; alerta: boolean }>;
  hoverId: number | null;
  selId: number | null;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
  onRemover: (id: number) => void;
  onMover: (id: number, delta: -1 | 1) => void;
  onFocar: (id: number) => void;
  podeMoverAntes: (id: number) => boolean;
  podeMoverDepois: (id: number) => boolean;
}) {
  const pct = (min: number) => ((min - eixo.ini) / eixo.span) * 100;
  const minTermino = minNoDia(termino, dia);
  const minFimExp = eixo.fim;
  const estourou = minTermino > minFimExp + 0.5;
  const ultimaSaida = blocos.length ? minNoDia(blocos[blocos.length - 1].saida, dia) : eixo.ini;
  const almoco = blocos.some((b) => b.almocoAntes);
  const destacado = blocos.find((b) => b.id === selId) ?? blocos.find((b) => b.id === hoverId) ?? null;
  const clima = destacado ? climaPorId.get(destacado.id) : undefined;

  return (
    <div className="grid items-center gap-3" style={{ gridTemplateColumns: GRID_LINHA }}>
      {/* etiqueta do dia */}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[12px] font-bold">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor, boxShadow: `0 0 10px ${cor}` }} />
          {fmtDia(dia)}
        </p>
        <p className="text-[9.5px] tabular-nums" style={{ color: SIM.faint }}>
          {blocos.length} parada{blocos.length !== 1 ? "s" : ""} · {slaMin} min cada
        </p>
      </div>

      {/* trilho */}
      <div
        className="relative h-9 rounded-lg"
        style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${SIM.borderSoft}` }}
        onMouseLeave={() => onHover(null)}
      >
        {/* almoço */}
        {almoco && (
          <div
            className="absolute inset-y-1 rounded-[3px]"
            title="Almoço 12:00–13:00"
            style={{ left: `${pct(12 * 60)}%`, width: `${pct(13 * 60) - pct(12 * 60)}%`, background: "rgba(244,180,0,0.22)", border: "1px solid rgba(244,180,0,0.45)" }}
          />
        )}

        {/* margem de segurança depois da última parada */}
        {blocos.length > 0 && (
          <div
            className="absolute inset-y-[10px] rounded-[2px]"
            title={`Margem de ${margemMin} min`}
            style={{
              left: `${pct(ultimaSaida)}%`,
              width: `${Math.max(0.4, pct(minTermino) - pct(ultimaSaida))}%`,
              background: `repeating-linear-gradient(115deg, ${cor}55 0 4px, transparent 4px 8px)`,
            }}
          />
        )}

        {/* limite do expediente — só aparece quando a margem passa dele */}
        {estourou && (
          <div className="absolute inset-y-0 w-px" style={{ left: `${pct(minFimExp)}%`, background: SIM.danger, boxShadow: `0 0 8px ${SIM.danger}` }}>
            <span className="absolute -top-0.5 left-1 whitespace-nowrap text-[8.5px] font-bold" style={{ color: SIM.danger }}>{expediente.fim}</span>
          </div>
        )}

        {/* paradas */}
        {blocos.map((b) => {
          const ini = minNoDia(b.chegada, dia);
          const fim = minNoDia(b.saida, dia);
          const alerta = climaPorId.get(b.id)?.alerta;
          const ativo = b.id === hoverId || b.id === selId;
          return (
            <button
              key={b.id}
              type="button"
              className="sim-bloco"
              data-sel={b.id === selId ? "1" : "0"}
              onMouseEnter={() => onHover(b.id)}
              onFocus={() => onHover(b.id)}
              onClick={() => onSelect(b.id)}
              aria-label={`${b.ordem} · ${b.equipamento}`}
              style={{
                left: `${pct(ini)}%`,
                width: `${Math.max(0.55, pct(fim) - pct(ini))}%`,
                minWidth: 3,
                background: alerta ? SIM.danger : cor,
                color: alerta ? SIM.danger : cor,
                opacity: ativo ? 1 : 0.85,
              }}
            />
          );
        })}

        {/* cartão da parada em foco */}
        <AnimatePresence>
          {destacado && (
            <motion.div
              key={destacado.id}
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.14 }}
              className="absolute bottom-[calc(100%+8px)] z-20 w-[236px] -translate-x-1/2 rounded-xl p-2.5"
              style={{
                left: `${Math.min(92, Math.max(8, pct(minNoDia(destacado.chegada, dia))))}%`,
                background: SIM.panelSolid,
                border: `1px solid ${cor}66`,
                boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
                pointerEvents: destacado.id === selId ? "auto" : "none",
              }}
            >
              <div className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}>{destacado.ordem}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold">{destacado.equipamento}</p>
                  <p className="text-[11.5px] font-bold tabular-nums" style={{ color: SIM.mint }}>
                    {fmtHora(destacado.chegada)} <span className="font-medium" style={{ color: SIM.faint }}>→</span> {fmtHora(destacado.saida)}
                  </p>
                  <p className="text-[9.5px] tabular-nums" style={{ color: SIM.soft }}>
                    {destacado.ordem === 1 ? "abre o dia" : `+${fmtKm(destacado.legKm)} km · ${fmtMin(destacado.legMin)}`}
                    {clima?.alerta && <span style={{ color: "#FCA5A5" }}> · chuva {clima.pct}%</span>}
                  </p>
                </div>
              </div>
              {destacado.id === selId && (
                <div className="mt-2 flex items-center gap-1 border-t pt-2" style={{ borderColor: SIM.borderSoft }}>
                  <AcaoMini titulo="Focar no mapa" onClick={() => onFocar(destacado.id)}><Crosshair className="h-3 w-3" /></AcaoMini>
                  <AcaoMini titulo="Mover antes" onClick={() => onMover(destacado.id, -1)} desabilitado={!podeMoverAntes(destacado.id)}><ChevronLeft className="h-3 w-3" /></AcaoMini>
                  <AcaoMini titulo="Mover depois" onClick={() => onMover(destacado.id, 1)} desabilitado={!podeMoverDepois(destacado.id)}><ChevronRight className="h-3 w-3" /></AcaoMini>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => onRemover(destacado.id)}
                    className="flex h-6 items-center gap-1 rounded-md px-2 text-[10.5px] font-bold transition hover:bg-white/10"
                    style={{ color: SIM.danger }}
                  >
                    <X className="h-3 w-3" /> Tirar da rota
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* término do dia */}
      <div className="text-right">
        <p className="text-[13px] font-bold tabular-nums" style={{ color: estourou ? SIM.amber : SIM.text }}>{fmtHora(termino)}</p>
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: SIM.faint }}>término</p>
      </div>
    </div>
  );
}

function AcaoMini({ children, titulo, onClick, desabilitado }: { children: React.ReactNode; titulo: string; onClick: () => void; desabilitado?: boolean }) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      disabled={desabilitado}
      className="flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-white/10 disabled:opacity-25"
      style={{ color: SIM.soft }}
    >
      {children}
    </button>
  );
}

function Chip({ children, dim, amber, alerta, cor, titulo }: { children: React.ReactNode; dim?: boolean; amber?: boolean; alerta?: boolean; cor?: string; titulo?: string }) {
  return (
    <div
      title={titulo}
      className="flex shrink-0 items-center gap-2.5 rounded-2xl px-3 py-2"
      style={{
        background: amber ? "rgba(244,180,0,0.1)" : SIM.tile,
        border: `1px solid ${amber ? "rgba(244,180,0,0.3)" : alerta ? "rgba(248,113,113,0.4)" : dim ? SIM.borderSoft : cor ? `${cor}55` : SIM.border}`,
        opacity: dim ? 0.7 : 1,
      }}
    >
      {children}
    </div>
  );
}

function Seta({ ativa, cor }: { ativa?: boolean; cor?: string }) {
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      <span className="h-[2px] w-4 rounded-full" style={{ background: ativa ? cor ?? SIM.accent : SIM.borderSoft }} />
    </span>
  );
}

function EtapaIcone({ estado }: { estado: Etapa }) {
  if (estado === "ok") {
    return <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "rgba(0,212,160,0.18)", color: SIM.mint }}><Check className="h-3 w-3" strokeWidth={3} /></span>;
  }
  if (estado === "falhou") {
    return <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "rgba(248,113,113,0.15)", color: SIM.danger }}>!</span>;
  }
  if (estado === "ativa") {
    return <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "rgba(0,212,160,0.12)" }}><Loader2 className="h-3 w-3 animate-spin" style={{ color: SIM.accent }} /></span>;
  }
  return <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}><MapPin className="h-2.5 w-2.5" style={{ color: SIM.faint }} /></span>;
}

function Stat({ valor, label, dim }: { valor: string; label: string; dim?: boolean }) {
  return (
    <div className="min-w-[88px] rounded-xl px-3 py-2 text-center" style={{ background: "rgba(255,255,255,0.045)", border: `1px solid ${SIM.borderSoft}` }}>
      <p className="text-[14px] font-bold tabular-nums" style={{ color: dim ? SIM.soft : SIM.text }}>{valor}</p>
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: SIM.faint }}>{label}</p>
    </div>
  );
}
