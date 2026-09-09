"use client";

/**
 * SimulacaoDiaOverlay — o "agendar" deixa de ser um salvar seco e vira uma
 * simulação do dia do técnico montando na frente do analista.
 *
 * O servidor devolve só o esqueleto (/preview/plano: ordem, origem, SLA do
 * técnico, hora de início) em milissegundos. Daí o NAVEGADOR traça cada
 * perna na Mapbox Directions e desenha a linha crescendo no mapa conforme
 * a resposta chega — com o MESMO veículo 3D da tela de deslocamento
 * (TechModel3DLayer) andando na ponta da linha; cada parada ganha horário
 * na timeline naquele instante; o almoço entra como bloco próprio; no fim,
 * o veredito ("Fulano termina às 16:40"). O /preview completo (rotas +
 * clima) roda em paralelo e só acrescenta o risco de chuva por parada — os
 * horários vêm da MESMA função pura que o servidor usa ao gravar
 * (roteirizacaoHorarios.ts), então o que o analista vê é o que vai pro banco.
 *
 * Layout: o mapa é o protagonista (tela cheia, inclinado, prédios 3D);
 * cabeçalho e etapas centralizados no topo, e um dock centralizado embaixo
 * com a timeline horizontal 1→2→3 e o veredito. Nada espremido no canto.
 */

import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Calendar, Check, CloudRain, Flag, Loader2, MapPin, Route, Timer, UtensilsCrossed } from "lucide-react";
import { MAP_STYLE_DARK, getMapboxToken } from "@/services/maps";
import type { AgendamentoPlano, AgendamentoPreviewResponse } from "@/services/painel";
import { TechModel3DLayer, type TechEntrySpec } from "@/app/painel/mapa/techModel3DLayer";
import type { RouteResult } from "@/app/painel/mapa/routeService";
import { acumularHorarios, almocoDoDia, calcularTermino, type PernaCalculada } from "@/lib/roteirizacaoHorarios";

/* ─── paleta própria da simulação — mundo escuro deliberado, único tema ───── */
const SIM = {
  bg: "#04151A",
  glass: "rgba(5,24,28,0.82)",
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

if (typeof document !== "undefined" && !document.getElementById("vm-sim-style")) {
  const s = document.createElement("style");
  s.id = "vm-sim-style";
  s.textContent = `
    @keyframes simPop{0%{transform:scale(.55);opacity:.5}55%{transform:scale(1.25)}100%{transform:scale(1);opacity:1}}
    @keyframes simRing{0%{box-shadow:0 0 0 0 rgba(0,212,160,.65),0 4px 14px rgba(0,0,0,.45)}100%{box-shadow:0 0 0 18px rgba(0,212,160,0),0 4px 14px rgba(0,0,0,.45)}}
    .sim-pin{width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center;
      font:800 12px/1 ui-sans-serif,system-ui;color:#fff;background:linear-gradient(145deg,#00B388,#00875F);
      border:2.5px solid rgba(255,255,255,.9);box-shadow:0 4px 14px rgba(0,0,0,.45);opacity:.55;transform:scale(.88);
      transition:opacity .35s ease,transform .35s ease,filter .35s ease;filter:saturate(.35)}
    .sim-pin[data-on="1"]{opacity:1;transform:scale(1);filter:none;animation:simPop .55s cubic-bezier(.22,.7,.2,1) both,simRing 1.1s ease-out .1s 1}
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
    out.push([
      coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
      coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
    ]);
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
    return {
      distanciaM: Math.round(route.distance),
      duracaoMin: route.duration / 60,
      coords: route.geometry.coordinates as Coord[],
      estimado: false,
    };
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
function fmtData(iso: string): string {
  return new Date(`${iso}T12:00:00-03:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: TZ });
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
const lineFC = (linhas: Coord[][]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: linhas
    .filter((l) => l.length >= 2)
    .map((l) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: l } })),
});

