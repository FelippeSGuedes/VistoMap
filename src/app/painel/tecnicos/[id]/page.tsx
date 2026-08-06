"use client";

/**
 * /painel/tecnicos/[id] — Detalhe completo de um técnico.
 *
 * Criado pra resolver "técnico dando barrigada" (diz que começou o
 * expediente em tal horário mas não tem prova): mostra o HISTÓRICO real de
 * expedientes (tabela `glpi_plugin_vistomap_expediente`, nunca sobrescrita —
 * já existia, só faltava essa tela), a trilha de GPS num mapa de calor, e a
 * auditoria de ações filtrada por esse técnico — tudo com filtro de período.
 */

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  Mail,
  MapPin,
  Navigation,
  RefreshCw,
  Smartphone,
  Timer,
} from "lucide-react";
import { api } from "@/services/api";
import { painelService } from "@/services/painel";
import { fetchInstaladoresAtivos } from "@/services/painel-instalacoes";
import { getMapboxToken, DEFAULT_CENTER } from "@/services/maps";
import { ACAO_META, initials } from "@/lib/auditMeta";
import type { AuditEntry, TecnicoAtivo } from "@/types";

/* ── helpers de data (MySQL manda "YYYY-MM-DD HH:mm:ss" sem timezone = UTC) ── */
function toDate(iso: string): Date {
  return new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
}
function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  return toDate(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
function fmtRelativo(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.round((Date.now() - toDate(iso).getTime()) / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
}
function fmtDuracao(min: number | null): string {
  if (min == null) return "em andamento";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type Periodo = "hoje" | "7d" | "30d" | "custom";

interface ExpedienteHistItem {
  id: number;
  inicio_at: string;
  fim_at: string | null;
  duracao_min: number | null;
  dispositivo_info: string | null;
  total_km: number | null;
  emAndamento: boolean;
}

interface TecnicoTodayMetrics {
  vistorias_hoje: number;
  km_hoje: number;
  tempo_medio_min: number | null;
}

export default function TecnicoDetalhePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [tecnico, setTecnico] = useState<TecnicoAtivo | null>(null);
  const [papel, setPapel] = useState<"vistoriador" | "instalador" | null>(null);
  const [historico, setHistorico] = useState<ExpedienteHistItem[]>([]);
  const [auditoria, setAuditoria] = useState<AuditEntry[]>([]);
  const [today, setToday] = useState<TecnicoTodayMetrics | null>(null);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [customDesde, setCustomDesde] = useState(() => toISODate(new Date(Date.now() - 7 * 86400_000)));
  const [customAte, setCustomAte] = useState(() => toISODate(new Date()));

  const { desde, ate } = useMemo(() => {
    const hoje = new Date();
    if (periodo === "hoje") {
      return { desde: toISODate(hoje) + " 00:00:00", ate: toISODate(hoje) + " 23:59:59" };
    }
    if (periodo === "7d") {
      return { desde: toISODate(new Date(Date.now() - 7 * 86400_000)), ate: toISODate(hoje) };
    }
    if (periodo === "30d") {
      return { desde: toISODate(new Date(Date.now() - 30 * 86400_000)), ate: toISODate(hoje) };
    }
    return { desde: customDesde, ate: customAte };
  }, [periodo, customDesde, customAte]);

  const carregar = async () => {
    if (!id) return;
    setLoading(true);
    setErro(null);
    try {
      const [tecnicos, instaladores, histRes, todayRes, trailRes, auditEntries] = await Promise.all([
        painelService.fetchTecnicos(),
        fetchInstaladoresAtivos().catch(() => [] as TecnicoAtivo[]),
        api.get<{ itens: ExpedienteHistItem[] }>(
          `/painel/expediente/historico?users_id=${id}&desde=${desde}&ate=${ate}&limit=200`
        ),
        api.get<TecnicoTodayMetrics>(`/painel/tecnico-today?users_id=${id}`),
        api.get<{ coords: [number, number][] }>(
          `/painel/tecnico-trail?users_id=${id}&desde=${desde}&ate=${ate}`
        ),
        painelService.fetchAudit({ ator_id: Number(id), limit: 200 }),
      ]);
      const vistoriador = tecnicos.find((t) => String(t.id) === String(id));
      const instalador = instaladores.find((t) => String(t.id) === String(id));
      setTecnico(vistoriador ?? instalador ?? null);
      setPapel(vistoriador ? "vistoriador" : instalador ? "instalador" : null);
      setHistorico(histRes.data.itens);
      setToday(todayRes.data);
      setTrail(trailRes.data.coords);
      setAuditoria(auditEntries);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Falha ao carregar dados do técnico.";
      setErro(msg);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [id, desde, ate]);

  /* ── mapa de calor ─────────────────────────────────────────────────── */
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const token = getMapboxToken();
    if (!token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: DEFAULT_CENTER,
      zoom: 10,
      attributionControl: false,
    });
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
      const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
        type: "FeatureCollection",
        features: trail.map(([lng, lat]) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [lng, lat] },
        })),
      };
      const src = map.getSource("vm-tecnico-heat") as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geojson);
      } else {
        map.addSource("vm-tecnico-heat", { type: "geojson", data: geojson });
        map.addLayer({
          id: "vm-tecnico-heat-layer",
          type: "heatmap",
          source: "vm-tecnico-heat",
          paint: {
            "heatmap-weight": 0.7,
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 1, 14, 2.5],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(0,179,136,0)",
              0.2, "rgba(0,179,136,0.35)",
              0.4, "rgba(94,255,217,0.55)",
              0.7, "rgba(245,158,11,0.75)",
              1, "rgba(220,38,38,0.9)",
            ],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 10, 15, 30],
            "heatmap-opacity": 0.85,
          },
        });
      }
      if (trail.length > 0) {
        const lngs = trail.map((c) => c[0]);
        const lats = trail.map((c) => c[1]);
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 40, maxZoom: 14, duration: 400 }
        );
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [trail]);

  const statusCfg: Record<TecnicoAtivo["status"], { label: string; color: string }> = {
    "em-campo": { label: "Em campo", color: "#00B388" },
    base: { label: "Na base", color: "#2563EB" },
    "off-shift": { label: "Fora de turno", color: "#94A3B8" },
    offline: { label: "Offline", color: "#94A3B8" },
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/painel/tecnicos")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition hover:bg-black/5"
          style={{ border: "1px solid var(--vm-border-soft)" }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        {tecnico ? (
          <>
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold text-white"
              style={{
                background:
                  papel === "instalador"
                    ? "linear-gradient(145deg, #A78BFA, #7C3AED)"
                    : "linear-gradient(145deg, #00B388, #00875F)",
              }}
            >
              {initials(tecnico.nome)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[18px] font-bold text-gray-900">{tecnico.nome}</h1>
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
                  style={{ background: `${statusCfg[tecnico.status].color}15`, color: statusCfg[tecnico.status].color }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusCfg[tecnico.status].color }} />
                  {statusCfg[tecnico.status].label}
                </span>
                {papel && (
                  <span
                    className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
                    style={
                      papel === "instalador"
                        ? { background: "rgba(124,58,237,0.12)", color: "#7C3AED" }
                        : { background: "var(--vm-accent-tint)", color: "#00875F" }
                    }
                  >
                    {papel === "instalador" ? "Instalador" : "Vistoriador"}
                  </span>
                )}
              </div>
              <p className="flex items-center gap-1 truncate text-[12.5px] text-gray-500">
                <Mail className="h-3 w-3" /> {tecnico.email ?? "—"}
              </p>
            </div>
          </>
        ) : (
          <div className="h-11 flex-1 animate-pulse rounded-xl bg-gray-100" />
        )}
        <button
          type="button"
          onClick={carregar}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--vm-fill)] px-3 py-2 text-[12.5px] font-semibold text-gray-600 transition hover:bg-gray-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {erro && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {erro}
        </div>
      )}

      {/* Filtro de período */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3" style={{ border: "1px solid var(--vm-border)" }}>
        <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
        {(["hoje", "7d", "30d", "custom"] as Periodo[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriodo(p)}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition"
            style={
              periodo === p
                ? { background: "#00875F", color: "#fff" }
                : { background: "var(--vm-fill)", color: "var(--vm-muted-b)" }
            }
          >
            {p === "hoje" ? "Hoje" : p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Personalizado"}
          </button>
        ))}
        {periodo === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customDesde}
              onChange={(e) => setCustomDesde(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-[12px]"
              style={{ border: "1px solid var(--vm-border-soft)" }}
            />
            <span className="text-[12px] text-gray-400">até</span>
            <input
              type="date"
              value={customAte}
              onChange={(e) => setCustomAte(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-[12px]"
              style={{ border: "1px solid var(--vm-border-soft)" }}
            />
          </div>
        )}
      </div>

      {/* Stat cards — sempre "hoje", independente do filtro de período */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Vistorias hoje" value={today?.vistorias_hoje ?? "—"} />
        <StatCard icon={<Navigation className="h-4 w-4" />} label="Km hoje" value={today ? `${today.km_hoje}` : "—"} />
        <StatCard icon={<Timer className="h-4 w-4" />} label="Tempo médio/vistoria" value={today?.tempo_medio_min != null ? `${today.tempo_medio_min}min` : "—"} />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Última atividade"
          value={tecnico ? fmtRelativo(tecnico.ultimaAtividade ?? null) : "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Histórico de expediente */}
        <div className="rounded-2xl bg-white p-4" style={{ border: "1px solid var(--vm-border)" }}>
          <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-gray-900">
            <Clock className="h-4 w-4" style={{ color: "#00B388" }} />
            Histórico de expediente ({historico.length})
          </h2>
          {historico.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-gray-400">
              Nenhum expediente registrado nesse período.
            </p>
          ) : (
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
              {historico.map((h) => (
                <div key={h.id} className="rounded-xl bg-[var(--vm-fill)] px-3 py-2.5">
                  <div className="flex items-center justify-between text-[12.5px] font-semibold text-gray-800">
                    <span>{fmtDataHora(h.inicio_at)} → {h.fim_at ? fmtDataHora(h.fim_at) : "em andamento"}</span>
                    {h.emAndamento && (
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "#E9F9F1", color: "#00875F" }}>
                        aberto
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                    <span>Duração: {fmtDuracao(h.duracao_min)}</span>
                    {h.total_km != null && h.total_km > 0 && <span>{h.total_km} km</span>}
                    {h.dispositivo_info && (
                      <span className="flex items-center gap-1">
                        <Smartphone className="h-3 w-3" /> {h.dispositivo_info}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mapa de calor */}
        <div className="rounded-2xl bg-white p-4" style={{ border: "1px solid var(--vm-border)" }}>
          <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-gray-900">
            <Flame className="h-4 w-4" style={{ color: "#F97316" }} />
            Mapa de calor — deslocamento no período
          </h2>
          {!getMapboxToken() ? (
            <div className="flex h-[380px] items-center justify-center rounded-xl bg-gray-50 text-[12.5px] text-gray-400">
              Token do Mapbox não configurado.
            </div>
          ) : (
            <div ref={mapContainerRef} className="h-[380px] w-full overflow-hidden rounded-xl" />
          )}
          {trail.length === 0 && !loading && (
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-gray-400">
              <MapPin className="h-3 w-3" /> Sem pings de GPS nesse período.
            </p>
          )}
        </div>
      </div>

      {/* Auditoria do técnico */}
      <div className="rounded-2xl bg-white p-4" style={{ border: "1px solid var(--vm-border)" }}>
        <h2 className="mb-3 text-[14px] font-bold text-gray-900">
          Auditoria deste técnico ({auditoria.length})
        </h2>
        {auditoria.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-gray-400">
            Nenhuma ação registrada nesse período.
          </p>
        ) : (
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {auditoria.map((entry) => {
              const meta = ACAO_META[entry.acao];
              const Icon = meta?.icon ?? Clock;
              return (
                <div key={entry.id} className="flex items-start gap-2.5 rounded-xl bg-[var(--vm-fill)] px-3 py-2.5">
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: meta?.bg ?? "var(--vm-tile)", color: meta?.fg ?? "#475569" }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[12.5px] font-semibold text-gray-800">
                        {meta?.label ?? entry.acao}
                        {entry.alvo?.label ? ` · ${entry.alvo.label}` : ""}
                      </p>
                      <span className="shrink-0 text-[11px] text-gray-400">{fmtDataHora(entry.timestamp)}</span>
                    </div>
                    {entry.descricao && (
                      <p className="mt-0.5 truncate text-[11.5px] text-gray-500">{entry.descricao}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-3.5" style={{ border: "1px solid var(--vm-border)" }}>
      <div className="flex items-center gap-1.5 text-gray-400">
        {icon}
        <p className="text-[10.5px] font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1.5 text-[20px] font-bold text-gray-900">{value}</p>
    </div>
  );
}
