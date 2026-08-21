"use client";

/**
 * Converte path absoluto do filesystem no `file` relativo que a API espera
 * (/api/painel/pdf?file=...). NÃO monta a URL final pra navegação direta —
 * a rota exige o header Authorization (Bearer), que um <a href target=_blank>
 * nunca envia (é navegação de browser pura, sem os headers do axios). Por
 * isso todo mundo, mesmo logado, caía em "Não autenticado" ao clicar no PDF
 * CPFL Gerado (achado em produção 2026-08-21) — o fix é buscar o PDF via
 * `api` (que já injeta o Bearer no interceptor) como blob, e abrir esse blob
 * numa aba nova, em vez de deixar o browser navegar direto pra rota.
 */
function pdfFileParam(dbPath: string): string {
  const FILES_BASE = "/var/www/html/glpi/plugins/vistomapprojetos/files/";
  return dbPath.startsWith(FILES_BASE)
    ? dbPath.slice(FILES_BASE.length)
    : dbPath.replace(/^.*\/files\//, "");
}

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  RefreshCw,
  Search,
  Signal,
  User,
  X,
  ZoomIn,
} from "lucide-react";
import { painelService } from "@/services/painel";
import { api } from "@/services/api";
import { asset } from "@/utils/asset";
import { DateRangeFilter, dentroDoRange, type DateRange } from "@/components/painel/DateRangeFilter";
import type { VistoriaRealizada, VistoriaFile, VistoriasRealizadasStats as PainelServiceRealizadasStats } from "@/services/painel";

/* ─── helpers ────────────────────────────────────────────────────── */

