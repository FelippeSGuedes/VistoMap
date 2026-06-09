"use client";

import Link from "next/link";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  Activity,
  Building2,
  CheckCircle2,
  ClipboardList,
  Map as MapIcon,
  RotateCw,
  Users,
  UserPlus,
} from "lucide-react";
import { painelService } from "@/services/painel";
import { getMapboxToken, DEFAULT_CENTER } from "@/services/maps";
import type { PainelStats, TecnicoAtivo } from "@/types";

/* ── module-level CSS injection (once, like the mapa page) ── */
if (typeof document !== "undefined" && !document.getElementById("vm-cmd-style")) {
  const s = document.createElement("style");
  s.id = "vm-cmd-style";
  s.textContent = `
    @keyframes cmdPulse {
      0%   { transform: scale(0.85); opacity: 0.9; }
      70%  { transform: scale(2.4);  opacity: 0;   }
      100% { transform: scale(0.85); opacity: 0;   }
    }
    @keyframes cmdPulse2 {
      0%   { transform: scale(0.85); opacity: 0.5; }
      70%  { transform: scale(2.4);  opacity: 0;   }
      100% { transform: scale(0.85); opacity: 0;   }
    }
    .vm-cmd-map .mapboxgl-ctrl-logo,
    .vm-cmd-map .mapboxgl-ctrl-attrib,
    .vm-cmd-map .mapboxgl-ctrl-bottom-left,
    .vm-cmd-map .mapboxgl-ctrl-bottom-right { display: none !important; }
  `;
  document.head.appendChild(s);
}

/* ── constants ── */
const ACCENT = "#00D084";
const BG     = "#050505";

/* ── helpers ── */
function fmtNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",") + "k";
  return String(n);
}

