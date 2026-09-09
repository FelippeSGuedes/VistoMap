"use client";

/**
 * SimulacaoDiaOverlay — o "agendar" deixa de ser um salvar seco e vira uma
 * simulação do dia do técnico montando na frente do analista.
 *
 * O servidor devolve só o esqueleto (/preview/plano: ordem, origem, SLA do
 * técnico, hora de início) em milissegundos. Daí o NAVEGADOR traça cada
 * perna na Mapbox Directions e desenha a linha crescendo no mapa conforme
 * a resposta chega; cada parada ganha horário na timeline naquele instante;
 * o almoço entra como bloco próprio; no fim, o veredito ("Fulano termina
 * às 16:40"). O /preview completo (rotas + clima) roda em paralelo e só
 * acrescenta o risco de chuva por parada — os horários vêm da MESMA função
 * pura que o servidor usa ao gravar (roteirizacaoHorarios.ts), então o que
 * o analista vê é o que vai pro banco.
 */

import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  CloudRain,
  Flag,
  Loader2,
  MapPin,
  Route,
  Timer,
  UtensilsCrossed,
} from "lucide-react";
import { MAP_STYLE_DARK, getMapboxToken } from "@/services/maps";
import type { AgendamentoPlano, AgendamentoPreviewResponse } from "@/services/painel";
import {
  acumularHorarios,
  almocoDoDia,
  calcularTermino,
  type PernaCalculada,
} from "@/lib/roteirizacaoHorarios";

/* ─── paleta própria da simulação — mundo escuro deliberado, único tema ───── */
const SIM = {
  bg: "#04151A",
  panel: "rgba(5,24,28,0.88)",
  panelSolid: "#071D22",
  border: "rgba(94,255,217,0.14)",
  borderSoft: "rgba(255,255,255,0.06)",
  text: "#E9F7F2",
  soft: "rgba(233,247,242,0.64)",
  faint: "rgba(233,247,242,0.36)",
  accent: "#00D4A0",
  brand: "#00B388",
  brandDeep: "#00875F",
  amber: "#F4B400",
  danger: "#F87171",
  tile: "rgba(255,255,255,0.045)",
} as const;

const PANEL_W = 420;

if (typeof document !== "undefined" && !document.getElementById("vm-sim-style")) {
  const s = document.createElement("style");
  s.id = "vm-sim-style";
  s.textContent = `
    @keyframes simPop{0%{transform:scale(.55);opacity:.3}55%{transform:scale(1.22)}100%{transform:scale(1);opacity:1}}
    @keyframes simRing{0%{box-shadow:0 0 0 0 rgba(0,212,160,.6)}100%{box-shadow:0 0 0 16px rgba(0,212,160,0)}}
    .sim-pin{width:30px;height:30px;border-radius:999px;display:flex;align-items:center;justify-content:center;
      font:700 11px/1 ui-sans-serif,system-ui;color:#fff;background:linear-gradient(145deg,#00B388,#00875F);
      border:2px solid rgba(255,255,255,.85);box-shadow:0 4px 14px rgba(0,0,0,.45);opacity:.32;transform:scale(.8);
      transition:opacity .35s ease,transform .35s ease,filter .35s ease;filter:grayscale(.6)}
    .sim-pin[data-on="1"]{opacity:1;transform:scale(1);filter:none;animation:simPop .55s cubic-bezier(.22,.7,.2,1) both,simRing 1.1s ease-out .1s 1}
    .sim-origin{width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;
      font:800 11px/1 ui-sans-serif,system-ui;letter-spacing:.04em;color:#04151A;background:#5EFFD9;
      border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 6px rgba(94,255,217,.18),0 6px 18px rgba(0,0,0,.5)}
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
  const fallback: Leg = {
    distanciaM: Math.round(distReta),
    duracaoMin: (distReta / 1000 / 30) * 60,
    coords: reta,
    estimado: true,
  };
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
  return new Date(`${iso}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: TZ,
  });
}
function iniciais(nome: string): string {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
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
const SRC_HEAD = "sim-route-head";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const lineFC = (linhas: Coord[][]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: linhas
    .filter((l) => l.length >= 2)
    .map((l) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: l } })),
});
const pointFC = (p: Coord | null): GeoJSON.FeatureCollection =>
  p ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } }] } : EMPTY_FC;