function relativo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.round(h / 24);
  return `${d}d atrás`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function initials(nome: string): string {
  const p = nome.trim().split(/[\s._-]+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

/* ─── design constants ────────────────────────────────────────────── */

const STATUS_CFG = {
  VISTORIADO: {
    label:  "Vistoriado",
    color:  "#059669",
    bg:     "#D1FAE5",
    border: "#6EE7B7",
    strip:  "linear-gradient(135deg,#059669,#34D399)",
    glow:   "rgba(5,150,105,0.15)",
  },
  REVISITADO: {
    label:  "Revisitado",
    color:  "#7C3AED",
    bg:     "var(--vm-tile-purple)",
    border: "#C4B5FD",
    strip:  "linear-gradient(135deg,#7C3AED,#A78BFA)",
    glow:   "rgba(124,58,237,0.15)",
  },
} as const;

const PDF_CFG = {
  GERADO:   { label: "PDF Gerado",   color: "#2563EB", bg: "#EFF6FF", icon: FileText },
  PENDENTE: { label: "PDF Pendente", color: "#D97706", bg: "var(--vm-amber-100)", icon: Clock },
  ERRO:     { label: "PDF Erro",     color: "#DC2626", bg: "var(--vm-red-tint)", icon: AlertTriangle },
} as const;

/* ─── atoms ──────────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div
      className="animate-pulse overflow-hidden rounded-2xl bg-white"
      style={{ border: "1px solid var(--vm-border)" }}
    >
      <div className="h-1.5 rounded-t-2xl bg-gray-200" />
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-16 rounded bg-gray-100" />
            <div className="h-4 w-3/4 rounded-lg bg-gray-200" />
            <div className="h-3 w-1/2 rounded bg-gray-100" />
          </div>
          <div className="h-5 w-20 rounded-full bg-gray-100" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-gray-200" />
          <div className="h-3.5 w-24 rounded bg-gray-100" />
        </div>
        <div className="h-px bg-gray-100" />
        <div className="flex gap-2">
          <div className="h-5 w-20 rounded-full bg-gray-100" />
          <div className="h-5 w-16 rounded-full bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status, isRepeat, size = "sm",
}: {
  status: VistoriaRealizada["status"];
  isRepeat: boolean;
  size?: "sm" | "md";
}) {
  const cfg = STATUS_CFG[status];
  const cls = size === "md"
    ? "px-2.5 py-1 text-[11px]"
    : "px-2 py-0.5 text-[10.5px]";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-full font-bold ${cls}`}
        style={{ background: cfg.bg, color: cfg.color }}
      >
        <CheckCircle2 className="h-3 w-3" />
        {cfg.label}
      </span>
      {isRepeat && (
        <span
          className={`inline-flex items-center gap-1 rounded-full font-bold ${cls}`}
          style={{ background: "var(--vm-tile-purple)", color: "#7C3AED" }}
        >
          <RefreshCw className="h-2.5 w-2.5" />
          Revisita
        </span>
      )}
    </span>
  );
}

function PDFBadge({
  projectStatus,
}: {
  projectStatus: VistoriaRealizada["projectStatus"];
}) {
  const cfg = PDF_CFG[projectStatus] ?? PDF_CFG.PENDENTE;
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

function TecnicoAvatar({
  nome, size = "sm",
}: {
  nome: string;
  size?: "sm" | "md" | "lg";
}) {
  const cls =
    size === "lg" ? "h-11 w-11 text-[13px]" :
    size === "md" ? "h-8 w-8 text-[11px]" :
    "h-7 w-7 text-[10px]";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${cls}`}
      style={{
        background: "linear-gradient(135deg,#00B388,#00875F)",
        boxShadow: "0 2px 8px rgba(0,179,136,0.3)",
      }}
    >
      {initials(nome)}
    </span>
  );
}

/* ─── ExecutionTimeline ───────────────────────────────────────────── */

function ExecutionTimeline({
  dataVistoria, dataEnvio, approvedAt,
}: {
  dataVistoria: string | null;
  dataEnvio: string | null;
  approvedAt: string | null;
}) {
  const events = [
    { label: "Realizada",     date: dataVistoria, color: "#059669", ring: "rgba(5,150,105,0.2)"  },
    { label: "Enviada CPFL",  date: dataEnvio,    color: "#2563EB", ring: "rgba(37,99,235,0.2)"  },
    { label: "Aprovada",      date: approvedAt,   color: "#7C3AED", ring: "rgba(124,58,237,0.2)" },
  ].filter(e => e.date);

  if (!events.length) {
    return <p className="text-[11px] text-[var(--vm-faint)]">Sem dados de timeline.</p>;
  }

  return (
    <div className="relative flex flex-col gap-4">
      <div
        className="absolute left-[7px] bottom-2 top-2 w-px"
        style={{ background: "linear-gradient(to bottom,#059669,#2563EB,#7C3AED)" }}
      />
      {events.map((e, i) => (
        <motion.div
          key={i}
          className="relative flex items-start gap-4"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
        >
          <span
            className="relative z-10 mt-0.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-white"
            style={{
              background: e.color,
              boxShadow: `0 0 0 3px ${e.ring}`,
            }}
          />
          <div>
            <p className="text-[12px] font-semibold text-[var(--vm-text-soft)]">{e.label}</p>
            <p className="text-[11px] text-[var(--vm-faint)]">{fmtDateTime(e.date)}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ─── Lightbox ────────────────────────────────────────────────────── */

function Lightbox({
  images, initialIndex, onClose,
}: {
  images: Array<{ url: string; name: string }>;
  initialIndex: number;
  onClose: () => void;
}) {
  const [idx,    setIdx]    = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape")      onClose();
      if (e.key === "ArrowLeft")   setIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight")  setIdx(i => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [images.length, onClose]);

  const cur = images[idx];
  if (!cur) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[110] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ background: "rgba(0,0,0,0.93)", backdropFilter: "blur(14px)" }}
      onClick={e => { if (e.target === e.currentTarget) { setZoomed(false); onClose(); } }}
    >
      {/* top bar */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-5 py-3">
        <p className="max-w-[60vw] truncate rounded-full bg-black/40 px-3 py-1 text-[11px] font-semibold text-white/70">
          {idx + 1} / {images.length} · {cur.name}
        </p>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* prev */}
      {idx > 0 && (
        <button
          onClick={() => { setIdx(i => i - 1); setZoomed(false); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      {/* image */}
      <motion.div
        key={idx}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        className={zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}
        style={{ transform: zoomed ? "scale(1.65)" : "scale(1)", transition: "transform 0.28s ease" }}
        onClick={() => setZoomed(z => !z)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cur.url}
          alt={cur.name}
          className="max-h-[80vh] max-w-[88vw] rounded-xl object-contain shadow-2xl"
          draggable={false}
        />
      </motion.div>

      {/* next */}
      {idx < images.length - 1 && (
        <button
          onClick={() => { setIdx(i => i + 1); setZoomed(false); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {/* thumbnails */}
      {images.length > 1 && (
        <div className="absolute bottom-4 flex max-w-[90vw] gap-1.5 overflow-x-auto rounded-2xl bg-black/50 p-2 backdrop-blur-sm">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setIdx(i); setZoomed(false); }}
              className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg transition-all"
              style={{
                outline: i === idx ? "2px solid #00B388" : "2px solid transparent",
                outlineOffset: 1,
                opacity: i === idx ? 1 : 0.55,
              }}
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

/* ─── PhotoGallery ────────────────────────────────────────────────── */

function PhotoGallery({
  files, loading, onOpen,
}: {
  files: VistoriaFile[];
  loading: boolean;
  onOpen: (i: number) => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl bg-[var(--vm-tile-2)]" />
        ))}
      </div>
    );
  }
  if (!files.length) {
    return (
      <div
        className="flex h-24 items-center justify-center gap-2 rounded-xl text-[12px] text-[var(--vm-faint)]"
        style={{ background: "var(--vm-tile)", border: "1px dashed var(--vm-border)" }}
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
          className="group relative aspect-square overflow-hidden rounded-xl bg-[var(--vm-tile-2)]"
          style={{ border: "1px solid var(--vm-border)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.url} alt={f.name} className="h-full w-full object-cover transition group-hover:brightness-90" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
            <ZoomIn className="h-5 w-5 text-white opacity-0 drop-shadow-lg transition group-hover:opacity-100" />
          </div>
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/55 px-1.5 py-px text-[9px] font-bold text-white">
            {i + 1}
          </span>
        </motion.button>
      ))}
    </div>
  );
}

/* ─── VistoriaCard ────────────────────────────────────────────────── */

function VistoriaCard({
  item, onClick, index,
}: {
  item: VistoriaRealizada;
  onClick: () => void;
  index: number;
}) {
  const cfg = STATUS_CFG[item.status];
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: Math.min(index * 0.035, 0.25), duration: 0.28 }}
      whileHover={{ y: -4, boxShadow: `0 16px 40px ${cfg.glow}, 0 4px 16px rgba(0,0,0,0.07)` }}
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-2xl bg-white dark:bg-black"
      style={{ border: `1px solid var(--vm-border)`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      {/* fundo — imagem clara/escura conforme o tema */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat dark:hidden"
        style={{ backgroundImage: `url('${asset("/cardconwhi.png")}')` }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 hidden bg-cover bg-center bg-no-repeat dark:block"
        style={{ backgroundImage: `url('${asset("/cardconbla.png")}')` }}
      />
      {/* véu — camada sólida preta/branca, opacidade alta o bastante pro
          texto ficar sempre legível por cima */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-white/88 dark:bg-black/88" />

      <div className="relative z-10">
        {/* colored top strip */}
        <div style={{ height: 3, background: cfg.strip, flexShrink: 0 }} />

        <div className="p-4">
          {/* row 1: id + pdf badge */}
          <div className="mb-2.5 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p
                className="mb-0.5 text-[10.5px] font-bold uppercase tracking-wider"
                style={{ color: cfg.color }}
              >
                {item.glpiId}
                {item.isRepeat && (
                  <span className="ml-1.5 text-violet-500">· REVISITA</span>
                )}
                {item.tipoEquipamento?.trim().toLowerCase() === "repetidor" && (
                  <span
                    className="ml-1.5"
                    style={{ color: "#B45309" }}
                    title="Repetidor — provável zona rural / baixa cobertura"
                  >
                    · 📡 RURAL
                  </span>
                )}
              </p>
              <h3
                className="truncate text-[14.5px] font-bold text-[var(--vm-text)] transition-colors group-hover:text-[#059669]"
                title={item.equipamento}
              >
                {item.equipamento}
              </h3>
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] text-[var(--vm-muted)]">
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                {item.municipio}
                {item.endereco && (
                  <span className="truncate opacity-70"> · {item.endereco}</span>
                )}
              </p>
            </div>
            <PDFBadge projectStatus={item.projectStatus} />
          </div>

          {/* row 2: technician */}
          {item.tecnico ? (
            <div className="mb-3 flex items-center gap-2">
              <TecnicoAvatar nome={item.tecnico.nome} />
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold text-[var(--vm-text-soft)]">
                  {item.tecnico.nome.split(" ")[0]}
                </p>
                <p className="text-[10.5px] text-[var(--vm-faint)]">{relativo(item.dataVistoria)}</p>
              </div>
            </div>
          ) : (
            <div className="mb-3 flex items-center gap-1.5 text-[11.5px] text-[var(--vm-faint)]">
              <User className="h-3.5 w-3.5" /> Sem técnico
            </div>
          )}

          <div className="h-px bg-[var(--vm-tile-2)]" />

          {/* row 3: status + date */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <StatusBadge status={item.status} isRepeat={false} />
            <span className="shrink-0 text-[10.5px] text-[#D1D5DB]">
              {fmtDate(item.dataVistoria)}
            </span>
          </div>

          {/* hover CTA */}
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            whileHover={{ opacity: 1 }}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-bold opacity-0 transition-all group-hover:opacity-100"
            style={{ background: "var(--vm-teal-tint)", color: "#059669" }}
          >
            Ver detalhes e fotos →
          </motion.div>
        </div>
      </div>
    </motion.article>
  );
}

/* ─── DetailDrawer ────────────────────────────────────────────────── */

function DetailDrawer({
  item, onClose,
}: {
  item: VistoriaRealizada;
  onClose: () => void;
}) {
  const [files,        setFiles]        = useState<VistoriaFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [lightboxIdx,  setLightboxIdx]  = useState<number | null>(null);
  const [abrindoPdf,   setAbrindoPdf]   = useState(false);
  const [erroPdf,      setErroPdf]      = useState(false);

  async function abrirPdf(dbPath: string) {
    setErroPdf(false);
    setAbrindoPdf(true);
    try {
      const r = await api.get("/painel/pdf", {
        params: { file: pdfFileParam(dbPath) },
        responseType: "blob",
      });
      const blobUrl = URL.createObjectURL(r.data as Blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      setErroPdf(true);
    } finally {
      setAbrindoPdf(false);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoadingFiles(true);
    setFiles([]);
    painelService.fetchVistoriaFiles(item.id)
      .then(r => { if (alive) { setFiles(r.items.filter(f => f.kind === "image")); setLoadingFiles(false); } })
      .catch(() => { if (alive) setLoadingFiles(false); });
    return () => { alive = false; };
  }, [item.id]);

  const cfg    = STATUS_CFG[item.status];
  const images = files.map(f => ({ url: f.url, name: f.name }));

  return (
    <>
      {/* backdrop */}
      <motion.div
        className="fixed inset-0 z-40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ background: "rgba(0,0,0,0.38)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* drawer panel */}
      <motion.aside
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[680px] flex-col overflow-y-auto bg-white shadow-2xl"
        initial={{ x: 700 }}
        animate={{ x: 0 }}
        exit={{ x: 700 }}
        transition={{ type: "spring", damping: 30, stiffness: 280 }}
        style={{ boxShadow: "-8px 0 40px rgba(0,0,0,0.14)" }}
      >
        {/* sticky header */}
        <div
          className="sticky top-0 z-10 shrink-0 px-6 py-5"
          style={{
            background: "linear-gradient(135deg,#0f172a 0%,#1e293b 55%,#134e4a 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p
                className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: cfg.color }}
              >
                {item.glpiId} · Detalhe da Execução
              </p>
              <h2 className="text-[17px] font-bold leading-tight text-white">
                {item.equipamento}
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusBadge status={item.status} isRepeat={item.isRepeat} size="md" />
                <PDFBadge projectStatus={item.projectStatus} />
                {item.tipoEquipamento?.trim().toLowerCase() === "repetidor" && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                    style={{ background: "rgba(251,191,36,0.18)", color: "#B45309" }}
                    title="Equipamento tipo Repetidor — provável zona rural / baixa cobertura de rede"
                  >
                    📡 Repetidor · zona rural
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70 transition hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* scrollable body */}
        <div className="flex flex-col gap-5 px-6 py-5">

          {/* ── fotos ── */}
          <section>
            <SectionLabel>Galeria de Fotos</SectionLabel>
            <PhotoGallery
              files={files}
              loading={loadingFiles}
              onOpen={i => setLightboxIdx(i)}
            />
          </section>

          {/* ── timeline ── */}
          <section
            className="rounded-2xl p-4"
            style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-tile-2)" }}
          >
            <SectionLabel>Linha do Tempo</SectionLabel>
            <ExecutionTimeline
              dataVistoria={item.dataVistoria}
              dataEnvio={item.dataEnvio}
              approvedAt={item.approvedAt}
            />
          </section>

          {/* ── técnico ── */}
          {item.tecnico && (
            <section
              className="flex items-center gap-3 rounded-2xl p-4"
              style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-tile-2)" }}
            >
              <TecnicoAvatar nome={item.tecnico.nome} size="lg" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--vm-faint)]">
                  Técnico Responsável
                </p>
                <p className="mt-0.5 text-[15px] font-bold text-[var(--vm-text)]">
                  {item.tecnico.nome}
                </p>
              </div>
            </section>
          )}

          {/* ── localização ── */}
          <section
            className="rounded-2xl p-4"
            style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-tile-2)" }}
          >
            <SectionLabel>Localização</SectionLabel>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#059669]" />
              <div>
                <p className="text-[13px] font-semibold text-[var(--vm-text-soft)]">
                  {item.municipio}
                </p>
                {item.endereco && (
                  <p className="mt-0.5 text-[12px] text-[var(--vm-muted)]">{item.endereco}</p>
                )}
                {item.latitude != null && item.longitude != null && (
                  <p className="mt-1 font-mono text-[10.5px] text-[var(--vm-faint)]">
                    {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ── detalhes técnicos ── */}
          {(item.alturaAntena || item.aterramento || item.rsrpClaro || item.rsrpVivo || item.observacao || item.motivo) && (
            <section
              className="rounded-2xl p-4"
              style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-tile-2)" }}
            >
              <SectionLabel>Detalhes Técnicos</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {item.alturaAntena && (
                  <DetailChip label="Altura Antena" value={item.alturaAntena} />
                )}
                {item.aterramento && (
                  <DetailChip label="Aterramento" value={item.aterramento} />
                )}
                {item.rsrpClaro && (
                  <DetailChip label="RSRP Claro" value={item.rsrpClaro} icon={<Signal className="h-3 w-3" />} />
                )}
                {item.rsrpVivo && (
                  <DetailChip label="RSRP Vivo" value={item.rsrpVivo} icon={<Signal className="h-3 w-3" />} />
                )}
              </div>
              {item.observacao && (
                <div
                  className="mt-2 rounded-xl p-3"
                  style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}
                >
                  <p className="mb-1 text-[9.5px] font-bold uppercase tracking-wider text-[var(--vm-faint)]">
                    Observações
                  </p>
                  <p className="text-[12.5px] leading-relaxed text-[var(--vm-text-soft)]">
                    {item.observacao}
                  </p>
                </div>
              )}
              {item.motivo && item.isRepeat && (
                <div
                  className="mt-2 rounded-xl p-3"
                  style={{ background: "var(--vm-orange-tint)", border: "1px solid #FED7AA" }}
                >
                  <p className="mb-1 text-[9.5px] font-bold uppercase tracking-wider text-amber-600">
                    Motivo da Revisita
                  </p>
                  <p className="text-[12.5px] leading-relaxed text-amber-800">
                    {item.motivo}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ── pdf ── */}
          {item.pdfPath ? (
            <button
              type="button"
              disabled={abrindoPdf}
              onClick={() => abrirPdf(item.pdfPath!)}
              className="flex w-full items-center justify-between rounded-2xl p-4 text-left transition disabled:opacity-70"
              style={{
                background: erroPdf ? "var(--vm-red-tint)" : "#EFF6FF",
                border: erroPdf ? "1px solid #FECACA" : "1px solid #BFDBFE",
              }}
              onMouseEnter={e => { if (!erroPdf) (e.currentTarget as HTMLElement).style.background = "#DBEAFE"; }}
              onMouseLeave={e => { if (!erroPdf) (e.currentTarget as HTMLElement).style.background = "#EFF6FF"; }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: erroPdf ? "rgba(220,38,38,0.1)" : "rgba(37,99,235,0.1)" }}
                >
                  {abrindoPdf ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-[#2563EB]" />
                  ) : (
                    <FileText className="h-5 w-5" style={{ color: erroPdf ? "#DC2626" : "#2563EB" }} />
                  )}
                </span>
                <div>
                  <p className="text-[13px] font-bold" style={{ color: erroPdf ? "#B91C1C" : "#1E40AF" }}>
                    PDF CPFL Gerado
                  </p>
                  <p className="text-[10.5px]" style={{ color: erroPdf ? "#DC2626" : "#3B82F6" }}>
                    {abrindoPdf
                      ? "Abrindo…"
                      : erroPdf
                      ? "Falha ao abrir — tente de novo"
                      : "Clique para abrir em nova aba"}
                  </p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4" style={{ color: erroPdf ? "#DC2626" : "#3B82F6" }} />
            </button>
          ) : (
            <div
              className="flex items-center gap-3 rounded-2xl p-4"
              style={{ background: "var(--vm-warm-tint)", border: "1px solid #FDE68A" }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                <Clock className="h-5 w-5 text-amber-600" />
              </span>
              <div>
                <p className="text-[13px] font-bold text-amber-800">
                  {item.projectStatus === "ERRO" ? "Erro ao gerar PDF" : "PDF em processamento"}
                </p>
                <p className="text-[10.5px] text-amber-600">
                  {item.projectStatus === "ERRO"
                    ? "Verifique os logs do worker"
                    : "Worker irá processar em breve"}
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.aside>

      {/* lightbox */}
      <AnimatePresence>
        {lightboxIdx !== null && (
          <Lightbox
            images={images}
            initialIndex={lightboxIdx}
            onClose={() => setLightboxIdx(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── micro-components ────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vm-faint)]">
      {children}
    </p>
  );
}

function DetailChip({
  label, value, icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-2.5"
      style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}
    >
      <p className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-[var(--vm-faint)]">
        {icon} {label}
      </p>
      <p className="mt-0.5 text-[13px] font-semibold text-[var(--vm-text-soft)]">{value}</p>
    </div>
  );
}

/* ─── StatPill ────────────────────────────────────────────────────── */

function StatPill({
  label, value, color, bg,
}: {
  label: string; value: number; color: string; bg: string;
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: bg, border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-white/40">{label}</p>
      <p
        className="mt-1 text-[22px] font-bold leading-none tabular-nums"
        style={{ color }}
      >
        {value}
      </p>
    </div>
  );
}

/* ─── PAGE ────────────────────────────────────────────────────────── */

// Página fixa alta o bastante pra cobrir o uso real (era 100 por padrão —
// silenciosamente truncava a lista e o card de "resultados" mostrava esse
// limite como se fosse o total verdadeiro). Os totais dos cards, porém, NUNCA
// vêm de items.length — vêm de `serverStats` (contagem real, sem LIMIT).
const PAGE_FETCH_LIMIT = 2000;

export default function RealizadasPage() {
  const [items,        setItems]        = useState<VistoriaRealizada[]>([]);
  const [serverStats,  setServerStats]  = useState<PainelServiceRealizadasStats>({ total: 0, vistoriados: 0, revisitados: 0, pdfsGerados: 0 });
  const [loading,      setLoading]      = useState(true);
  const [apiError,     setApiError]     = useState<string | null>(null);
  const [selected,     setSelected]     = useState<VistoriaRealizada | null>(null);
  const [q,            setQ]            = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "VISTORIADO" | "REVISITADO">("");
  const [filterPDF,    setFilterPDF]    = useState<"" | "GERADO" | "PENDENTE" | "ERRO">("");
  const [dateRange,    setDateRange]    = useState<DateRange>({ de: null, ate: null });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { items: data, stats } = await painelService.fetchRealizadas({ limit: PAGE_FETCH_LIMIT });
        if (alive) { setItems(data); setServerStats(stats); setApiError(null); setLoading(false); }
      } catch (err: unknown) {
        const axiosBody = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        const msg = axiosBody ?? (err instanceof Error ? err.message : String(err));
        if (alive) { setApiError(msg); setLoading(false); }
      }
    };
    load();
    const poll = window.setInterval(load, 30_000);
    return () => { alive = false; clearInterval(poll); };
  }, []);

  const filtered = useMemo(() => {
    let r = items;
    const lq = q.trim().toLowerCase();
    if (lq) {
      r = r.filter(i =>
        i.equipamento.toLowerCase().includes(lq) ||
        i.municipio.toLowerCase().includes(lq) ||
        i.glpiId.toLowerCase().includes(lq) ||
        (i.tecnico?.nome.toLowerCase().includes(lq) ?? false)
      );
    }
    if (filterStatus) r = r.filter(i => i.status === filterStatus);
    if (filterPDF)    r = r.filter(i => i.projectStatus === filterPDF);
    if (dateRange.de || dateRange.ate) r = r.filter(i => dentroDoRange(i.dataVistoria, dateRange));
    return r;
  }, [items, q, filterStatus, filterPDF, dateRange]);

  // Só entra em uso quando NENHUM filtro está ativo — com filtro, os cards
  // mostram a contagem do resultado filtrado (client-side, sobre a página
  // carregada); sem filtro, mostram o total real do banco.
  const semFiltro = !q.trim() && !filterStatus && !filterPDF && !dateRange.de && !dateRange.ate;
  const stats = semFiltro
    ? serverStats
    : {
        total:       filtered.length,
        vistoriados: filtered.filter(i => i.status === "VISTORIADO").length,
        revisitados: filtered.filter(i => i.status === "REVISITADO").length,
        pdfsGerados: filtered.filter(i => i.projectStatus === "GERADO").length,
      };

  return (
    <div className="space-y-5">

      {/* ── PAGE HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl">
        {/* imagens de fundo — clara/escura conforme o tema do painel */}
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat dark:hidden"
          style={{ backgroundImage: `url('${asset("/visrealizwht.png")}')` }}
        />
        <div
          className="pointer-events-none absolute inset-0 hidden bg-cover bg-center bg-no-repeat dark:block"
          style={{ backgroundImage: `url('${asset("/visrealizbl.png")}')` }}
        />
        {/* véu — mesmo gradiente "hero" de antes, agora semi-transparente
            por cima da imagem, garantindo o contraste do texto branco */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(135deg,rgba(15,23,42,0.88) 0%,rgba(30,41,59,0.88) 55%,rgba(19,78,74,0.88) 100%)" }}
        />

        <div className="relative px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-block h-px w-8 bg-emerald-400" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                  Auditoria
                </span>
              </div>
              <h1 className="text-[22px] font-bold leading-tight text-white">
                Vistorias Realizadas
              </h1>
              <p className="mt-1 text-[12px] text-white/45">
                Histórico completo · fotos · PDFs · linha do tempo de execução
              </p>
            </div>
            {!loading && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold text-emerald-400"
                style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.2)" }}
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {stats.total} registros
              </motion.span>
            )}
          </div>

          {/* stats strip */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatPill label="Total"       value={stats.total}       color="#34D399" bg="rgba(52,211,153,0.10)" />
            <StatPill label="Vistoriados" value={stats.vistoriados} color="#34D399" bg="rgba(52,211,153,0.10)" />
            <StatPill label="Revisitados" value={stats.revisitados} color="#A78BFA" bg="rgba(167,139,250,0.10)" />
            <StatPill label="PDFs Gerados" value={stats.pdfsGerados} color="#60A5FA" bg="rgba(96,165,250,0.10)" />
          </div>
        </div>
      </div>

      {/* ── ERROR BANNER ── */}
      {apiError && (
        <div
          className="flex items-start gap-3 rounded-2xl px-5 py-4"
          style={{ background: "var(--vm-red-tint)", border: "1px solid #FECACA" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-red-700">Falha ao carregar vistorias realizadas</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-red-500">{apiError}</p>
          </div>
        </div>
      )}

      {/* ── FILTER BAR ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* search */}
        <div
          className="flex h-9 min-w-[200px] flex-1 max-w-[380px] items-center gap-2 rounded-xl px-3"
          style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--vm-faint)]" />
          <input
            type="text"
            placeholder="Buscar equipamento, técnico, município…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="flex-1 bg-transparent text-[12px] text-[var(--vm-text-soft)] outline-none placeholder:text-[#D1D5DB]"
          />
          {q && (
            <button onClick={() => setQ("")} className="text-[var(--vm-faint)] hover:text-[var(--vm-text-soft)]">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* status filter */}
        <div
          className="flex items-center rounded-xl p-0.5"
          style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)" }}
        >
          {(["", "VISTORIADO", "REVISITADO"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all"
              style={{
                background: filterStatus === s ? "var(--vm-card)" : "transparent",
                color: filterStatus === s
                  ? (s === "REVISITADO" ? "#7C3AED" : s === "VISTORIADO" ? "#059669" : "var(--vm-text-soft)")
                  : "var(--vm-faint)",
                boxShadow: filterStatus === s ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {s === "" ? "Todos" : s === "VISTORIADO" ? "Vistoriado" : "Revisitado"}
            </button>
          ))}
        </div>

        {/* pdf filter */}
        <div
          className="flex items-center rounded-xl p-0.5"
          style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)" }}
        >
          {(["", "GERADO", "PENDENTE", "ERRO"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterPDF(s)}
              className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all"
              style={{
                background: filterPDF === s ? "var(--vm-card)" : "transparent",
                color: filterPDF === s
                  ? (s === "GERADO" ? "#2563EB" : s === "ERRO" ? "#DC2626" : s === "PENDENTE" ? "#D97706" : "var(--vm-text-soft)")
                  : "var(--vm-faint)",
                boxShadow: filterPDF === s ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {s === "" ? "PDF: Todos" : `PDF: ${s[0]}${s.slice(1).toLowerCase()}`}
            </button>
          ))}
        </div>

        <DateRangeFilter value={dateRange} onChange={setDateRange} />

        {/* result count */}
        {!loading && (q || filterStatus || filterPDF || dateRange.de || dateRange.ate) && (
          <span className="ml-auto text-[11px] text-[var(--vm-faint)]">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── CARD GRID ── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center rounded-2xl bg-white py-20"
          style={{ border: "1px solid var(--vm-border)" }}
        >
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--vm-tile)]">
            <CheckCircle2 className="h-8 w-8 text-[#D1D5DB]" />
          </div>
          <p className="text-[14px] font-semibold text-[var(--vm-text-soft)]">
            Nenhum registro encontrado
          </p>
          <p className="mt-1 text-[12px] text-[var(--vm-faint)]">
            Ajuste os filtros para ver mais resultados
          </p>
          {(q || filterStatus || filterPDF || dateRange.de || dateRange.ate) && (
            <button
              onClick={() => { setQ(""); setFilterStatus(""); setFilterPDF(""); setDateRange({ de: null, ate: null }); }}
              className="mt-4 rounded-lg bg-[var(--vm-teal-tint)] px-4 py-2 text-[12px] font-semibold text-[#059669] transition hover:bg-[var(--vm-green-100)]"
            >
              Limpar filtros
            </button>
          )}
        </motion.div>
      ) : (
        <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {filtered.map((item, i) => (
              <VistoriaCard
                key={item.id}
                item={item}
                index={i}
                onClick={() => setSelected(item)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── DETAIL DRAWER ── */}
      <AnimatePresence>
        {selected && (
          <DetailDrawer item={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