function initials(nome: string): string {
  const p = nome.trim().split(/[\s._-]+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

function techStatusColor(status: TecnicoAtivo["status"]): string {
  if (status === "em-campo") return ACCENT;
  if (status === "base")     return "#FBBF24";
  return "#475569";
}

/* ── pulse marker DOM element ── */
function makePulseMarker(color: string, label: string): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "position:relative;width:52px;height:52px;cursor:pointer;";
  el.innerHTML = `
    <div style="position:absolute;inset:0;border-radius:50%;background:${color};
         animation:cmdPulse 2.4s ease-out infinite;"></div>
    <div style="position:absolute;inset:6px;border-radius:50%;background:${color};
         animation:cmdPulse2 2.4s ease-out infinite 0.55s;"></div>
    <div style="
      position:absolute;inset:13px;border-radius:50%;
      background:${color};
      border:2.5px solid rgba(255,255,255,0.92);
      box-shadow:0 0 18px ${color}90, 0 2px 8px rgba(0,0,0,0.5);
      display:flex;align-items:center;justify-content:center;
    ">
      <span style="
        color:#050505;font-size:8px;font-weight:800;
        font-family:Inter,-apple-system,sans-serif;letter-spacing:0.5px;
        user-select:none;
      ">${label}</span>
    </div>
  `;
  return el;
}

/* ══════════════════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════════════════ */
export default function PainelOverviewPage() {
  const [stats,     setStats]     = useState<PainelStats | null>(null);
  const [tecnicos,  setTecnicos]  = useState<TecnicoAtivo[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [now,       setNow]       = useState(() => new Date());

  const mapElRef   = useRef<HTMLDivElement>(null);
  const mapRef     = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const token      = getMapboxToken();

  /* ── data polling ── */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [s, t] = await Promise.all([
        painelService.fetchStats(),
        painelService.fetchTecnicos(),
      ]);
      if (!alive) return;
      setStats(s);
      setTecnicos(t);
    };
    load();
    const id   = window.setInterval(load, 20_000);
    const tick = window.setInterval(() => setNow(new Date()), 1_000);
    return () => { alive = false; clearInterval(id); clearInterval(tick); };
  }, []);

  /* ── map init — deps:[token] ONLY (same pattern as mapa page) ── */
  useEffect(() => {
    if (!token || !mapElRef.current) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapElRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: DEFAULT_CENTER,
      zoom: 7,
      attributionControl: false,
    });
    mapRef.current = map;

    const resize = () => map.resize();

    map.on("load", () => {
      resize();
      setMapLoaded(true);

      /* green heatmap glow layer for vistoria positions */
      map.addSource("vm-cmd-pts", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "vm-cmd-heat",
        type: "heatmap",
        source: "vm-cmd-pts",
        paint: {
          "heatmap-weight":     1,
          "heatmap-intensity":  1.2,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0,   "rgba(0,208,132,0)",
            0.25, "rgba(0,208,132,0.25)",
            0.6,  "rgba(0,208,132,0.55)",
            1,    "rgba(0,208,132,0.85)",
          ],
          "heatmap-radius":  55,
          "heatmap-opacity": 0.55,
        },
      });
    });

    const ro = new ResizeObserver(resize);
    if (mapElRef.current) ro.observe(mapElRef.current);

    /* polling fallback for canvas measurement — same as mapa page */
    let polls = 0;
    const pollId = window.setInterval(() => {
      resize();
      if (++polls >= 32) clearInterval(pollId);
    }, 250);

    return () => {
      clearInterval(pollId);
      ro.disconnect();
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [token]); // [token] ONLY — any other dep recreates the map

  /* ── update tech markers when data or map changes ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const positioned = tecnicos.filter(t => t.lat && t.lng);

    positioned.forEach(t => {
      const color = techStatusColor(t.status);
      const el    = makePulseMarker(color, initials(t.nome));
      const m = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([t.lng!, t.lat!])
        .addTo(map);
      markersRef.current.push(m);
    });

    if (positioned.length > 0) {
      const lngs = positioned.map(t => t.lng!);
      const lats = positioned.map(t => t.lat!);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 100, maxZoom: 13, duration: 1400 },
      );
    }
  }, [tecnicos, mapLoaded]);

  /* ── derived ── */
  const emCampo    = useMemo(() => tecnicos.filter(t => t.status === "em-campo").length, [tecnicos]);
  const expediente = useMemo(
    () => tecnicos.filter(t => t.status === "em-campo" || t.status === "base").length,
    [tecnicos],
  );

  const kpis = useMemo(() => [
    {
      label: "Backlog Total",
      value: stats ? fmtNum(stats.pendentes) : "—",
      sub: "aguardando atribuição",
      icon: ClipboardList,
      color: "#F59E0B",
      href: "/painel/vistorias",
    },
    {
      label: "Em Vistoria",
      value: stats ? fmtNum(stats.emVistoria) : "—",
      sub: `${emCampo} técnico${emCampo !== 1 ? "s" : ""} ativo${emCampo !== 1 ? "s" : ""}`,
      icon: Activity,
      color: "#3B82F6",
      href: "/painel/mapa",
    },
    {
      label: "Concluídas",
      value: stats ? fmtNum(stats.vistoriadas) : "—",
      sub: "aguardando aprovação",
      icon: CheckCircle2,
      color: ACCENT,
      href: "/painel/historico",
    },
    {
      label: "Revisitas",
      value: stats
        ? fmtNum((stats.aguardandoRevisita ?? 0) + (stats.emRevisita ?? 0))
        : "—",
      sub: `${stats?.aguardandoRevisita ?? 0} sem técnico`,
      icon: RotateCw,
      color: "#F97316",
      href: "/painel/revisitas",
    },
    {
      label: "Municípios",
      value: stats ? fmtNum(stats.municipiosAtivos) : "—",
      sub: "com equipamentos ativos",
      icon: Building2,
      color: "#8B5CF6",
      href: undefined as string | undefined,
    },
    {
      label: "Equipe em Campo",
      value: String(emCampo),
      sub: `${expediente} de expediente`,
      icon: Users,
      color: ACCENT,
      href: "/painel/tecnicos",
    },
  ], [stats, emCampo, expediente]);

  const heroStats = stats
    ? [
        { val: fmtNum(stats.pendentes + stats.emVistoria), label: "vistorias na fila" },
        { val: String(expediente),                         label: "em expediente"     },
        { val: String(emCampo),                            label: "técnicos em campo" },
        { val: fmtNum(stats.municipiosAtivos),             label: "municípios ativos" },
      ]
    : null;

  const tecnicosAtivos = useMemo(
    () => tecnicos.filter(t => t.status === "em-campo").slice(0, 5),
    [tecnicos],
  );

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */
  return (
    <div
      className="absolute inset-0 flex flex-col select-none"
      style={{ background: BG, color: "#E2E8F0", fontFamily: "'Inter', -apple-system, sans-serif" }}
    >

      {/* ═══════════ HEADER ═══════════ */}
      <header
        className="flex h-11 shrink-0 items-center gap-4 px-5 z-20"
        style={{
          borderBottom: "1px solid rgba(0,208,132,0.13)",
          background: "rgba(2,8,6,0.82)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Operational indicator */}
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 animate-pulse rounded-full"
            style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-[0.26em]"
            style={{ color: ACCENT }}
          >
            SISTEMA EM OPERAÇÃO
          </span>
        </div>

        <span className="h-3 w-px" style={{ background: "rgba(255,255,255,0.09)" }} />
        <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.22)" }}>
          atualiza a cada 20s
        </span>

        <div className="ml-auto flex items-center gap-2.5">
          {/* Clock */}
          <div
            className="rounded-lg px-3 py-[5px]"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span
              className="text-[12.5px] font-mono font-semibold tabular-nums"
              style={{ color: "#C8D8E0" }}
            >
              {now.toLocaleTimeString("pt-BR", {
                hour: "2-digit", minute: "2-digit", second: "2-digit",
              })}
            </span>
          </div>

          {/* Atribuir button */}
          <Link
            href="/painel/vistorias"
            className="flex items-center gap-1.5 rounded-lg px-3 py-[6px] text-[11.5px] font-bold tracking-wide transition-all hover:brightness-110 hover:scale-105 active:scale-[.97]"
            style={{
              background: ACCENT,
              color: BG,
              boxShadow: `0 0 20px ${ACCENT}55`,
            }}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Atribuir
          </Link>
        </div>
      </header>

      {/* ═══════════ BODY ═══════════ */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT PANEL ── */}
        <aside
          className="relative flex w-[272px] shrink-0 flex-col overflow-hidden"
          style={{ borderRight: "1px solid rgba(0,208,132,0.11)" }}
        >
          {/* vis.png background */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/vis.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />

          {/* dark overlay */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(155deg, rgba(2,8,6,0.93) 0%, rgba(0,16,10,0.84) 45%, rgba(0,28,18,0.72) 100%)",
              backdropFilter: "blur(3px)",
            }}
          />

          {/* subtle grid pattern */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: [
                "linear-gradient(rgba(0,208,132,0.045) 1px, transparent 1px)",
                "linear-gradient(90deg, rgba(0,208,132,0.045) 1px, transparent 1px)",
              ].join(","),
              backgroundSize: "38px 38px",
            }}
          />

          {/* content */}
          <div className="relative z-10 flex flex-1 flex-col gap-5 p-6">

            {/* eyebrow */}
            <div className="flex items-center gap-2">
              <span className="h-px flex-1" style={{ background: "rgba(0,208,132,0.18)" }} />
              <span
                className="text-[8px] font-bold uppercase tracking-[0.30em]"
                style={{ color: "rgba(0,208,132,0.50)" }}
              >
                CENTRAL GIOC
              </span>
              <span className="h-px flex-1" style={{ background: "rgba(0,208,132,0.18)" }} />
            </div>

            {/* hero title */}
            <div>
              <h1
                className="text-[27px] font-bold leading-[1.18] tracking-tight"
                style={{ color: "#DDF2EC" }}
              >
                Operação em
                <br />
                <span
                  style={{
                    color: ACCENT,
                    textShadow: `0 0 28px ${ACCENT}55`,
                  }}
                >
                  movimento.
                </span>
              </h1>
              <p className="mt-1.5 text-[10.5px]" style={{ color: "rgba(255,255,255,0.36)" }}>
                Monitoramento em tempo real
              </p>
            </div>

            {/* stat counters */}
            <ul className="flex flex-col gap-3">
              {heroStats ? (
                heroStats.map((s, i) => (
                  <motion.li
                    key={s.label}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.075, ease: "easeOut", duration: 0.4 }}
                    className="flex items-baseline gap-2.5"
                  >
                    <span
                      className="text-[28px] font-bold tabular-nums leading-none"
                      style={{ color: ACCENT }}
                    >
                      {s.val}
                    </span>
                    <span
                      className="text-[11px] font-medium leading-tight"
                      style={{ color: "rgba(255,255,255,0.48)" }}
                    >
                      {s.label}
                    </span>
                  </motion.li>
                ))
              ) : (
                [80, 72, 64, 56].map((w, i) => (
                  <div
                    key={i}
                    className="h-7 animate-pulse rounded-lg"
                    style={{ background: "rgba(255,255,255,0.06)", width: `${w}%` }}
                  />
                ))
              )}
            </ul>

            {/* divider */}
            <div className="h-px" style={{ background: "rgba(0,208,132,0.13)" }} />

            {/* live techs list */}
            {tecnicosAtivos.length > 0 && (
              <div>
                <p
                  className="mb-2.5 text-[8px] font-bold uppercase tracking-[0.26em]"
                  style={{ color: "rgba(0,208,132,0.42)" }}
                >
                  Técnicos ativos
                </p>
                <ul className="space-y-2">
                  {tecnicosAtivos.map(t => (
                    <li key={t.id} className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: ACCENT, boxShadow: `0 0 5px ${ACCENT}` }}
                      />
                      <span
                        className="truncate text-[11px] font-semibold"
                        style={{ color: "rgba(255,255,255,0.70)" }}
                      >
                        {t.nome.split(" ")[0]}
                      </span>
                      {t.municipio && (
                        <span
                          className="ml-auto shrink-0 text-[9px]"
                          style={{ color: "rgba(255,255,255,0.30)" }}
                        >
                          {t.municipio}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* push buttons to bottom */}
            <div className="flex-1" />

            {/* CTA buttons */}
            <div className="flex flex-col gap-2.5">
              <Link
                href="/painel/vistorias"
                className="flex items-center justify-center gap-2 rounded-[18px] py-3 text-[13px] font-bold tracking-wide transition-all hover:brightness-110 hover:scale-[1.02] active:scale-[.98]"
                style={{
                  background: ACCENT,
                  color: BG,
                  boxShadow: `0 4px 24px ${ACCENT}55`,
                }}
              >
                <UserPlus className="h-4 w-4" />
                Atribuir Vistorias
              </Link>
              <Link
                href="/painel/mapa"
                className="flex items-center justify-center gap-2 rounded-[18px] py-3 text-[13px] font-semibold tracking-wide transition-all hover:scale-[1.02] active:scale-[.98]"
                style={{
                  background: "rgba(0,208,132,0.07)",
                  color: ACCENT,
                  border: `1px solid rgba(0,208,132,0.28)`,
                }}
              >
                <MapIcon className="h-4 w-4" />
                Mapa em Tempo Real
              </Link>
            </div>
          </div>
        </aside>

        {/* ── CENTER: MAPBOX ── */}
        <div className="relative flex-1 min-w-0">
          {/* canvas — in flow, NOT absolute; required for correct height init */}
          <div ref={mapElRef} className="vm-cmd-map h-full w-full" />

          {/* legend overlay */}
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="flex items-center gap-5 rounded-[14px] px-5 py-2.5"
              style={{
                background: "rgba(5,5,5,0.84)",
                border: "1px solid rgba(0,208,132,0.17)",
                backdropFilter: "blur(14px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
              }}
            >
              {[
                { color: ACCENT,    sym: "●", label: "Técnico em campo" },
                { color: "#3B82F6", sym: "◉", label: "Vistoria em andamento" },
                { color: "#F59E0B", sym: "▲", label: "Ocorrência" },
                { color: "#8B5CF6", sym: "■", label: "Base operacional" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <span className="text-[11px] leading-none" style={{ color: item.color }}>
                    {item.sym}
                  </span>
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: "rgba(255,255,255,0.52)" }}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* ── RIGHT: KPI CARDS ── */}
        <aside
          className="flex w-[296px] shrink-0 flex-col gap-3 overflow-y-auto p-4"
          style={{ borderLeft: "1px solid rgba(0,208,132,0.11)" }}
        >
          <p
            className="px-0.5 text-[8px] font-bold uppercase tracking-[0.28em]"
            style={{ color: "rgba(0,208,132,0.38)" }}
          >
            INDICADORES OPERACIONAIS
          </p>

          {/* 2 × 3 glassmorphism grid */}
          <div className="grid grid-cols-2 gap-3">
            {kpis.map((kpi, i) => {
              const Icon = kpi.icon;
              const card = (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.07, ease: "easeOut", duration: 0.38 }}
                  whileHover={{
                    scale: 1.05,
                    y: -3,
                    transition: { type: "spring", stiffness: 320, damping: 22 },
                  }}
                  className="flex flex-col gap-3 rounded-[20px] p-4"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(0,208,132,0.13)",
                    backdropFilter: "blur(12px)",
                    boxShadow:
                      "0 4px 22px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.055)",
                    cursor: kpi.href ? "pointer" : "default",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-xl"
                      style={{
                        background: `${kpi.color}1A`,
                        boxShadow: `0 0 16px ${kpi.color}22`,
                      }}
                    >
                      <Icon className="h-4 w-4" style={{ color: kpi.color }} strokeWidth={2} />
                    </span>
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: kpi.color,
                        boxShadow: `0 0 7px ${kpi.color}`,
                      }}
                    />
                  </div>
                  <div>
                    <div
                      className="text-[27px] font-bold leading-none tabular-nums"
                      style={{ color: "#DDF2EC" }}
                    >
                      {kpi.value}
                    </div>
                    <div
                      className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.18em]"
                      style={{ color: "rgba(255,255,255,0.38)" }}
                    >
                      {kpi.label}
                    </div>
                    <div
                      className="mt-0.5 text-[9px] leading-tight"
                      style={{ color: "rgba(255,255,255,0.24)" }}
                    >
                      {kpi.sub}
                    </div>
                  </div>
                </motion.div>
              );

              return kpi.href ? (
                <Link key={kpi.label} href={kpi.href} className="block">
                  {card}
                </Link>
              ) : (
                <div key={kpi.label}>{card}</div>
              );
            })}
          </div>

          {/* push live strip to bottom */}
          <div className="flex-1" />

          {/* live team strip */}
          <div
            className="rounded-[16px] p-4"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <p
              className="mb-3 text-[8px] font-bold uppercase tracking-[0.24em]"
              style={{ color: "rgba(255,255,255,0.26)" }}
            >
              Equipe ao vivo
            </p>
            {tecnicosAtivos.length === 0 ? (
              <p
                className="py-2 text-center text-[10.5px]"
                style={{ color: "rgba(255,255,255,0.20)" }}
              >
                Nenhum técnico em campo
              </p>
            ) : (
              <ul className="space-y-2">
                {tecnicosAtivos.map(t => (
                  <li key={t.id} className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: ACCENT, boxShadow: `0 0 5px ${ACCENT}` }}
                    />
                    <span
                      className="truncate text-[11px] font-semibold"
                      style={{ color: "rgba(255,255,255,0.63)" }}
                    >
                      {t.nome.split(" ")[0]}
                    </span>
                    <span
                      className="ml-auto shrink-0 rounded-md px-1.5 py-[3px] text-[8px] font-bold uppercase tracking-wide"
                      style={{
                        background: "rgba(0,208,132,0.10)",
                        color: ACCENT,
                      }}
                    >
                      campo
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

      </div>
    </div>
  );
}
