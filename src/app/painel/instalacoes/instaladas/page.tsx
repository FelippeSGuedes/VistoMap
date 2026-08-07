"use client";

/**
 * /painel/instalacoes/instaladas — postes com instalação concluída
 * (states_id = INSTALADO). Lista histórica que só cresce — diferente de
 * Pendentes/Andamento (estado atual, sempre pequeno), aqui o total real
 * importa: a API sempre roda a mesma WHERE como COUNT(*) sem LIMIT
 * (listInstalacoesPainel + countInstalacoesPainel em
 * src/lib/glpi/instalacoes.ts), então o header nunca mostra um total
 * fictício por causa do cap da lista — mesma classe de bug já corrigida em
 * /painel/realizadas (Vistoria).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Navigation,
  RefreshCw,
  Ruler,
  Search,
  ShieldCheck,
  User,
  X,
  XCircle,
  ZoomIn,
} from "lucide-react";
import {
  fetchInstalacaoDetalhe,
  fetchInstalacaoFiles,
  fetchInstalacoesLista,
  type InstalacaoFile,
} from "@/services/painel-instalacoes";
import { DateRangeFilter, type DateRange } from "@/components/painel/DateRangeFilter";
import type { InstalacaoPainelItem } from "@/types/painel-instalacoes";
import type { Instalacao } from "@/types";

const FETCH_LIMIT = 500;
const SEARCH_DEBOUNCE_MS = 400;
const ROXO = "#7C3AED";

const CHECKLIST_LABELS: Array<{ key: keyof InstalacaoPainelItem["checklist"]; label: string }> = [
  { key: "cintaInstalada", label: "Cinta" },
  { key: "equipamentoFixado", label: "Fixação" },
  { key: "cabeamentoOrganizado", label: "Cabeamento" },
  { key: "alimentacaoValidada", label: "Alimentação" },
  { key: "equipamentoEnergizado", label: "Energizado" },
  { key: "registroFotografico", label: "Registro foto" },
];

function formatData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-[140px] animate-pulse rounded-xl" style={{ background: "var(--vm-fill-2)" }} />
      ))}
    </div>
  );
}

export default function InstalacoesInstaladasPage() {
  const [items, setItems] = useState<InstalacaoPainelItem[]>([]);
  const [optionsBase, setOptionsBase] = useState<InstalacaoPainelItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterMunicipio, setFilterMunicipio] = useState("all");
  const [filterInstalador, setFilterInstalador] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>({ de: null, ate: null });
  const [selected, setSelected] = useState<InstalacaoPainelItem | null>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items: data, total: totalReal } = await fetchInstalacoesLista({
        status: "instalado",
        limit: FETCH_LIMIT,
        municipio: filterMunicipio !== "all" ? filterMunicipio : undefined,
        instaladorId: filterInstalador !== "all" ? Number(filterInstalador) : undefined,
        query: debouncedSearch || undefined,
        desde: dateRange.de ?? undefined,
        ate: dateRange.ate ?? undefined,
      });
      setItems(data);
      setTotal(totalReal);
      if (firstLoad.current) {
        setOptionsBase(data);
        firstLoad.current = false;
      }
    } finally {
      setLoading(false);
    }
  }, [filterMunicipio, filterInstalador, debouncedSearch, dateRange]);

  useEffect(() => {
    void load();
  }, [load]);

  const municipios = Array.from(new Set(optionsBase.map((i) => i.municipio).filter(Boolean))).sort();
  const instaladores = Array.from(
    new Map(optionsBase.filter((i) => i.instalador).map((i) => [i.instalador!.id, i.instalador!.nome])).entries()
  );

  const filtrosAtivos =
    filterMunicipio !== "all" || filterInstalador !== "all" || !!debouncedSearch || !!dateRange.de || !!dateRange.ate;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--vm-text)" }}>
            Instalações Concluídas
          </h1>
          <p className="mt-0.5 text-xs" style={{ color: "var(--vm-text-muted)" }}>
            <span className="font-semibold tabular-nums" style={{ color: ROXO }}>
              {total}
            </span>{" "}
            {total === 1 ? "poste instalado" : "postes instalados"}
            {filtrosAtivos ? " (com filtros aplicados)" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          title="Atualizar agora"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm">
          <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar equipamento, endereço, PS-poste…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-gray-400"
          />
        </label>

        <div className="relative">
          <select
            value={filterMunicipio}
            onChange={(e) => setFilterMunicipio(e.target.value)}
            className="h-9 appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-[12.5px] font-medium text-gray-700 outline-none"
          >
            <option value="all">Todos os municípios</option>
            {municipios.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="relative">
          <select
            value={filterInstalador}
            onChange={(e) => setFilterInstalador(e.target.value)}
            className="h-9 appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-[12.5px] font-medium text-gray-700 outline-none"
          >
            <option value="all">Todos os instaladores</option>
            {instaladores.map(([id, nome]) => (
              <option key={id} value={String(id)}>
                {nome}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>

        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Lista */}
      {loading && items.length === 0 ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-16">
          <CheckCircle2 className="h-10 w-10 text-gray-200" />
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-400">Nenhuma instalação concluída no período</p>
            <p className="mt-0.5 text-[11px] text-gray-300">
              {filtrosAtivos ? "Ajuste os filtros para ver mais resultados" : "As instalações concluídas aparecerão aqui"}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {items.map((item) => (
            <PosteCard key={item.id} item={item} onClick={() => setSelected(item)} />
          ))}
        </div>
      )}

      {items.length >= FETCH_LIMIT && total > FETCH_LIMIT && (
        <p className="text-center text-[11.5px]" style={{ color: "var(--vm-faint)" }}>
          Mostrando os {FETCH_LIMIT} mais recentes de {total} — use os filtros pra refinar.
        </p>
      )}

      <AnimatePresence>
        {selected && <DetailDrawer item={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}

function ChecklistBadge({ label, value }: { label: string; value: boolean | null }) {
  const color = value === true ? "#00875F" : value === false ? "#DC2626" : "var(--vm-faint)";
  const bg = value === true ? "rgba(0,179,136,0.10)" : value === false ? "rgba(220,38,38,0.10)" : "var(--vm-tile)";
  const Icon = value === true ? CheckCircle2 : XCircle;
  return (
    <span
      className="flex items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-semibold"
      style={{ background: bg, color }}
    >
      {value != null && <Icon className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

function PosteCard({ item, onClick }: { item: InstalacaoPainelItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded-2xl bg-white text-left transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      <div style={{ height: 3, background: "#00B388", flexShrink: 0 }} />
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[13.5px] font-bold" style={{ color: "var(--vm-text)" }} title={item.equipamento}>
              {item.equipamento}
            </h3>
            {item.tipoEquipamento && (
              <p className="truncate text-[10.5px] font-medium" style={{ color: "var(--vm-faint)" }}>
                {item.tipoEquipamento}
              </p>
            )}
          </div>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: "var(--vm-faint)" }}>
            {formatData(item.dataInstalacao)}
          </span>
        </div>

        <div className="flex flex-col gap-1 text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
          {item.municipio && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 shrink-0" />
              {item.municipio}
            </span>
          )}
          {item.instalador ? (
            <span className="flex items-center gap-1.5">
              <User className="h-3 w-3 shrink-0" />
              {item.instalador.nome}
            </span>
          ) : (
            <span className="flex items-center gap-1.5" style={{ color: "var(--vm-faint)" }}>
              <User className="h-3 w-3 shrink-0" />
              Instalador não identificado
            </span>
          )}
          {item.validadorCpfl && (
            <span className="flex items-center gap-1.5">
              Validação CPFL: <strong>{item.validadorCpfl.status ?? "—"}</strong> ({item.validadorCpfl.nome})
            </span>
          )}
        </div>

        <div
          className="mt-3 flex flex-wrap gap-1.5 border-t pt-2.5"
          style={{ borderColor: "var(--vm-border-soft)" }}
        >
          {CHECKLIST_LABELS.map(({ key, label }) => (
            <ChecklistBadge key={key} label={label} value={item.checklist[key]} />
          ))}
        </div>
      </div>
    </button>
  );
}

/* ─── Detalhe (fotos + informações) — mesmo nível de detalhe que o
   /painel/realizadas da Vistoria já tem (drawer lateral, galeria de fotos
   com lightbox, todos os campos técnicos). Componentes próprios (não
   importa nada de src/app/painel/realizadas). ────────────────────────── */

function Row({ label, value }: { label: string; value: string | boolean | null | undefined }) {
  const display = typeof value === "boolean" ? (value ? "Sim" : "Não") : value?.trim() ? value : "—";
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 text-[12.5px] last:border-0" style={{ borderColor: "var(--vm-border-soft)" }}>
      <span style={{ color: "var(--vm-faint)" }}>{label}</span>
      <span className="text-right font-semibold" style={{ color: "var(--vm-text)" }}>{display}</span>
    </div>
  );
}

