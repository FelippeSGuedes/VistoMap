"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Filter,
  History,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Radio,
  Search,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { CATEGORIA_META, type NotifCategoria } from "@/lib/notifCategorias";
import { DateRangeFilter, dentroDoRange, type DateRange } from "@/components/painel/DateRangeFilter";
import type { OverrideRequest } from "@/app/api/painel/notificacoes/route";

/* ═══════════════════════════ helpers de tempo ═══════════════════════════ */

function toUtcMs(dateStr: string): number {
  // MySQL retorna "2026-06-26 17:22:32" sem timezone — tratar como UTC.
  return new Date(dateStr.replace(" ", "T") + "Z").getTime();
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - toUtcMs(dateStr)) / 1000);
  if (diff < 0) return "agora mesmo";
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function formatDate(dateStr: string): string {
  return new Date(toUtcMs(dateStr)).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ═══════════════════════════ prioridade (derivada) ═══════════════════════
   Não existe campo de prioridade no banco — deriva do tempo que a
   solicitação ficou (ou ficou) esperando uma decisão. Quanto mais tempo
   parada, maior a prioridade de tratar primeiro. */

type Prioridade = "ALTA" | "MEDIA" | "BAIXA";

function priorityOf(r: OverrideRequest): Prioridade {
  const inicio = toUtcMs(r.created_at);
  const fim = r.status === "PENDENTE" ? Date.now() : toUtcMs(r.updated_at);
  const horas = (fim - inicio) / 3_600_000;
  if (horas >= 48) return "ALTA";
  if (horas >= 12) return "MEDIA";
  return "BAIXA";
}

const PRIORIDADE_CONFIG: Record<Prioridade, { bg: string; fg: string; border: string; label: string; dot: string }> = {
  ALTA: { bg: "var(--vm-red-tint)", fg: "#B91C1C", border: "rgba(239,68,68,0.3)", label: "Alta", dot: "#EF4444" },
  MEDIA: { bg: "var(--vm-orange-tint)", fg: "#C2410C", border: "rgba(249,115,22,0.3)", label: "Média", dot: "#F97316" },
  BAIXA: { bg: "var(--vm-tile-blue)", fg: "#2563EB", border: "rgba(59,130,246,0.25)", label: "Baixa", dot: "#3B82F6" },
};

function PriorityBadge({ p }: { p: Prioridade }) {
  const c = PRIORIDADE_CONFIG[p];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

/* ═══════════════════════════ motivo / categoria / status ═══════════════ */

function motivoResumo(r: OverrideRequest): string {
  if (r.tipo === "recusa") return r.exception_label ?? "Recusa de vistoria";
  const label = r.exception_label ?? "";
  if (label === "DEVOLUCAO_NAO_POSSO_DESLOCAR") return "Pedido de prazo (devolução)";
  if (label === "SEM GPS") return "Sem sinal de GPS no início";
  if (label === "SEM COORDENADA") return "Sem coordenada de localização";
  return label || "Início fora do raio permitido";
}

function CategoriaBadge({ tipo }: { tipo: OverrideRequest["tipo"] }) {
  const categoria: NotifCategoria = tipo === "recusa" ? "recusa-solicitada" : "excecao-solicitada";
  const meta = CATEGORIA_META[categoria];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: meta.bg, color: meta.fg }}
    >
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }: { status: OverrideRequest["status"] }) {
  const cfg = {
    PENDENTE: { label: "Aguardando", cls: "bg-orange-50 text-orange-700 border-orange-300" },
    APROVADO: { label: "Aprovado", cls: "bg-green-50 text-green-700 border-green-300" },
    REPROVADO: { label: "Recusado", cls: "bg-red-50 text-red-700 border-red-300" },
    REABERTA: { label: "Reaberta", cls: "bg-blue-50 text-blue-700 border-blue-300" },
  }[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

/* ═══════════════════════════ ações de decisão (compartilhado) ═══════════ */

function DecisionActions({
  req,
  onReply,
}: {
  req: OverrideRequest;
  onReply: (req: OverrideRequest, acao: "aprovar" | "reprovar", motivo?: string) => Promise<void>;
}) {
  const [step, setStep] = useState<null | "aprovar" | "reprovar">(null);
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  const confirmar = async (acao: "aprovar" | "reprovar") => {
    setLoading(true);
    try {
      await onReply(req, acao, acao === "reprovar" ? motivo.trim() : undefined);
      setStep(null);
      setMotivo("");
    } finally {
      setLoading(false);
    }
  };

  if (step === "reprovar") {
    return (
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        <textarea
          autoFocus
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Informe o motivo da recusa…"
          rows={2}
          className="w-full resize-none rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-gray-800 outline-none focus:border-red-400"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading || !motivo.trim()}
            onClick={() => confirmar("reprovar")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#DC2626,#B91C1C)" }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Confirmar recusa
          </button>
          <button
            type="button"
            onClick={() => { setStep(null); setMotivo(""); }}
            className="rounded-xl px-3 py-2.5 text-[12px] font-semibold"
            style={{ color: "var(--vm-faint)" }}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (step === "aprovar") {
    return (
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11.5px] font-medium" style={{ color: "var(--vm-text-soft)" }}>
          Confirmar aprovação desta solicitação?
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => confirmar("aprovar")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Sim, aprovar
          </button>
          <button
            type="button"
            onClick={() => setStep(null)}
            className="rounded-xl px-3 py-2.5 text-[12px] font-semibold"
            style={{ color: "var(--vm-faint)" }}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setStep("aprovar")}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white transition"
        style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
      >
        <Check className="h-4 w-4" />
        Aprovar solicitação
      </button>
      <button
        type="button"
        onClick={() => setStep("reprovar")}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white transition"
        style={{ background: "linear-gradient(135deg,#DC2626,#B91C1C)" }}
      >
        <X className="h-4 w-4" />
        Recusar solicitação
      </button>
    </div>
  );
}

/* ═══════════════════════════ card da lista ═══════════════════════════ */

function Field({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <Icon className="mt-0.5 h-3 w-3 shrink-0" style={{ color: "var(--vm-faint)" }} />
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>{label}</p>
        <p className="truncate text-[12px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>{value}</p>
      </div>
    </div>
  );
}

function RequestCard({
  req,
  onReply,
  onOpen,
  secondary = false,
}: {
  req: OverrideRequest;
  onReply: (req: OverrideRequest, acao: "aprovar" | "reprovar", motivo?: string) => Promise<void>;
  onOpen: () => void;
  secondary?: boolean;
}) {
  const prioridade = priorityOf(req);
  const isPendente = req.status === "PENDENTE";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className="cursor-pointer rounded-2xl border p-4 transition hover:-translate-y-0.5"
      style={{
        background: isPendente ? "var(--vm-warm-tint)" : secondary ? "var(--vm-card-alt)" : "var(--vm-card)",
        borderColor: isPendente ? "var(--vm-warm-border)" : "var(--vm-border)",
        boxShadow: isPendente ? "0 2px 14px rgba(245,158,11,0.12)" : "none",
        opacity: secondary ? 0.92 : 1,
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={req.status} />
        <CategoriaBadge tipo={req.tipo} />
        <PriorityBadge p={prioridade} />
        <span className="ml-auto flex items-center gap-1 text-[10px] font-medium" style={{ color: "var(--vm-faint)" }}>
          <Clock className="h-3 w-3" />
          {timeAgo(req.created_at)}
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Field label="Equipamento" value={req.equipamento} icon={Radio} />
        <Field label="Técnico responsável" value={req.tecnico_nome || "—"} icon={User} />
        <Field label="Local da vistoria" value={req.municipio || req.endereco || "—"} icon={MapPin} />
        <Field label="Evidências" value={req.foto_url ? "1 anexada" : "Ver na vistoria"} icon={ImageIcon} />
      </div>

      <p
        className="mt-2.5 line-clamp-2 rounded-xl px-3 py-2 text-[12px] leading-relaxed"
        style={{ background: "var(--vm-surface)", color: "var(--vm-text-soft)", border: "1px solid var(--vm-border)" }}
      >
        <span className="font-semibold" style={{ color: "var(--vm-faint)" }}>{motivoResumo(req)} — </span>
        {req.justificativa}
      </p>

      {req.motivo_reprovacao && (
        <p className="mt-1.5 text-[11px] text-red-600">
          <span className="font-semibold">Motivo da recusa: </span>{req.motivo_reprovacao}
        </p>
      )}

      {isPendente && (
        <div className="mt-3">
          <DecisionActions req={req} onReply={onReply} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ modal de detalhe ═══════════════════════════ */

interface FileItem {
  name: string;
  url: string;
  kind: "image" | "video" | "pdf" | "other";
}

function DetalheField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: "var(--vm-tile)" }}>
      <p className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>{label}</p>
      <p className="mt-0.5 truncate text-[12.5px] font-medium" style={{ color: "var(--vm-text-soft)" }}>{value}</p>
    </div>
  );
}

function TimelineItem({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--vm-accent)" }} />
      <span className="font-semibold" style={{ color: "var(--vm-text-soft)" }}>{label}</span>
      <span style={{ color: "var(--vm-faint)" }}>· {detail}</span>
    </div>
  );
}

function SolicitacaoDetalheModal({
  req,
  onClose,
  onReply,
}: {
  req: OverrideRequest | null;
  onClose: () => void;
  onReply: (req: OverrideRequest, acao: "aprovar" | "reprovar", motivo?: string) => Promise<void>;
}) {
  const { session } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [fotos, setFotos] = useState<FileItem[]>([]);

  useEffect(() => {
    if (!req || !session?.token) return;
    setLoading(true);
    setFotos([]);
    api
      .get<{ items: FileItem[] }>(`/painel/vistoria/${req.vistoria_id}/files`, {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      .then((r) => setFotos((r.data.items ?? []).filter((it) => it.kind === "image")))
      .catch(() => setFotos([]))
      .finally(() => setLoading(false));
  }, [req, session?.token]);

  const prioridade = req ? priorityOf(req) : "BAIXA";
  const mapsHref =
    req && req.latitude != null && req.longitude != null
      ? `https://www.google.com/maps?q=${req.latitude},${req.longitude}`
      : null;

  return (
    <AnimatePresence>
      {req && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl"
            style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 pb-3 pt-4"
              style={{ background: "var(--vm-card)", borderBottom: "1px solid var(--vm-border-soft)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={req.status} />
                  <CategoriaBadge tipo={req.tipo} />
                  <PriorityBadge p={prioridade} />
                </div>
                <p className="truncate text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>Solicitação · {req.equipamento}</p>
              </div>
              <button type="button" onClick={onClose} style={{ color: "var(--vm-faint)" }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-2 gap-2.5">
                <DetalheField label="Técnico responsável" value={req.tecnico_nome || "—"} />
                <DetalheField label="Data da solicitação" value={formatDate(req.created_at)} />
                <DetalheField label="Local" value={req.municipio || "—"} />
                <DetalheField label="Endereço" value={req.endereco || "—"} />
              </div>

              {mapsHref && (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
                  style={{ color: "var(--vm-accent)" }}
                >
                  <MapPin className="h-3.5 w-3.5" /> Abrir localização no mapa <ExternalLink className="h-3 w-3" />
                </a>
              )}

              <div className="rounded-xl p-3" style={{ background: "var(--vm-tile)" }}>
                <p className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>Motivo</p>
                <p className="mt-1 text-[12.5px] font-medium" style={{ color: "var(--vm-text-soft)" }}>{motivoResumo(req)}</p>
              </div>

              <div className="rounded-xl p-3" style={{ background: "var(--vm-surface)", border: "1px solid var(--vm-border)" }}>
                <p className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>Justificativa do técnico</p>
                <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--vm-text-soft)" }}>{req.justificativa}</p>
              </div>

              {req.motivo_reprovacao && (
                <div className="rounded-xl p-3" style={{ background: "var(--vm-red-tint)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <p className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: "#B91C1C" }}>Motivo da recusa</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--vm-text-soft)" }}>{req.motivo_reprovacao}</p>
                </div>
              )}

              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" style={{ color: "var(--vm-muted)" }} />
                  <p className="text-[11.5px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>
                    Evidências enviadas {fotos.length > 0 ? `(${fotos.length})` : ""}
                  </p>
                </div>
                {req.foto_url && (
                  <a
                    href={req.foto_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-2 block overflow-hidden rounded-lg"
                    style={{ border: "1px solid var(--vm-border)" }}
                  >
                    <img src={req.foto_url} alt="Evidência enviada com a solicitação" className="h-32 w-full object-cover" loading="lazy" />
                  </a>
                )}
                {loading ? (
                  <div className="flex items-center gap-2 py-4 text-[12px]" style={{ color: "var(--vm-faint)" }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando fotos da vistoria…
                  </div>
                ) : fotos.length === 0 ? (
                  <p className="py-2 text-[12px]" style={{ color: "var(--vm-faint)" }}>Nenhuma foto adicional encontrada na vistoria.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {fotos.map((f) => (
                      <a key={f.name} href={f.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg" style={{ border: "1px solid var(--vm-border)" }}>
                        <img src={f.url} alt={f.name} className="h-20 w-full object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" style={{ color: "var(--vm-muted)" }} />
                  <p className="text-[11.5px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Histórico da solicitação</p>
                </div>
                <div className="space-y-2">
                  <TimelineItem label="Solicitação enviada" detail={formatDate(req.created_at)} />
                  {req.status !== "PENDENTE" && (
                    <TimelineItem
                      label={req.status === "APROVADO" ? "Aprovada" : req.status === "REPROVADO" ? "Recusada" : "Reaberta"}
                      detail={formatDate(req.updated_at)}
                    />
                  )}
                </div>
              </div>

              {req.status === "PENDENTE" && (
                <div className="border-t pt-4" style={{ borderColor: "var(--vm-border)" }}>
                  <DecisionActions
                    req={req}
                    onReply={async (r, acao, motivo) => {
                      await onReply(r, acao, motivo);
                      onClose();
                    }}
                  />
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════ pílulas de resumo ═══════════════════════════ */

function StatPillMini({ label, value, tone }: { label: string; value: number; tone: "warm" | "green" | "red" }) {
  const cfg = {
    warm: { bg: "var(--vm-warm-tint)", fg: "#B45309" },
    green: { bg: "var(--vm-green-100)", fg: "#047857" },
    red: { bg: "var(--vm-red-tint)", fg: "#B91C1C" },
  }[tone];
  return (
    <div className="min-w-[64px] rounded-xl px-3 py-1.5 text-center" style={{ background: cfg.bg }}>
      <p className="text-[15px] font-bold leading-none tabular-nums" style={{ color: cfg.fg }}>{value}</p>
      <p className="mt-0.5 text-[8.5px] font-bold uppercase tracking-wide" style={{ color: cfg.fg }}>{label}</p>
    </div>
  );
}

/* ═══════════════════════════ filtros ═══════════════════════════ */

const selectClass = "h-8 rounded-xl px-2.5 text-[12px] font-medium outline-none";

function selectStyle(active: boolean): CSSProperties {
  return {
    background: active ? "var(--vm-accent-tint)" : "var(--vm-tile)",
    border: `1px solid ${active ? "var(--vm-glass-border)" : "var(--vm-border)"}`,
    color: active ? "var(--vm-accent)" : "var(--vm-text-soft)",
  };
}

type StatusFiltro = "" | OverrideRequest["status"];
type TipoFiltro = "" | OverrideRequest["tipo"];
type PrioridadeFiltro = "" | Prioridade;
type Ordenacao = "prioridade" | "antigas" | "recentes";
type HistoricoFiltro = "todas" | "APROVADO" | "REPROVADO" | "REABERTA";

/* ═══════════════════════════ página ═══════════════════════════ */

export default function NotificacoesPage() {
  const { session } = useAuthStore();
  const [requests, setRequests] = useState<OverrideRequest[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">("default");
  const prevPendentesRef = useRef(0);

  const [selected, setSelected] = useState<OverrideRequest | null>(null);

  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ de: null, ate: null });
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<StatusFiltro>("");
  const [filtroTipo, setFiltroTipo] = useState<TipoFiltro>("");
  const [filtroPrioridade, setFiltroPrioridade] = useState<PrioridadeFiltro>("");
  const [filtroTecnico, setFiltroTecnico] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("prioridade");

  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [historicoStatusFiltro, setHistoricoStatusFiltro] = useState<HistoricoFiltro>("todas");

  const fetchData = useCallback(async () => {
    if (!session?.token) return;
    try {
      const r = await api.get<{ requests: OverrideRequest[]; pendentes: number }>(
        "/painel/notificacoes",
        { headers: { Authorization: `Bearer ${session.token}` } }
      );
      const newPend = r.data.pendentes;
      if (newPend > prevPendentesRef.current && prevPendentesRef.current >= 0 && notifPerm === "granted") {
        new Notification("VistoMap — Nova solicitação", {
          body: `${newPend} solicitação(ões) aguardando aprovação.`,
          icon: "/logo-vistomap.png",
        });
      }
      prevPendentesRef.current = newPend;
      setRequests(r.data.requests);
      setPendentes(newPend);
    } catch { /* ignora */ }
    finally { setLoading(false); }
  }, [session?.token, notifPerm]);

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifPerm(Notification.permission);
    else setNotifPerm("unsupported");
  }, []);

  useEffect(() => {
    fetchData();
    const id = window.setInterval(fetchData, 5000);
    return () => window.clearInterval(id);
  }, [fetchData]);

  const requestNotifPerm = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setNotifPerm(result);
  };

  const handleReply = async (req: OverrideRequest, acao: "aprovar" | "reprovar", motivo?: string) => {
    const path =
      req.tipo === "recusa"
        ? `/painel/notificacoes/recusas/${req.id}/responder`
        : `/painel/notificacoes/${req.id}/responder`;
    await api.post(path, { acao, motivo }, { headers: { Authorization: `Bearer ${session?.token}` } });
    await fetchData();
  };

  const tecnicosUnicos = useMemo(
    () => Array.from(new Set(requests.map((r) => r.tecnico_nome).filter(Boolean))).sort(),
    [requests]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (q) {
        const hay = `${r.equipamento} ${r.tecnico_nome} ${r.endereco ?? ""} ${r.municipio ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filtroStatus && r.status !== filtroStatus) return false;
      if (filtroTipo && r.tipo !== filtroTipo) return false;
      if (filtroPrioridade && priorityOf(r) !== filtroPrioridade) return false;
      if (filtroTecnico && r.tecnico_nome !== filtroTecnico) return false;
      if (!dentroDoRange(r.created_at, dateRange)) return false;
      return true;
    });
  }, [requests, search, filtroStatus, filtroTipo, filtroPrioridade, filtroTecnico, dateRange]);

  const pendentesLista = useMemo(() => {
    const rank: Record<Prioridade, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
    return filtered
      .filter((r) => r.status === "PENDENTE")
      .sort((a, b) => {
        if (ordenacao === "recentes") return toUtcMs(b.created_at) - toUtcMs(a.created_at);
        if (ordenacao === "antigas") return toUtcMs(a.created_at) - toUtcMs(b.created_at);
        const pa = rank[priorityOf(a)];
        const pb = rank[priorityOf(b)];
        if (pa !== pb) return pa - pb;
        return toUtcMs(a.created_at) - toUtcMs(b.created_at);
      });
  }, [filtered, ordenacao]);

  const historicoLista = useMemo(() => {
    let list = filtered.filter((r) => r.status !== "PENDENTE");
    if (historicoStatusFiltro !== "todas") list = list.filter((r) => r.status === historicoStatusFiltro);
    return list.sort((a, b) => toUtcMs(b.updated_at) - toUtcMs(a.updated_at));
  }, [filtered, historicoStatusFiltro]);

  const hojeStr = new Date().toISOString().slice(0, 10);
  const aprovadasHoje = requests.filter((r) => r.status === "APROVADO" && r.updated_at.slice(0, 10) === hojeStr).length;
  const recusadasHoje = requests.filter((r) => r.status === "REPROVADO" && r.updated_at.slice(0, 10) === hojeStr).length;

  const filtrosAtivos = [filtroStatus, filtroTipo, filtroPrioridade, filtroTecnico].filter(Boolean).length;

  const limparFiltros = () => {
    setFiltroStatus(""); setFiltroTipo(""); setFiltroPrioridade(""); setFiltroTecnico("");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--vm-text)" }}>Central de Solicitações</h1>
          <p className="text-[13px]" style={{ color: "var(--vm-muted)" }}>
            Início fora do local e recusas de vistoria que precisam da sua decisão.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <StatPillMini label="Pendentes" value={pendentes} tone="warm" />
          <StatPillMini label="Aprov. hoje" value={aprovadasHoje} tone="green" />
          <StatPillMini label="Recus. hoje" value={recusadasHoje} tone="red" />
        </div>
      </div>

      {/* Banner notificações do browser */}
      {notifPerm !== "granted" && notifPerm !== "unsupported" && (
        <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <Bell className="h-5 w-5 shrink-0 text-blue-500" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-blue-800">Ative as notificações do site</p>
            <p className="text-[12px] text-blue-600">
              Receba alertas imediatos quando um técnico solicitar aprovação.
            </p>
          </div>
          {notifPerm === "denied" ? (
            <div className="flex items-center gap-1 text-[11px] text-blue-400">
              <BellOff className="h-4 w-4" />
              Bloqueado nas configurações
            </div>
          ) : (
            <button
              type="button"
              onClick={requestNotifPerm}
              className="shrink-0 rounded-xl bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-blue-700"
            >
              Permitir
            </button>
          )}
        </div>
      )}

      {notifPerm === "granted" && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-[12px] text-green-700">
          <Bell className="h-4 w-4" />
          Notificações do site ativadas
        </div>
      )}

      {/* Busca + filtros */}
      <div className="flex items-center gap-2">
        <div
          className="flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{ background: "var(--vm-surface)", border: "1px solid var(--vm-border)" }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--vm-faint)" }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar equipamento, técnico, endereço…"
            className="flex-1 bg-transparent text-[13px] font-medium outline-none"
            style={{ color: "var(--vm-text)" }}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} style={{ color: "var(--vm-faint)" }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <button
          type="button"
          onClick={() => setMostrarFiltros((s) => !s)}
          className="flex h-10 items-center gap-1.5 rounded-2xl px-3 text-[12px] font-semibold transition"
          style={{
            background: filtrosAtivos > 0 ? "var(--vm-accent-tint)" : "var(--vm-surface)",
            border: `1px solid ${filtrosAtivos > 0 ? "var(--vm-glass-border)" : "var(--vm-border)"}`,
            color: filtrosAtivos > 0 ? "var(--vm-accent)" : "var(--vm-muted)",
          }}
        >
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {filtrosAtivos > 0 && (
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white"
              style={{ background: "var(--vm-accent)" }}
            >
              {filtrosAtivos}
            </span>
          )}
        </button>
      </div>

      <AnimatePresence>
        {mostrarFiltros && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div
              className="flex flex-wrap items-center gap-2 rounded-2xl p-3"
              style={{ background: "var(--vm-surface)", border: "1px solid var(--vm-border)" }}
            >
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as StatusFiltro)} className={selectClass} style={selectStyle(!!filtroStatus)}>
                <option value="">Todos os status</option>
                <option value="PENDENTE">Aguardando</option>
                <option value="APROVADO">Aprovado</option>
                <option value="REPROVADO">Recusado</option>
                <option value="REABERTA">Reaberta</option>
              </select>
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as TipoFiltro)} className={selectClass} style={selectStyle(!!filtroTipo)}>
                <option value="">Todos os tipos</option>
                <option value="override">Exceção (fora do raio)</option>
                <option value="recusa">Recusa de vistoria</option>
              </select>
              <select value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value as PrioridadeFiltro)} className={selectClass} style={selectStyle(!!filtroPrioridade)}>
                <option value="">Todas as prioridades</option>
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Média</option>
                <option value="BAIXA">Baixa</option>
              </select>
              <select value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)} className={selectClass} style={selectStyle(!!filtroTecnico)}>
                <option value="">Todos os técnicos</option>
                {tecnicosUnicos.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {filtrosAtivos > 0 && (
                <button type="button" onClick={limparFiltros} className="text-[11px] font-semibold" style={{ color: "var(--vm-faint)" }}>
                  Limpar filtros
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center gap-2 py-8" style={{ color: "var(--vm-faint)" }}>
          <Clock className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      ) : (
        <>
          {/* Pendentes — destaque máximo */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider" style={{ color: "#B45309" }}>
                <AlertTriangle className="h-3.5 w-3.5" />
                Precisam da sua decisão · {pendentesLista.length}
              </p>
              <select
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
                className="rounded-lg px-2 py-1 text-[11px] font-medium outline-none"
                style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
              >
                <option value="prioridade">Prioridade + tempo</option>
                <option value="antigas">Mais antigas primeiro</option>
                <option value="recentes">Mais recentes primeiro</option>
              </select>
            </div>

            {pendentesLista.length === 0 ? (
              <div className="rounded-2xl border border-dashed py-12 text-center" style={{ borderColor: "var(--vm-border)" }}>
                <CheckCircle2 className="mx-auto h-8 w-8 text-green-400" />
                <p className="mt-2 text-[14px] font-medium" style={{ color: "var(--vm-muted)" }}>Nenhuma solicitação pendente</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendentesLista.map((r) => (
                  <RequestCard key={`${r.tipo}-${r.id}`} req={r} onReply={handleReply} onOpen={() => setSelected(r)} />
                ))}
              </div>
            )}
          </div>

          {/* Histórico — secundário, recolhido por padrão */}
          <div>
            <button
              type="button"
              onClick={() => setHistoricoAberto((s) => !s)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition"
              style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)" }}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--vm-muted)" }}>
                <History className="h-3.5 w-3.5" />
                Histórico · {historicoLista.length}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${historicoAberto ? "rotate-180" : ""}`} style={{ color: "var(--vm-faint)" }} />
            </button>

            <AnimatePresence>
              {historicoAberto && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mb-2 mt-3 flex flex-wrap gap-1.5">
                    {([
                      ["todas", "Todas"],
                      ["APROVADO", "Aprovadas"],
                      ["REPROVADO", "Recusadas"],
                      ["REABERTA", "Reabertas"],
                    ] as const).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setHistoricoStatusFiltro(v)}
                        className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition"
                        style={{
                          background: historicoStatusFiltro === v ? "var(--vm-accent-tint)" : "var(--vm-tile)",
                          color: historicoStatusFiltro === v ? "var(--vm-accent)" : "var(--vm-muted)",
                          border: `1px solid ${historicoStatusFiltro === v ? "var(--vm-glass-border)" : "var(--vm-border)"}`,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {historicoLista.length === 0 ? (
                    <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--vm-faint)" }}>Nada por aqui ainda.</p>
                  ) : (
                    <div className="space-y-2.5 pb-1">
                      {historicoLista.map((r) => (
                        <RequestCard key={`${r.tipo}-${r.id}`} req={r} onReply={handleReply} onOpen={() => setSelected(r)} secondary />
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      <SolicitacaoDetalheModal req={selected} onClose={() => setSelected(null)} onReply={handleReply} />
    </div>
  );
}