function montarCamadas(map: mapboxgl.Map) {
  if (map.getSource(SRC_DONE)) return;
  map.addSource(SRC_DONE, { type: "geojson", data: EMPTY_FC });
  map.addSource(SRC_ACTIVE, { type: "geojson", data: EMPTY_FC });
  map.addSource(SRC_HEAD, { type: "geojson", data: EMPTY_FC });
  const glow = (id: string, src: string, opacity: number) =>
    map.addLayer({
      id,
      type: "line",
      source: src,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": SIM.accent, "line-width": 12, "line-blur": 8, "line-opacity": opacity },
    });
  const line = (id: string, src: string, width: number) =>
    map.addLayer({
      id,
      type: "line",
      source: src,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": SIM.accent, "line-width": width, "line-opacity": 0.95 },
    });
  glow("sim-done-glow", SRC_DONE, 0.3);
  line("sim-done-line", SRC_DONE, 3.5);
  glow("sim-active-glow", SRC_ACTIVE, 0.55);
  line("sim-active-line", SRC_ACTIVE, 4.5);
  map.addLayer({
    id: "sim-head-halo",
    type: "circle",
    source: SRC_HEAD,
    paint: { "circle-radius": 16, "circle-color": SIM.accent, "circle-opacity": 0.22, "circle-blur": 0.6 },
  });
  map.addLayer({
    id: "sim-head",
    type: "circle",
    source: SRC_HEAD,
    paint: { "circle-radius": 5.5, "circle-color": "#FFFFFF", "circle-stroke-color": SIM.accent, "circle-stroke-width": 3 },
  });
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
  const mapRef = useRef<mapboxgl.Map | null>(null);
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
    const token = getMapboxToken();
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE_DARK,
      center: plano?.origem ? [plano.origem.lng, plano.origem.lat] : [-47.0608, -22.9056],
      zoom: 10,
      attributionControl: false,
      interactive: true,
      antialias: true,
    });
    map.setProjection("mercator");
    mapRef.current = map;
    const onLoad = () => {
      map.resize();
      montarCamadas(map);
      setMapReady(true);
    };
    map.on("load", onLoad);
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      pinElsRef.current = [];
      feitasRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapReady(false);
      setLegs([]);
      setRotasResolvidas(0);
      setConcluido(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* simulação: pins → pernas em paralelo → revela em ordem, desenhando */
  useEffect(() => {
    const map = mapRef.current;
    if (!open || !mapReady || !map || !plano || !tecnico) return;
    let cancelado = false;
    let rafCancel: (() => void) | null = null;
    const reduzir = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // pins (apagados) + origem
    const origemEl = document.createElement("div");
    origemEl.className = "sim-origin";
    origemEl.textContent = iniciais(tecnico.nome);
    markersRef.current.push(new mapboxgl.Marker({ element: origemEl }).setLngLat([plano.origem.lng, plano.origem.lat]).addTo(map));
    pinElsRef.current = plano.paradas.map((p) => {
      const el = document.createElement("div");
      el.className = "sim-pin";
      el.dataset.on = "0";
      el.textContent = String(p.ordem);
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
      return el;
    });

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([plano.origem.lng, plano.origem.lat]);
    plano.paradas.forEach((p) => bounds.extend([p.lng, p.lat]));
    const padding = { top: 110, bottom: 70, left: 70, right: PANEL_W + 60 };
    map.fitBounds(bounds, { padding, maxZoom: 14.5, duration: reduzir ? 0 : 900 });

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
    const srcHead = () => map.getSource(SRC_HEAD) as GeoJSONSource | undefined;

    const desenhar = (coords: Coord[], ms: number) =>
      new Promise<void>((resolve) => {
        const acc = cumulativo(coords);
        const total = acc[acc.length - 1];
        if (ms <= 0 || total === 0 || coords.length < 2) {
          srcActive()?.setData(lineFC([coords]));
          srcHead()?.setData(pointFC(coords[coords.length - 1]));
          resolve();
          return;
        }
        const t0 = performance.now();
        let raf = 0;
        const step = (t: number) => {
          if (cancelado) return;
          const p = Math.min(1, (t - t0) / ms);
          const e = 1 - Math.pow(1 - p, 3);
          const parte = trechoParcial(coords, acc, e * total);
          srcActive()?.setData(lineFC([parte]));
          srcHead()?.setData(pointFC(parte[parte.length - 1]));
          if (p < 1) raf = requestAnimationFrame(step);
          else resolve();
        };
        raf = requestAnimationFrame(step);
        rafCancel = () => cancelAnimationFrame(raf);
      });

    const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, reduzir ? 0 : ms));

    (async () => {
      await dormir(650); // deixa o fitBounds assentar antes da primeira linha
      for (let i = 0; i < plano.paradas.length; i++) {
        const leg = await promessas[i];
        if (cancelado) return;
        const ms = reduzir ? 0 : Math.min(1300, Math.max(420, leg.distanciaM / 35));
        await desenhar(leg.coords, ms);
        if (cancelado) return;
        feitasRef.current.push(leg.coords);
        srcDone()?.setData(lineFC(feitasRef.current));
        srcActive()?.setData(EMPTY_FC);
        srcHead()?.setData(EMPTY_FC);
        pinElsRef.current[i]?.setAttribute("data-on", "1");
        setLegs((prev) => [...prev, leg]);
        await dormir(180);
      }
      if (cancelado) return;
      setConcluido(true);
      map.fitBounds(bounds, { padding, maxZoom: 14.5, pitch: reduzir ? 0 : 38, bearing: reduzir ? 0 : -14, duration: reduzir ? 0 : 1600 });
    })();

    return () => {
      cancelado = true;
      rafCancel?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mapReady, plano, tecnico]);

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
  const horaInicio = useMemo(
    () => (plano ? new Date(`${plano.data_agendada}T${plano.hora_inicio}:00-03:00`) : null),
    [plano]
  );
  const almocoEm = useMemo(() => (plano ? almocoDoDia(plano.data_agendada) : null), [plano]);
  const horarios = useMemo(
    () => (plano && horaInicio && almocoEm ? acumularHorarios(horaInicio, plano.sla_min, legs, almocoEm) : []),
    [plano, horaInicio, almocoEm, legs]
  );
  const termino = useMemo(
    () => (concluido && almocoEm ? calcularTermino(horarios, almocoEm) : null),
    [concluido, horarios, almocoEm]
  );
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
          {/* mapa ocupa tudo; o painel flutua por cima à direita */}
          <div ref={containerRef} className="absolute inset-0" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(4,21,26,0.55) 0%, rgba(4,21,26,0) 28%), linear-gradient(180deg, rgba(4,21,26,0.65) 0%, rgba(4,21,26,0) 22%)",
            }}
          />

          {/* etapas — canto superior esquerdo */}
          <motion.div
            className="absolute left-6 top-6 flex flex-col gap-1.5"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: SIM.faint }}>
              Simulação do dia
            </p>
            {etapas.map((et, i) => (
              <motion.div
                key={et.key}
                className="flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3.5 backdrop-blur-md"
                style={{ background: SIM.panel, border: `1px solid ${et.estado === "ativa" ? SIM.border : SIM.borderSoft}` }}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: et.estado === "pendente" ? 0.45 : 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.07 }}
              >
                <EtapaIcone estado={et.estado} />
                <span className="text-[12px] font-semibold" style={{ color: et.estado === "pendente" ? SIM.faint : SIM.text }}>
                  {et.label}
                </span>
                {et.detalhe && (
                  <span className="text-[10.5px] font-semibold tabular-nums" style={{ color: et.estado === "falhou" ? SIM.danger : SIM.accent }}>
                    {et.detalhe}
                  </span>
                )}
              </motion.div>
            ))}
          </motion.div>

          {/* legenda discreta — canto inferior esquerdo */}
          <motion.div
            className="absolute bottom-6 left-6 flex items-center gap-4 text-[10.5px]"
            style={{ color: SIM.faint }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <span className="flex items-center gap-1.5">
              <span className="sim-origin" style={{ width: 14, height: 14, borderRadius: 4, fontSize: 0, boxShadow: "none", borderWidth: 1 }} />
              saída ({plano?.hora_inicio ?? "—"})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-6 rounded-full" style={{ background: SIM.accent }} />
              trajeto
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }} />
              parada
            </span>
          </motion.div>

          {/* painel direito */}
          <motion.aside
            className="absolute bottom-0 right-0 top-0 flex flex-col backdrop-blur-xl"
            style={{ width: PANEL_W, maxWidth: "94vw", background: SIM.panel, borderLeft: `1px solid ${SIM.border}` }}
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
          >
            {/* cabeçalho: técnico + data */}
            <div className="flex items-center gap-3 px-5 pb-4 pt-5" style={{ borderBottom: `1px solid ${SIM.borderSoft}` }}>
              <button
                type="button"
                onClick={onVoltar}
                disabled={confirmando}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/5 disabled:opacity-40"
                style={{ color: SIM.soft }}
                aria-label="Voltar"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white"
                style={{ background: "linear-gradient(145deg,#00B388,#00875F)", boxShadow: "0 4px 14px rgba(0,179,136,0.35)" }}
              >
                {tecnico ? iniciais(tecnico.nome) : "—"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{tecnico?.nome ?? "—"}</p>
                <p className="flex items-center gap-1.5 text-[11px]" style={{ color: SIM.soft }}>
                  <Calendar className="h-3 w-3" /> {fmtData(dataAgendada)}
                  {plano && (
                    <>
                      <span style={{ color: SIM.faint }}>·</span> {n} parada{n !== 1 ? "s" : ""}
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* veredito */}
            <div className="px-5 pt-4">
              <AnimatePresence mode="wait">
                {planoErro ? (
                  <motion.div
                    key="erro-plano"
                    className="rounded-2xl px-4 py-3 text-[12.5px]"
                    style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: SIM.text }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {planoErro}
                  </motion.div>
                ) : termino && plano ? (
                  <motion.div
                    key="veredito"
                    className="relative overflow-hidden rounded-2xl p-4"
                    style={{
                      background: "linear-gradient(135deg, rgba(0,179,136,0.22), rgba(0,135,95,0.08))",
                      border: `1px solid ${SIM.border}`,
                    }}
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full"
                      style={{ background: "radial-gradient(circle, rgba(94,255,217,0.35), transparent 70%)", filter: "blur(10px)" }}
                    />
                    <p className="text-[11px] leading-relaxed" style={{ color: SIM.soft }}>
                      Considerando início às <b style={{ color: SIM.text }}>{plano.hora_inicio}</b>, almoço de{" "}
                      <b style={{ color: SIM.text }}>{plano.almoco.duracao_min / 60}h</b> e margem de{" "}
                      <b style={{ color: SIM.text }}>{plano.margem_min} min</b>,
                    </p>
                    <p className="mt-1.5 text-[15px] font-semibold leading-tight">
                      {primeiroNome} termina às{" "}
                      <span className="text-[26px] font-bold tabular-nums tracking-tight" style={{ color: "#5EFFD9" }}>
                        {fmtHora(termino)}
                      </span>
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <Stat valor={`${kmAnim.toFixed(1).replace(".", ",")} km`} label="percurso" />
                      <Stat valor={fmtMin(rotaAnim)} label="em rota" />
                      <Stat valor={fmtMin(vistoriaAnim)} label="em vistoria" />
                    </div>
                    {chuvaNoDia && (
                      <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "#FCA5A5" }}>
                        <CloudRain className="h-3.5 w-3.5" /> Risco de chuva em parte do percurso
                      </p>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="montando"
                    className="rounded-2xl p-4"
                    style={{ background: SIM.tile, border: `1px solid ${SIM.borderSoft}` }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -6 }}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: SIM.faint }}>
                      Montando o dia
                    </p>
                    <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                      <Stat valor={`${kmAnim.toFixed(1).replace(".", ",")} km`} label="percurso" dim />
                      <Stat valor={fmtMin(rotaAnim)} label="em rota" dim />
                      <Stat valor={fmtMin(vistoriaAnim)} label="em vistoria" dim />
                    </div>
                    <div className="mt-3 h-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${SIM.brand}, #5EFFD9)` }}
                        animate={{ width: `${n > 0 ? Math.max(6, (legs.length / n) * 100) : 6}%` }}
                        transition={{ type: "spring", stiffness: 120, damping: 20 }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* timeline */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 pt-4">
              {plano && plano.ignorados_sem_coordenada.length > 0 && (
                <p className="mb-3 rounded-xl px-3 py-2 text-[11px]" style={{ background: "rgba(244,180,0,0.1)", color: "#FDE68A", border: "1px solid rgba(244,180,0,0.25)" }}>
                  {plano.ignorados_sem_coordenada.length} equipamento(s) sem coordenada ficaram fora do roteiro.
                </p>
              )}

              <div className="relative">
                {legs.length > 0 && (
                  <div className="absolute bottom-5 left-[15px] top-5 w-[2px]" style={{ background: `linear-gradient(180deg, ${SIM.accent}, rgba(0,212,160,0.12))` }} />
                )}

                {/* saída */}
                {plano && (
                  <div className="relative mb-3 flex items-center gap-3">
                    <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold" style={{ background: "#5EFFD9", color: SIM.bg }}>
                      {tecnico ? iniciais(tecnico.nome) : "—"}
                    </span>
                    <p className="text-[11.5px]" style={{ color: SIM.soft }}>
                      Saída <b className="tabular-nums" style={{ color: SIM.text }}>{plano.hora_inicio}</b> · última posição conhecida
                    </p>
                  </div>
                )}

                {plano?.paradas.slice(0, legs.length).map((p, i) => {
                  const h = horarios[i];
                  const leg = legs[i];
                  const clima = climaPorId.get(p.vistoria_id);
                  return (
                    <div key={p.vistoria_id}>
                      {h?.almocoAntes && almocoEm && almocoFim && (
                        <motion.div
                          className="relative mb-2 flex items-center gap-3"
                          initial={{ opacity: 0, x: 18 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ type: "spring", stiffness: 260, damping: 24 }}
                        >
                          <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: SIM.amber, color: "#1C222B", boxShadow: "0 0 0 4px rgba(244,180,0,0.18)" }}>
                            <UtensilsCrossed className="h-3.5 w-3.5" />
                          </span>
                          <div className="flex-1 rounded-xl px-3 py-2" style={{ background: "rgba(244,180,0,0.1)", border: "1px solid rgba(244,180,0,0.28)" }}>
                            <p className="text-[12px] font-semibold" style={{ color: "#FDE68A" }}>
                              Almoço <span className="tabular-nums">{fmtHora(almocoEm)}–{fmtHora(almocoFim)}</span>
                            </p>
                          </div>
                        </motion.div>
                      )}
                      <motion.div
                        className="relative mb-2 flex items-start gap-3"
                        initial={{ opacity: 0, x: 18 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: "spring", stiffness: 260, damping: 24 }}
                      >
                        <span
                          className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                          style={{ background: "linear-gradient(145deg,#00B388,#00875F)", boxShadow: "0 0 0 4px rgba(0,212,160,0.16)" }}
                        >
                          {p.ordem}
                        </span>
                        <div className="min-w-0 flex-1 rounded-xl px-3 py-2.5" style={{ background: SIM.tile, border: `1px solid ${clima?.alerta ? "rgba(248,113,113,0.35)" : SIM.borderSoft}` }}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-[12.5px] font-semibold">{p.equipamento}</p>
                            {h && (
                              <span className="shrink-0 text-[12px] font-bold tabular-nums" style={{ color: "#5EFFD9" }}>
                                {fmtHora(h.chegada)}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px]" style={{ color: SIM.soft }}>
                            {h && (
                              <span className="tabular-nums">
                                vistoria até {fmtHora(h.saida)} · {plano.sla_min} min
                              </span>
                            )}
                            {leg && (
                              <span className="flex items-center gap-1">
                                <Route className="h-3 w-3" style={{ color: SIM.faint }} />
                                +{fmtKm(leg.distanciaM)} km · {fmtMin(leg.duracaoMin)}
                                {leg.estimado && <span style={{ color: SIM.faint }}>(estimado)</span>}
                              </span>
                            )}
                          </p>
                          {clima?.alerta && (
                            <p className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: "#FCA5A5" }}>
                              <CloudRain className="h-3 w-3" /> Risco de chuva {clima.pct}%
                            </p>
                          )}
                        </div>
                      </motion.div>
                    </div>
                  );
                })}

                {/* chegada / término */}
                {termino && (
                  <motion.div
                    className="relative flex items-center gap-3"
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 24, delay: 0.1 }}
                  >
                    <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "#5EFFD9", color: SIM.bg }}>
                      <Flag className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-[11.5px]" style={{ color: SIM.soft }}>
                      Término previsto <b className="tabular-nums" style={{ color: SIM.text }}>{fmtHora(termino)}</b>
                      <span style={{ color: SIM.faint }}> · inclui margem de {plano?.margem_min} min</span>
                    </p>
                  </motion.div>
                )}

                {plano && legs.length < n && !planoErro && (
                  <div className="relative mt-1 flex items-center gap-3 py-2">
                    <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: SIM.tile, border: `1px dashed ${SIM.border}` }}>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: SIM.accent }} />
                    </span>
                    <p className="text-[11px]" style={{ color: SIM.faint }}>
                      traçando até a parada {legs.length + 1}…
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* rodapé */}
            <div className="px-5 pb-5 pt-3" style={{ borderTop: `1px solid ${SIM.borderSoft}` }}>
              {erro && (
                <p className="mb-2 text-[11px] font-medium" style={{ color: SIM.danger }}>
                  {erro}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onVoltar}
                  disabled={confirmando}
                  className="h-11 flex-1 rounded-xl text-[13px] font-semibold transition hover:bg-white/5 disabled:opacity-40"
                  style={{ border: `1px solid ${SIM.border}`, color: SIM.soft }}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={onConfirmar}
                  disabled={!podeConfirmar}
                  className="flex h-11 flex-[1.6] items-center justify-center gap-2 rounded-xl text-[13px] font-bold transition hover:brightness-110 disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${SIM.brand}, ${SIM.brandDeep})`, color: "#fff", boxShadow: podeConfirmar ? "0 8px 24px rgba(0,179,136,0.35)" : "none" }}
                >
                  {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {confirmando ? "Gravando…" : concluido ? "Confirmar agendamento" : "Montando…"}
                </button>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[10px]" style={{ color: SIM.faint }}>
                <Timer className="h-3 w-3" /> Média de {plano?.sla_min ?? "—"} min por vistoria — histórico do próprio técnico.
              </p>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EtapaIcone({ estado }: { estado: Etapa }) {
  if (estado === "ok") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "rgba(0,212,160,0.18)", color: "#5EFFD9" }}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (estado === "falhou") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "rgba(248,113,113,0.15)", color: SIM.danger }}>
        !
      </span>
    );
  }
  if (estado === "ativa") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "rgba(0,212,160,0.12)" }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: SIM.accent }} />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
      <MapPin className="h-3 w-3" style={{ color: SIM.faint }} />
    </span>
  );
}

function Stat({ valor, label, dim }: { valor: string; label: string; dim?: boolean }) {
  return (
    <div className="rounded-xl py-2" style={{ background: "rgba(255,255,255,0.04)" }}>
      <p className="text-[14px] font-bold tabular-nums" style={{ color: dim ? SIM.soft : SIM.text }}>{valor}</p>
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: SIM.faint }}>{label}</p>
    </div>
  );
}