/** Mesma linha "estilo Waze" da tela de deslocamento (glow + traço em #00D4A0). */
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
      paint: { "line-color": SIM.accent, "line-width": 10, "line-blur": 6, "line-opacity": opacity },
    });
  const line = (id: string, src: string, width: number) =>
    map.addLayer({
      id,
      type: "line",
      source: src,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": SIM.accent, "line-width": width, "line-opacity": 0.92 },
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
  onConfirmar: () => void;
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
}: SimulacaoDiaOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const layer3dRef = useRef<TechModel3DLayer | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const pinElsRef = useRef<HTMLDivElement[]>([]);
  const feitasRef = useRef<Coord[][]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [rotasResolvidas, setRotasResolvidas] = useState(0);
  const [concluido, setConcluido] = useState(false);

  /* mapa: nasce quando abre, morre quando fecha */
  useEffect(() => {
    if (!open || !containerRef.current) return;
    mapboxgl.accessToken = getMapboxToken();
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE_DARK,
      center: plano?.origem ? [plano.origem.lng, plano.origem.lat] : [-47.0608, -22.9056],
      zoom: 10,
      pitch: 48,
      bearing: -16,
      attributionControl: false,
      antialias: true, // a camada 3D (Three.js) precisa disso pra não serrilhar
    });
    // CustomLayerInterface só funciona certo em mercator — o estilo escuro do
    // v3 nasce em "globe".
    map.setProjection("mercator");
    mapRef.current = map;
    map.on("load", () => {
      map.setProjection("mercator");
      map.resize();
      montarPredios(map);
      montarCamadas(map);
      const l3d = new TechModel3DLayer();
      map.addLayer(l3d);
      layer3dRef.current = l3d;
      setMapReady(true);
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      pinElsRef.current = [];
      feitasRef.current = [];
      layer3dRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
      setLegs([]);
      setRotasResolvidas(0);
      setConcluido(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* simulação: pins → pernas em paralelo → revela em ordem, desenhando com o carro na ponta */
  useEffect(() => {
    const map = mapRef.current;
    if (!open || !mapReady || !map || !plano || !tecnico) return;
    let cancelado = false;
    let rafCancel: (() => void) | null = null;
    const reduzir = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // pins numerados (apagados até a rota chegar neles)
    pinElsRef.current = plano.paradas.map((p) => {
      const el = document.createElement("div");
      el.className = "sim-pin";
      el.dataset.on = "0";
      el.textContent = String(p.ordem);
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
      return el;
    });

    // veículo/beacon 3D — mesmo da tela de deslocamento
    const usersId = Number(tecnico.id) || 1;
    const spec = (lng: number, lat: number, route: RouteResult | null, speedKmh: number | null): TechEntrySpec => ({
      usersId,
      nome: tecnico.nome,
      lng,
      lat,
      speedKmh,
      corHex: SIM.accent,
      route,
      paradoDesdeMin: null,
    });
    const l3d = () => layer3dRef.current;
    l3d()?.syncEntries([spec(plano.origem.lng, plano.origem.lat, null, 0)]);

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([plano.origem.lng, plano.origem.lat]);
    plano.paradas.forEach((p) => bounds.extend([p.lng, p.lat]));
    const alturaDock = Math.min(330, Math.round(window.innerHeight * 0.42));
    const padding = { top: 150, bottom: alturaDock, left: 80, right: 80 };
    map.fitBounds(bounds, { padding, maxZoom: 15, pitch: reduzir ? 0 : 48, bearing: reduzir ? 0 : -16, duration: reduzir ? 0 : 1100 });

    // todas as pernas saem juntas; a revelação respeita a ordem
    const pontos: LatLng[] = [plano.origem, ...plano.paradas.map((p) => ({ lat: p.lat, lng: p.lng }))];
    const promessas = plano.paradas.map((_, i) =>
      buscarPerna(pontos[i], pontos[i + 1]).then((leg) => {
        if (!cancelado) setRotasResolvidas((n) => n + 1);
        return leg;
      })
    );

    const srcDone = () => map.getSource(SRC_DONE) as GeoJSONSource | undefined;
    const srcActive = () => map.getSource(SRC_ACTIVE) as GeoJSONSource | undefined;

    const desenhar = (coords: Coord[], ms: number) =>
      new Promise<void>((resolve) => {
        const acc = cumulativo(coords);
        const total = acc[acc.length - 1];
        const fim = coords[coords.length - 1];
        if (ms <= 0 || total === 0 || coords.length < 2) {
          srcActive()?.setData(lineFC([coords]));
          resolve();
          return;
        }
        // Mesmo objeto de rota em todos os frames — a camada 3D usa a
        // identidade pra saber que é a mesma perna e manter o progresso
        // monotônico (o carro nunca anda de ré).
        const route: RouteResult = { coordinates: coords, distanceM: total, fetchedAt: performance.now(), destLng: fim[0], destLat: fim[1] };
        const speedKmh = (total / 1000) / (ms / 3_600_000);
        const t0 = performance.now();
        let raf = 0;
        const step = (t: number) => {
          if (cancelado) return;
          const p = Math.min(1, (t - t0) / ms);
          const e = 1 - Math.pow(1 - p, 3);
          const parte = trechoParcial(coords, acc, e * total);
          const ponta = parte[parte.length - 1];
          srcActive()?.setData(lineFC([parte]));
          l3d()?.syncEntries([spec(ponta[0], ponta[1], route, speedKmh)]);
          if (p < 1) raf = requestAnimationFrame(step);
          else resolve();
        };
        raf = requestAnimationFrame(step);
        rafCancel = () => cancelAnimationFrame(raf);
      });

    const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, reduzir ? 0 : ms));

    (async () => {
      await dormir(800); // deixa a câmera assentar antes da primeira linha
      for (let i = 0; i < plano.paradas.length; i++) {
        const leg = await promessas[i];
        if (cancelado) return;
        const destino = plano.paradas[i];
        const ms = reduzir ? 0 : Math.min(1500, Math.max(500, leg.distanciaM / 30));
        await desenhar(leg.coords, ms);
        if (cancelado) return;
        feitasRef.current.push(leg.coords);
        srcDone()?.setData(lineFC(feitasRef.current));
        srcActive()?.setData(EMPTY_FC);
        // chegou: vira beacon (parado) na parada — recria a entrada pra não
        // herdar o tween de posição antiga do carro.
        l3d()?.syncEntries([]);
        l3d()?.syncEntries([spec(destino.lng, destino.lat, null, 0)]);
        pinElsRef.current[i]?.setAttribute("data-on", "1");
        setLegs((prev) => [...prev, leg]);
        await dormir(260);
      }
      if (cancelado) return;
      setConcluido(true);
      map.fitBounds(bounds, { padding, maxZoom: 15, pitch: reduzir ? 0 : 52, bearing: reduzir ? 0 : -24, duration: reduzir ? 0 : 1800 });
    })();

    return () => {
      cancelado = true;
      rafCancel?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mapReady, plano, tecnico]);

  /* a faixa da timeline acompanha a última parada revelada */
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [legs.length, concluido]);

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

  /* horários — a MESMA função pura do servidor */
  const horaInicio = useMemo(() => (plano ? new Date(`${plano.data_agendada}T${plano.hora_inicio}:00-03:00`) : null), [plano]);
  const almocoEm = useMemo(() => (plano ? almocoDoDia(plano.data_agendada) : null), [plano]);
  const horarios = useMemo(
    () => (plano && horaInicio && almocoEm ? acumularHorarios(horaInicio, plano.sla_min, legs, almocoEm) : []),
    [plano, horaInicio, almocoEm, legs]
  );
  const termino = useMemo(() => (concluido && almocoEm ? calcularTermino(horarios, almocoEm) : null), [concluido, horarios, almocoEm]);
  const almocoFim = useMemo(
    () => (almocoEm && plano ? new Date(almocoEm.getTime() + plano.almoco.duracao_min * 60000) : null),
    [almocoEm, plano]
  );

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
  const chuvaNoDia = previewFinal?.itens.some((it) => it.risco_chuva_alerta) ?? false;

  const n = plano?.paradas.length ?? 0;
  const etapas: Array<{ key: string; label: string; detalhe?: string; estado: Etapa }> = [
    { key: "ordem", label: "Ordenando paradas", estado: plano ? "ok" : planoErro ? "falhou" : "ativa" },
    {
      key: "rotas",
      label: "Traçando rotas",
      detalhe: plano ? `${Math.min(rotasResolvidas, n)}/${n}` : undefined,
      estado: !plano ? "pendente" : rotasResolvidas >= n ? "ok" : "ativa",
    },
    {
      key: "horarios",
      label: "Estimando horários",
      detalhe: plano ? `${legs.length}/${n}` : undefined,
      estado: !plano ? "pendente" : concluido ? "ok" : legs.length > 0 ? "ativa" : "pendente",
    },
    {
      key: "clima",
      label: "Conferindo clima",
      detalhe: climaErro ? "indisponível" : previewFinal ? (chuvaNoDia ? "chuva no percurso" : "sem alerta") : undefined,
      estado: !plano ? "pendente" : previewFinal ? "ok" : climaErro ? "falhou" : "ativa",
    },
  ];

  const primeiroNome = tecnico?.nome.split(" ")[0] ?? "";
  const podeConfirmar = concluido && !confirmando && !!plano;
  const kmTxt = `${kmAnim.toFixed(1).replace(".", ",")} km`;

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
          <div ref={containerRef} className="absolute inset-0" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(4,21,26,0.72) 0%, rgba(4,21,26,0) 26%), linear-gradient(0deg, rgba(4,21,26,0.78) 0%, rgba(4,21,26,0) 38%)",
            }}
          />

          {/* voltar */}
          <motion.button
            type="button"
            onClick={onVoltar}
            disabled={confirmando}
            className="absolute left-6 top-6 flex h-10 items-center gap-2 rounded-full px-4 text-[12.5px] font-semibold backdrop-blur-md transition hover:bg-white/10 disabled:opacity-40"
            style={{ background: SIM.glass, border: `1px solid ${SIM.borderSoft}`, color: SIM.soft }}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </motion.button>

          {/* topo central: técnico + data + etapas */}
          <div className="pointer-events-none absolute inset-x-0 top-6 flex flex-col items-center gap-3 px-24">
            <motion.div
              className="pointer-events-auto flex items-center gap-3 rounded-full py-2 pl-2 pr-5 backdrop-blur-md"
              style={{ background: SIM.glass, border: `1px solid ${SIM.border}`, boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: "linear-gradient(145deg,#00B388,#00875F)", boxShadow: "0 4px 14px rgba(0,179,136,0.4)" }}
              >
                {tecnico ? iniciais(tecnico.nome) : "—"}
              </span>
              <div className="leading-tight">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: SIM.faint }}>
                  Simulação do dia
                </p>
                <p className="text-[14px] font-semibold">
                  {tecnico?.nome ?? "—"}
                  <span className="mx-2" style={{ color: SIM.faint }}>·</span>
                  <span className="inline-flex items-center gap-1.5" style={{ color: SIM.soft }}>
                    <Calendar className="h-3.5 w-3.5" /> {fmtData(dataAgendada)}
                  </span>
                  {plano && (
                    <>
                      <span className="mx-2" style={{ color: SIM.faint }}>·</span>
                      <span style={{ color: SIM.soft }}>{n} parada{n !== 1 ? "s" : ""}</span>
                    </>
                  )}
                </p>
              </div>
            </motion.div>

            <motion.div
              className="pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1.5 backdrop-blur-md"
              style={{ background: SIM.glass, border: `1px solid ${SIM.borderSoft}` }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              {etapas.map((et, i) => (
                <div key={et.key} className="flex items-center">
                  {i > 0 && <span className="mx-1 h-px w-5" style={{ background: SIM.borderSoft }} />}
                  <div className="flex items-center gap-2 rounded-full px-2 py-1" style={{ opacity: et.estado === "pendente" ? 0.45 : 1 }}>
                    <EtapaIcone estado={et.estado} />
                    <span className="text-[12px] font-semibold" style={{ color: et.estado === "pendente" ? SIM.faint : SIM.text }}>
                      {et.label}
                    </span>
                    {et.detalhe && (
                      <span className="text-[10.5px] font-semibold tabular-nums" style={{ color: et.estado === "falhou" ? SIM.danger : SIM.mint }}>
                        {et.detalhe}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* dock inferior central */}
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-6">
            <motion.div
              className="pointer-events-auto w-full max-w-[1060px] rounded-[26px] p-4 backdrop-blur-xl"
              style={{ background: SIM.glass, border: `1px solid ${SIM.border}`, boxShadow: "0 24px 70px rgba(0,0,0,0.5)" }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.15 }}
            >
              {planoErro ? (
                <div className="rounded-2xl px-4 py-3 text-[12.5px]" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
                  {planoErro}
                </div>
              ) : (
                <>
                  {plano && plano.ignorados_sem_coordenada.length > 0 && (
                    <p className="mb-3 rounded-xl px-3 py-1.5 text-[11px]" style={{ background: "rgba(244,180,0,0.1)", color: "#FDE68A", border: "1px solid rgba(244,180,0,0.25)" }}>
                      {plano.ignorados_sem_coordenada.length} equipamento(s) sem coordenada ficaram fora do roteiro.
                    </p>
                  )}

                  {/* timeline horizontal 1 → 2 → 3 */}
                  <div ref={stripRef} className="sim-strip flex items-stretch gap-2 overflow-x-auto pb-2">
                    {plano ? (
                      <>
                        <Chip>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold" style={{ background: SIM.mint, color: SIM.bg }}>
                            {tecnico ? iniciais(tecnico.nome) : "—"}
                          </span>
                          <div className="leading-tight">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: SIM.faint }}>Saída</p>
                            <p className="text-[13px] font-bold tabular-nums">{plano.hora_inicio}</p>
                          </div>
                        </Chip>

                        {plano.paradas.map((p, i) => {
                          const revelada = i < legs.length;
                          const h = horarios[i];
                          const leg = legs[i];
                          const clima = climaPorId.get(p.vistoria_id);
                          return (
                            <div key={p.vistoria_id} className="flex items-stretch gap-2">
                              {revelada && h?.almocoAntes && almocoEm && almocoFim && (
                                <>
                                  <Seta />
                                  <Chip amber>
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: SIM.amber, color: "#1C222B" }}>
                                      <UtensilsCrossed className="h-3.5 w-3.5" />
                                    </span>
                                    <div className="leading-tight">
                                      <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#FDE68A" }}>Almoço</p>
                                      <p className="text-[12.5px] font-bold tabular-nums" style={{ color: "#FDE68A" }}>{fmtHora(almocoEm)}–{fmtHora(almocoFim)}</p>
                                    </div>
                                  </Chip>
                                </>
                              )}
                              <Seta ativa={revelada} />
                              {revelada && h && leg ? (
                                <motion.div
                                  initial={{ opacity: 0, x: 14, scale: 0.96 }}
                                  animate={{ opacity: 1, x: 0, scale: 1 }}
                                  transition={{ type: "spring", stiffness: 280, damping: 24 }}
                                  className="flex"
                                >
                                  <Chip alerta={!!clima?.alerta}>
                                    <span
                                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                                      style={{ background: "linear-gradient(145deg,#00B388,#00875F)", boxShadow: "0 0 0 4px rgba(0,212,160,0.18)" }}
                                    >
                                      {p.ordem}
                                    </span>
                                    <div className="min-w-0 leading-tight">
                                      <p className="max-w-[150px] truncate text-[12px] font-semibold">{p.equipamento}</p>
                                      <p className="text-[12.5px] font-bold tabular-nums" style={{ color: SIM.mint }}>
                                        {fmtHora(h.chegada)} <span className="font-medium" style={{ color: SIM.faint }}>→</span> {fmtHora(h.saida)}
                                      </p>
                                      <p className="flex items-center gap-1 text-[10px] tabular-nums" style={{ color: SIM.soft }}>
                                        <Route className="h-2.5 w-2.5" style={{ color: SIM.faint }} />
                                        +{fmtKm(leg.distanciaM)} km · {fmtMin(leg.duracaoMin)}
                                        {clima?.alerta && (
                                          <span className="ml-1 inline-flex items-center gap-0.5 font-semibold" style={{ color: "#FCA5A5" }}>
                                            <CloudRain className="h-2.5 w-2.5" /> {clima.pct}%
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                  </Chip>
                                </motion.div>
                              ) : (
                                <Chip dim>
                                  <span
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                                    style={{ background: "rgba(255,255,255,0.06)", border: `1px dashed ${SIM.border}`, color: SIM.faint }}
                                  >
                                    {p.ordem}
                                  </span>
                                  <div className="leading-tight">
                                    <p className="max-w-[120px] truncate text-[11.5px] font-medium" style={{ color: SIM.faint }}>{p.equipamento}</p>
                                    <p className="flex items-center gap-1 text-[10px]" style={{ color: SIM.faint }}>
                                      {i === legs.length && !concluido ? (
                                        <>
                                          <Loader2 className="h-2.5 w-2.5 animate-spin" style={{ color: SIM.accent }} /> traçando…
                                        </>
                                      ) : (
                                        "aguardando"
                                      )}
                                    </p>
                                  </div>
                                </Chip>
                              )}
                            </div>
                          );
                        })}

                        {termino && (
                          <>
                            <Seta ativa />
                            <motion.div initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.1 }} className="flex">
                              <Chip>
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: SIM.mint, color: SIM.bg }}>
                                  <Flag className="h-3.5 w-3.5" />
                                </span>
                                <div className="leading-tight">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: SIM.faint }}>Término</p>
                                  <p className="text-[13px] font-bold tabular-nums">{fmtHora(termino)}</p>
                                  <p className="text-[9.5px]" style={{ color: SIM.faint }}>+{plano.margem_min} min de margem</p>
                                </div>
                              </Chip>
                            </motion.div>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="flex h-[60px] w-full items-center justify-center gap-2 text-[12px]" style={{ color: SIM.soft }}>
                        <Loader2 className="h-4 w-4 animate-spin" style={{ color: SIM.accent }} /> Ordenando as paradas pela posição do técnico…
                      </div>
                    )}
                  </div>

                  {/* veredito · totais · ações */}
                  <div className="mt-3 flex flex-wrap items-center gap-4 border-t pt-3" style={{ borderColor: SIM.borderSoft }}>
                    <div className="min-w-[260px] flex-1">
                      <AnimatePresence mode="wait">
                        {termino && plano ? (
                          <motion.div key="veredito" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <p className="text-[11px] leading-snug" style={{ color: SIM.soft }}>
                              Considerando início às <b style={{ color: SIM.text }}>{plano.hora_inicio}</b>, almoço de{" "}
                              <b style={{ color: SIM.text }}>{plano.almoco.duracao_min / 60}h</b> e margem de{" "}
                              <b style={{ color: SIM.text }}>{plano.margem_min} min</b>,
                            </p>
                            <p className="mt-0.5 text-[15px] font-semibold leading-tight">
                              {primeiroNome} termina às{" "}
                              <span className="text-[28px] font-bold tabular-nums tracking-tight" style={{ color: SIM.mint, textShadow: "0 0 24px rgba(94,255,217,0.35)" }}>
                                {fmtHora(termino)}
                              </span>
                            </p>
                            {chuvaNoDia && (
                              <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "#FCA5A5" }}>
                                <CloudRain className="h-3.5 w-3.5" /> Risco de chuva em parte do percurso
                              </p>
                            )}
                          </motion.div>
                        ) : (
                          <motion.div key="montando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -6 }}>
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: SIM.faint }}>
                              Montando o dia de {primeiroNome || "—"}
                            </p>
                            <div className="mt-2 h-1.5 w-full max-w-[320px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                              <motion.div
                                className="h-full rounded-full"
                                style={{ background: `linear-gradient(90deg, ${SIM.brand}, ${SIM.mint})` }}
                                animate={{ width: `${n > 0 ? Math.max(6, (legs.length / n) * 100) : 6}%` }}
                                transition={{ type: "spring", stiffness: 120, damping: 20 }}
                              />
                            </div>
                            <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px]" style={{ color: SIM.faint }}>
                              <Timer className="h-3 w-3" /> Média de {plano?.sla_min ?? "—"} min por vistoria — histórico do próprio técnico.
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Stat valor={kmTxt} label="percurso" dim={!termino} />
                      <Stat valor={fmtMin(rotaAnim)} label="em rota" dim={!termino} />
                      <Stat valor={fmtMin(vistoriaAnim)} label="em vistoria" dim={!termino} />
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      {erro && (
                        <p className="text-[11px] font-medium" style={{ color: SIM.danger }}>
                          {erro}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={onConfirmar}
                        disabled={!podeConfirmar}
                        className="flex h-12 min-w-[230px] items-center justify-center gap-2 rounded-2xl px-5 text-[13.5px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                        style={{
                          background: `linear-gradient(135deg, ${SIM.brand}, ${SIM.brandDeep})`,
                          boxShadow: podeConfirmar ? "0 10px 30px rgba(0,179,136,0.4)" : "none",
                        }}
                      >
                        {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {confirmando ? "Gravando…" : concluido ? "Confirmar agendamento" : "Montando…"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Chip({ children, dim, amber, alerta }: { children: React.ReactNode; dim?: boolean; amber?: boolean; alerta?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center gap-2.5 rounded-2xl px-3 py-2"
      style={{
        background: amber ? "rgba(244,180,0,0.1)" : SIM.tile,
        border: `1px solid ${amber ? "rgba(244,180,0,0.3)" : alerta ? "rgba(248,113,113,0.4)" : dim ? SIM.borderSoft : SIM.border}`,
        opacity: dim ? 0.7 : 1,
      }}
    >
      {children}
    </div>
  );
}

function Seta({ ativa }: { ativa?: boolean }) {
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      <span className="h-[2px] w-4 rounded-full" style={{ background: ativa ? SIM.accent : SIM.borderSoft }} />
    </span>
  );
}

function EtapaIcone({ estado }: { estado: Etapa }) {
  if (estado === "ok") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "rgba(0,212,160,0.18)", color: SIM.mint }}>
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }
  if (estado === "falhou") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "rgba(248,113,113,0.15)", color: SIM.danger }}>
        !
      </span>
    );
  }
  if (estado === "ativa") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "rgba(0,212,160,0.12)" }}>
        <Loader2 className="h-3 w-3 animate-spin" style={{ color: SIM.accent }} />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
      <MapPin className="h-2.5 w-2.5" style={{ color: SIM.faint }} />
    </span>
  );
}

function Stat({ valor, label, dim }: { valor: string; label: string; dim?: boolean }) {
  return (
    <div className="min-w-[92px] rounded-xl px-3 py-2 text-center" style={{ background: "rgba(255,255,255,0.045)", border: `1px solid ${SIM.borderSoft}` }}>
      <p className="text-[14px] font-bold tabular-nums" style={{ color: dim ? SIM.soft : SIM.text }}>{valor}</p>
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: SIM.faint }}>{label}</p>
    </div>
  );
}
