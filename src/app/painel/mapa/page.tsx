"use client";

import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/auth";
import { DEFAULT_CENTER, MAP_STYLE, getMapboxToken } from "@/services/maps";
import type {
  PainelMapaResponse,
  PainelMapaTecnico,
  PainelMapaVistoria,
} from "@/types/painel-mapa";
import {
  Activity,
  CheckCircle2,
  ClipboardList,
  Clock,
  MapPin,
  RefreshCw,
  RotateCw,
  Route,
  Search,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const VISTORIAS_SRC = "vm-vistorias-src";
const VISTORIAS_CLUSTER = "vm-vistorias-cluster";
const VISTORIAS_CLUSTER_COUNT = "vm-vistorias-cluster-count";
const VISTORIAS_POINTS = "vm-vistorias-points";

function relTime(iso?: string | null): string {
  if (!iso) return "sem sinal";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  return `${Math.round(m / 60)} h`;
}

function initials(nome: string): string {
  const parts = nome.trim().split(/[\s._-]+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

function statusColor(status: PainelMapaTecnico["status_operacional"]): string {
  if (status === "em-operacao") return "#00B388";
  if (status === "em-vistoria") return "#3B82F6";
  if (status === "parado") return "#F59E0B";
  return "#94A3B8";
}

function statusLabel(status: PainelMapaTecnico["status_operacional"]): string {
  if (status === "em-operacao") return "Em operacao";
  if (status === "em-vistoria") return "Em vistoria";
  if (status === "parado") return "Parado";
  return "Offline";
}

const SITUACAO_COR: Record<string, string> = {
  A_VISTORIAR: "#F59E0B",
  EM_VISTORIA: "#3B82F6",
  VISTORIADO: "#00B388",
  AGUARDANDO_REVISITA: "#F97316",
  EM_REVISITA: "#A855F7",
  REVISITADO: "#0EA5E9",
};

const SITUACAO_LABEL: Record<string, string> = {
  A_VISTORIAR: "A vistoriar",
  EM_VISTORIA: "Em vistoria",
  VISTORIADO: "Vistoriado",
  AGUARDANDO_REVISITA: "Aguardando rev.",
  EM_REVISITA: "Em revisita",
  REVISITADO: "Revisitado",
};

function vistoriaColor(status: PainelMapaVistoria["status"]): string {
  switch (status) {
    case "A_VISTORIAR":
      return "#F59E0B";
    case "EM_VISTORIA":
      return "#3B82F6";
    case "VISTORIADO":
      return "#00B388";
    case "REVISITA":
      return "#F97316";
    case "REPROVADO":
      return "#EF4444";
    default:
      return "#94A3B8";
  }
}

function techMarkerEl(t: PainelMapaTecnico): HTMLElement {
  const color = statusColor(t.status_operacional);
  const root = document.createElement("div");
  root.style.cssText = "position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;";

  const avatar = document.createElement("div");
  avatar.style.cssText = `
    width:40px;height:40px;border-radius:14px;
    display:flex;align-items:center;justify-content:center;
    background:linear-gradient(145deg,${color},${color}CC);
    color:white;font-size:12px;font-weight:700;letter-spacing:.04em;
    border:2px solid #fff;
    box-shadow:0 6px 14px ${color}33,0 0 0 1px ${color}22;
  `;
  avatar.textContent = initials(t.nome);

  if (t.status_operacional === "em-operacao" || t.status_operacional === "em-vistoria") {
    const pulse = document.createElement("div");
    pulse.style.cssText = `
      position:absolute;top:-3px;left:50%;transform:translateX(-50%);
      width:46px;height:46px;border-radius:18px;border:2px solid ${color};
      opacity:.35;animation:vm-tech-pulse 2s ease-out infinite;
      pointer-events:none;
    `;
    root.appendChild(pulse);
  }

  const label = document.createElement("div");
  label.style.cssText = `
    padding:2px 8px;border-radius:999px;
    background:rgba(255,255,255,.92);
    border:1px solid rgba(6,59,59,.09);
    box-shadow:0 2px 8px rgba(6,59,59,.10);
    color:#063B3B;font-size:10px;font-weight:600;
    white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;
  `;
  label.textContent = t.nome.split(/\s+/)[0] ?? t.nome;

  root.appendChild(avatar);
  root.appendChild(label);
  return root;
}

if (typeof document !== "undefined" && !document.getElementById("vm-tech-pulse-style")) {
  const style = document.createElement("style");
  style.id = "vm-tech-pulse-style";
  style.textContent = "@keyframes vm-tech-pulse{0%{transform:translateX(-50%) scale(1);opacity:.35}75%{transform:translateX(-50%) scale(1.45);opacity:0}100%{transform:translateX(-50%) scale(1.45);opacity:0}}";
  document.head.appendChild(style);
}

export default function PainelMapaPage() {
  const { session } = useAuthStore();
  const token = getMapboxToken();
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const techMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());

  const [data, setData] = useState<PainelMapaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTec, setSelectedTec] = useState<PainelMapaTecnico | null>(null);
  const [aba, setAba] = useState<"tecnicos" | "vistorias">("tecnicos");
  const [filtroSit, setFiltroSit] = useState<"todas" | PainelMapaVistoria["situacao"]>("todas");
  const [buscaVis, setBuscaVis] = useState("");

  const fetchMapa = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const r = await fetch("/api/painel/mapa", {
        headers: { Authorization: `Bearer ${session.token}` },
        cache: "no-store",
      });
      if (!r.ok) return;
      const json = (await r.json()) as PainelMapaResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => {
    fetchMapa();
    const id = window.setInterval(fetchMapa, 15_000);
    return () => window.clearInterval(id);
  }, [fetchMapa]);

  useEffect(() => {
    if (!token || !mapElRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapElRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: 10,
      attributionControl: false,
      pitchWithRotate: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      techMarkersRef.current.clear();
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    const syncTechMarkers = () => {
      const visibleTechs = data.tecnicos.filter((t) => t.latitude != null && t.longitude != null);
      const seen = new Set<number>();

      visibleTechs.forEach((t) => {
        seen.add(t.users_id);
        const existing = techMarkersRef.current.get(t.users_id);
        if (existing) {
          existing.setLngLat([t.longitude!, t.latitude!]);
          return;
        }
        const el = techMarkerEl(t);
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([t.longitude!, t.latitude!])
          .addTo(map);
        el.addEventListener("click", () => setSelectedTec(t));
        techMarkersRef.current.set(t.users_id, marker);
      });

      techMarkersRef.current.forEach((m, id) => {
        if (!seen.has(id)) {
          m.remove();
          techMarkersRef.current.delete(id);
        }
      });
    };

    const geojson = {
      type: "FeatureCollection" as const,
      features: data.vistorias.map((v) => ({
        type: "Feature" as const,
        properties: {
          id: v.id,
          status: v.status,
          color: vistoriaColor(v.status),
          is_revisita: v.is_revisita ? 1 : 0,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [v.longitude, v.latitude],
        },
      })),
    };

    const syncVistorias = () => {
      if (!map.getSource(VISTORIAS_SRC)) {
        map.addSource(VISTORIAS_SRC, {
          type: "geojson",
          data: geojson,
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: 14,
        });

        map.addLayer({
          id: VISTORIAS_CLUSTER,
          type: "circle",
          source: VISTORIAS_SRC,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#063B3B",
            "circle-opacity": 0.86,
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 2,
            "circle-radius": ["step", ["get", "point_count"], 16, 20, 20, 60, 24],
          },
        });

        map.addLayer({
          id: VISTORIAS_CLUSTER_COUNT,
          type: "symbol",
          source: VISTORIAS_SRC,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: {
            "text-color": "#FFFFFF",
          },
        });

        map.addLayer({
          id: VISTORIAS_POINTS,
          type: "circle",
          source: VISTORIAS_SRC,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": 6,
            "circle-stroke-width": ["case", ["==", ["get", "is_revisita"], 1], 2.5, 1.5],
            "circle-stroke-color": ["case", ["==", ["get", "is_revisita"], 1], "#F59E0B", "#FFFFFF"],
          },
        });
      } else {
        const src = map.getSource(VISTORIAS_SRC) as GeoJSONSource;
        src.setData(geojson);
      }
    };

    if (map.loaded()) {
      syncTechMarkers();
      syncVistorias();
    } else {
      map.once("load", () => {
        syncTechMarkers();
        syncVistorias();
      });
    }
  }, [data]);

  const techComGps = useMemo(
    () => (data?.tecnicos ?? []).filter((t) => t.latitude != null && t.longitude != null).length,
    [data]
  );

  // Vistorias "enviadas" = situação saiu de A_Vistoriar (técnico ja interagiu).
  // Mostra todas pra dar visibilidade — agrupadas + filtraveis.
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
    const acc: Record<string, number> = {
      A_VISTORIAR: 0, EM_VISTORIA: 0, VISTORIADO: 0,
      AGUARDANDO_REVISITA: 0, EM_REVISITA: 0, REVISITADO: 0,
    };
    for (const v of data?.vistorias ?? []) acc[v.situacao] = (acc[v.situacao] ?? 0) + 1;
    return acc;
  }, [data]);

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col gap-3">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between gap-4"
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "#00B388" }}>
            Operacao viva · mapa em tempo real
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.5px]" style={{ color: "#063B3B" }}>
            CENTRAL OPERACIONAL GIOC
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Chip icon={<Users className="h-3.5 w-3.5" />} label="Tecnicos GPS" value={techComGps} />
          <Chip icon={<MapPin className="h-3.5 w-3.5" />} label="Vistorias" value={data?.vistorias.length ?? 0} />
          <button
            type="button"
            onClick={fetchMapa}
            className="flex h-8 w-8 items-center justify-center rounded-xl border"
            style={{ borderColor: "rgba(6,59,59,0.1)", color: "#566773", background: "#fff" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </motion.div>

      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-3">
        <aside
          className="flex min-h-0 flex-col overflow-hidden rounded-[18px] border bg-white"
          style={{ borderColor: "rgba(6,59,59,0.08)" }}
        >
          {/* Tabs */}
          <div
            className="flex shrink-0 items-center gap-1 p-1.5"
            style={{ borderBottom: "1px solid rgba(6,59,59,0.06)" }}
          >
            <TabBtn
              active={aba === "tecnicos"}
              onClick={() => setAba("tecnicos")}
              icon={<Users className="h-3 w-3" strokeWidth={2.2} />}
              label="Equipe"
              badge={data?.tecnicos.length}
            />
            <TabBtn
              active={aba === "vistorias"}
              onClick={() => setAba("vistorias")}
              icon={<ClipboardList className="h-3 w-3" strokeWidth={2.2} />}
              label="Vistorias"
              badge={data?.vistorias.length}
            />
          </div>

          {aba === "tecnicos" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#7A8896" }}>
                  Equipe em campo
                </p>
                <span className="text-[10px]" style={{ color: "#94A3B8" }}>polling 15s</span>
              </div>
              <div className="space-y-2">
                {(data?.tecnicos ?? []).map((t) => {
                  const c = statusColor(t.status_operacional);
                  return (
                    <button
                      key={t.users_id}
                      type="button"
                      onClick={() => {
                        setSelectedTec(t);
                        if (t.latitude != null && t.longitude != null) {
                          mapRef.current?.flyTo({
                            center: [t.longitude, t.latitude],
                            zoom: Math.max(13.5, mapRef.current?.getZoom() ?? 13.5),
                            duration: 700,
                          });
                        }
                      }}
                      className="w-full rounded-xl border p-2.5 text-left transition hover:bg-[#F8FBFA]"
                      style={{ borderColor: "rgba(6,59,59,0.08)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
                        <p className="truncate text-[12px] font-semibold" style={{ color: "#063B3B" }}>{t.nome}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: "#7A8896" }}>
                        <span>{statusLabel(t.status_operacional)}</span>
                        <span>•</span>
                        <span>{relTime(t.created_at)}</span>
                      </div>
                    </button>
                  );
                })}
                {(data?.tecnicos ?? []).length === 0 && (
                  <p className="py-8 text-center text-[11px]" style={{ color: "#94A3B8" }}>
                    Nenhum técnico ativo.
                  </p>
                )}
              </div>
            </div>
          )}

          {aba === "vistorias" && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Busca */}
              <div className="shrink-0 p-2.5">
                <div
                  className="flex items-center gap-2 rounded-xl px-2.5 py-1.5"
                  style={{ background: "#F7F9FB", border: "1px solid rgba(6,59,59,0.06)" }}
                >
                  <Search className="h-3 w-3" style={{ color: "#94A3B8" }} strokeWidth={2.2} />
                  <input
                    type="search"
                    value={buscaVis}
                    onChange={(e) => setBuscaVis(e.target.value)}
                    placeholder="Equipamento, técnico, município…"
                    className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                    style={{ color: "#063B3B" }}
                  />
                </div>
              </div>

              {/* Filtros situação */}
              <div className="shrink-0 px-2.5">
                <div className="flex flex-wrap gap-1">
                  <FiltroPill
                    active={filtroSit === "todas"}
                    label="Todas"
                    n={data?.vistorias.length ?? 0}
                    color="#063B3B"
                    onClick={() => setFiltroSit("todas")}
                  />
                  {(
                    [
                      ["A_VISTORIAR", "A vistoriar", "#F59E0B"],
                      ["EM_VISTORIA", "Em vistoria", "#3B82F6"],
                      ["VISTORIADO", "Vistoriado", "#00B388"],
                      ["AGUARDANDO_REVISITA", "Aguardando rev.", "#F97316"],
                      ["EM_REVISITA", "Em revisita", "#A855F7"],
                      ["REVISITADO", "Revisitado", "#0EA5E9"],
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
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
                <div className="space-y-1.5">
                  {vistoriasFiltradas.slice(0, 200).map((v) => {
                    const cor = SITUACAO_COR[v.situacao] ?? "#94A3B8";
                    const label = SITUACAO_LABEL[v.situacao];
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          mapRef.current?.flyTo({
                            center: [v.longitude, v.latitude],
                            zoom: Math.max(16, mapRef.current?.getZoom() ?? 16),
                            duration: 700,
                          });
                        }}
                        className="w-full rounded-lg border p-2 text-left transition hover:bg-[#F8FBFA]"
                        style={{
                          borderColor: "rgba(6,59,59,0.06)",
                          borderLeft: `3px solid ${cor}`,
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[11.5px] font-semibold" style={{ color: "#063B3B" }}>
                            {v.equipamento}
                          </p>
                          <span
                            className="shrink-0 rounded-full px-1.5 py-[1px] text-[8px] font-bold uppercase tracking-[0.08em]"
                            style={{ background: `${cor}1A`, color: cor }}
                          >
                            {label}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[9.5px]" style={{ color: "#7A8896" }}>
                          <MapPin className="h-2.5 w-2.5" />
                          <span className="truncate">{v.municipio ?? "—"}</span>
                          <span>·</span>
                          <span className="truncate">
                            {v.tecnico_nome ? v.tecnico_nome : <em style={{ color: "#CBD5E1" }}>sem técnico</em>}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {vistoriasFiltradas.length === 0 && (
                    <p className="py-8 text-center text-[11px]" style={{ color: "#94A3B8" }}>
                      Nenhuma vistoria nesse filtro.
                    </p>
                  )}
                  {vistoriasFiltradas.length > 200 && (
                    <p className="pt-2 text-center text-[10px]" style={{ color: "#94A3B8" }}>
                      Mostrando 200 de {vistoriasFiltradas.length}. Refine a busca.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </aside>

        <section className="relative min-h-0 overflow-hidden rounded-[18px] border" style={{ borderColor: "rgba(6,59,59,0.08)" }}>
          {!token && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-[#F7F9FB]">
              <div className="text-center">
                <p className="text-[13px] font-semibold" style={{ color: "#063B3B" }}>Token Mapbox ausente</p>
                <p className="text-[11px]" style={{ color: "#7A8896" }}>Defina NEXT_PUBLIC_MAPBOX_TOKEN no .env.local</p>
              </div>
            </div>
          )}
          <div ref={mapElRef} className="h-full w-full" />

          {selectedTec && (
            <div
              className="absolute bottom-4 left-4 z-10 w-[280px] rounded-2xl border p-3"
              style={{
                background: "rgba(255,255,255,0.93)",
                backdropFilter: "blur(10px)",
                borderColor: "rgba(6,59,59,0.1)",
                boxShadow: "0 10px 28px rgba(6,59,59,0.12)",
              }}
            >
              <p className="text-[13px] font-semibold" style={{ color: "#063B3B" }}>{selectedTec.nome}</p>
              <p className="mt-0.5 text-[10.5px]" style={{ color: "#7A8896" }}>{statusLabel(selectedTec.status_operacional)}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px]">
                <MiniMetric label="Municipios" value={selectedTec.municipios_ativos} icon={<MapPin className="h-3 w-3" />} />
                <MiniMetric label="Vistorias" value={selectedTec.vistorias_ativas} icon={<Activity className="h-3 w-3" />} />
                <MiniMetric label="Revisitas" value={selectedTec.revisitas_ativas} icon={<Route className="h-3 w-3" />} />
                <MiniMetric label="Ultima" value={relTime(selectedTec.created_at)} icon={<Clock className="h-3 w-3" />} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Chip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5"
      style={{ borderColor: "rgba(6,59,59,0.08)", background: "#fff" }}
    >
      <span style={{ color: "#00B388" }}>{icon}</span>
      <span className="text-[10px]" style={{ color: "#7A8896" }}>{label}</span>
      <span className="text-[12px] font-semibold" style={{ color: "#063B3B" }}>{value}</span>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
  badge,
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
        background: active
          ? "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)"
          : "transparent",
        color: active ? "#00875F" : "#64748B",
        border: active ? "1px solid rgba(0,179,136,0.25)" : "1px solid transparent",
      }}
    >
      {icon}
      {label}
      {badge != null && badge > 0 && (
        <span
          className="rounded-full px-1.5 py-[1px] text-[9px] font-bold tabular-nums"
          style={{
            background: active ? "rgba(0,179,136,0.18)" : "rgba(6,59,59,0.06)",
            color: active ? "#00875F" : "#7A8896",
          }}
        >
          {badge >= 1000 ? `${(badge / 1000).toFixed(1)}k` : badge}
        </span>
      )}
    </button>
  );
}

function FiltroPill({
  active,
  label,
  n,
  color,
  onClick,
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
        background: active ? `${color}1A` : "#F7F9FB",
        color: active ? color : "#7A8896",
        border: `1px solid ${active ? `${color}55` : "rgba(6,59,59,0.05)"}`,
      }}
    >
      {label}
      <span
        className="rounded-full px-1 text-[9px] font-bold tabular-nums"
        style={{
          background: active ? "rgba(255,255,255,0.7)" : "rgba(6,59,59,0.04)",
        }}
      >
        {n}
      </span>
    </button>
  );
}

function MiniMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border px-2 py-1.5" style={{ borderColor: "rgba(6,59,59,0.08)", background: "#F8FAFB" }}>
      <p className="flex items-center gap-1" style={{ color: "#7A8896" }}>
        {icon}
        {label}
      </p>
      <p className="mt-0.5 font-semibold" style={{ color: "#063B3B" }}>{value}</p>
    </div>
  );
}