function PhotoGallery({ files, loading, onOpen }: { files: InstalacaoFile[]; loading: boolean; onOpen: (i: number) => void }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl" style={{ background: "var(--vm-tile-2)" }} />
        ))}
      </div>
    );
  }
  if (!files.length) {
    return (
      <div
        className="flex h-24 items-center justify-center gap-2 rounded-xl text-[12px]"
        style={{ background: "var(--vm-tile)", border: "1px dashed var(--vm-border)", color: "var(--vm-faint)" }}
      >
        <Camera className="h-4 w-4" /> Nenhuma foto disponível
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {files.map((f, i) => (
        <motion.button
          key={f.name}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onOpen(i)}
          className="group relative aspect-square overflow-hidden rounded-xl"
          style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.url} alt={f.name} className="h-full w-full object-cover transition group-hover:brightness-90" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
            <ZoomIn className="h-5 w-5 text-white opacity-0 drop-shadow-lg transition group-hover:opacity-100" />
          </div>
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/55 px-1.5 py-px text-[9px] font-bold text-white">{i + 1}</span>
        </motion.button>
      ))}
    </div>
  );
}

function Lightbox({ images, initialIndex, onClose }: { images: Array<{ url: string; name: string }>; initialIndex: number; onClose: () => void }) {
  const [idx, setIdx] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [images.length, onClose]);

  const cur = images[idx];
  if (!cur) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[210] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ background: "rgba(0,0,0,0.93)", backdropFilter: "blur(14px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) { setZoomed(false); onClose(); } }}
    >
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-5 py-3">
        <p className="max-w-[60vw] truncate rounded-full bg-black/40 px-3 py-1 text-[11px] font-semibold text-white/70">
          {idx + 1} / {images.length} · {cur.name}
        </p>
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25">
          <X className="h-4 w-4" />
        </button>
      </div>

      {idx > 0 && (
        <button
          onClick={() => { setIdx((i) => i - 1); setZoomed(false); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      <motion.div
        key={idx}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        className={zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}
        style={{ transform: zoomed ? "scale(1.65)" : "scale(1)", transition: "transform 0.28s ease" }}
        onClick={() => setZoomed((z) => !z)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cur.url} alt={cur.name} className="max-h-[80vh] max-w-[88vw] rounded-xl object-contain shadow-2xl" draggable={false} />
      </motion.div>

      {idx < images.length - 1 && (
        <button
          onClick={() => { setIdx((i) => i + 1); setZoomed(false); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {images.length > 1 && (
        <div className="absolute bottom-4 flex max-w-[90vw] gap-1.5 overflow-x-auto rounded-2xl bg-black/50 p-2 backdrop-blur-sm">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setIdx(i); setZoomed(false); }}
              className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg transition-all"
              style={{ outline: i === idx ? `2px solid ${ROXO}` : "2px solid transparent", outlineOffset: 1, opacity: i === idx ? 1 : 0.55 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function DetailDrawer({ item, onClose }: { item: InstalacaoPainelItem; onClose: () => void }) {
  const [detalhe, setDetalhe] = useState<Instalacao | null>(null);
  const [detalheLoading, setDetalheLoading] = useState(true);
  const [files, setFiles] = useState<InstalacaoFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setDetalheLoading(true);
    setFilesLoading(true);
    fetchInstalacaoDetalhe(item.id)
      .then((d) => { if (alive) setDetalhe(d); })
      .finally(() => { if (alive) setDetalheLoading(false); });
    fetchInstalacaoFiles(item.id)
      .then((r) => { if (alive) setFiles(r.items.filter((f) => f.kind === "image")); })
      .finally(() => { if (alive) setFilesLoading(false); });
    return () => { alive = false; };
  }, [item.id]);

  const ctx = detalhe?.contexto;

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[200] bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed right-0 top-0 z-[201] flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.28, ease: [0.22, 0.7, 0.2, 1] }}
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--vm-border-soft)" }}>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="rounded-full px-2 py-[2px] text-[9.5px] font-bold uppercase tracking-wide" style={{ background: "rgba(0,179,136,0.12)", color: "#00875F" }}>
                {item.statusGeralNome ?? "Instalada"}
              </span>
              <span className="text-[11px]" style={{ color: "var(--vm-faint)" }}>{formatData(item.dataInstalacao)}</span>
            </div>
            <h2 className="truncate text-[16px] font-bold" style={{ color: "var(--vm-text)" }}>{item.equipamento}</h2>
            {item.tipoEquipamento && <p className="text-[11.5px]" style={{ color: "var(--vm-faint)" }}>{item.tipoEquipamento}</p>}
          </div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5" style={{ color: "var(--vm-faint)" }}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>Registro fotográfico</h3>
            <PhotoGallery files={files} loading={filesLoading} onOpen={setLightboxIndex} />
          </section>

          <section>
            <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
              <MapPin className="h-3 w-3" /> Localização
            </h3>
            <Row label="Município" value={item.municipio} />
            <Row label="Endereço" value={item.endereco} />
            <Row label="Latitude" value={detalheLoading ? undefined : detalhe?.latitude != null ? String(detalhe.latitude) : "—"} />
            <Row label="Longitude" value={detalheLoading ? undefined : detalhe?.longitude != null ? String(detalhe.longitude) : "—"} />
            {detalhe?.latitude != null && detalhe?.longitude != null && (
              <a
                href={`https://www.google.com/maps?q=${detalhe.latitude},${detalhe.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold"
                style={{ color: ROXO }}
              >
                <Navigation className="h-3 w-3" /> Abrir no mapa
              </a>
            )}
          </section>

          <section>
            <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
              <Ruler className="h-3 w-3" /> Detalhes técnicos
            </h3>
            <Row label="PS-Poste" value={item.psPoste} />
            <Row label="Altura do poste" value={item.alturaPoste} />
            <Row label="Formato" value={ctx?.formato} />
            <Row label="Material" value={ctx?.material} />
            <Row label="Alimentação" value={ctx?.alimentacao} />
            <Row label="Local de instalação" value={ctx?.localInstalacao} />
            <Row label="DAN" value={ctx?.dan} />
            <Row label="Chave" value={ctx?.chave} />
            <Row label="Rede primária" value={ctx?.redePrimaria} />
            <Row label="Rede secundária" value={ctx?.redeSecundaria} />
            <Row label="Religador" value={ctx?.religador} />
            <Row label="Transformador" value={ctx?.transformador} />
            <Row label="Instalação de TP" value={ctx?.instalarTp} />
            <Row label="Aterramento" value={ctx?.aterramento} />
            <Row label="Tensão identificada" value={detalhe?.checklist.tensaoIdentificada} />
          </section>

          <section>
            <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
              <ShieldCheck className="h-3 w-3" /> Checklist de instalação
            </h3>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CHECKLIST_LABELS.map(({ key, label }) => (
                <ChecklistBadge key={key} label={label} value={item.checklist[key]} />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
              <User className="h-3 w-3" /> Instalador
            </h3>
            <Row label="Nome" value={item.instalador?.nome} />
            <Row label="Empresa" value={detalhe?.empresa} />
            <Row label="Data da instalação" value={formatData(item.dataInstalacao)} />
            {item.validadorCpfl && (
              <>
                <Row label="Validador CPFL" value={item.validadorCpfl.nome} />
                <Row label="Status da validação" value={item.validadorCpfl.status} />
              </>
            )}
          </section>

          {ctx?.observacao && (
            <section>
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>Observações</h3>
              <p className="rounded-xl p-3 text-[12.5px] italic" style={{ background: "var(--vm-tile)", color: "var(--vm-muted)" }}>
                "{ctx.observacao}"
              </p>
            </section>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {lightboxIndex != null && (
          <Lightbox images={files} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
