"use client";

/**
 * /painel/cpfl — Validação da Concessionária.
 *
 * Fecha um buraco de processo: o fluxo terminava em "enviei pra CPFL" e nunca
 * mais voltava. Havia 308 vistorias paradas em "Em análise" sem nenhuma tela
 * que as acompanhasse, e nenhum jeito de ver há quanto tempo estavam lá.
 *
 * A tela é SOMENTE LEITURA de propósito: quem aprova/reprova é a CPFL, direto
 * no GLPI. Aqui não existe botão de aprovar — se existisse, o painel estaria
 * inventando uma decisão que não é dele.
 *
 * O dado que dá valor à tela não é o total, é a ESPERA: por isso a ordenação
 * padrão é da mais antiga para a mais nova e o tempo parado ganha destaque.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  User,
  X,
  XCircle,
} from "lucide-react";
import { painelService } from "@/services/painel";
import { api } from "@/services/api";
import type { CPFLStats, EtapaCPFL, VistoriaCPFL } from "@/services/painel";

/* ─── helpers ────────────────────────────────────────────────────── */

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(String(iso).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

/**
 * Cor da espera. Os cortes (15/30 dias) são operacionais, não estatísticos:
 * servem pra separar "normal" de "já passou da conta" numa olhada.
 */
function corDaEspera(dias: number | null): { fg: string; bg: string } {
  if (dias == null) return { fg: "var(--vm-text-soft)", bg: "var(--vm-tile-2)" };
  if (dias >= 30) return { fg: "#DC2626", bg: "var(--vm-red-tint)" };
  if (dias >= 15) return { fg: "#D97706", bg: "var(--vm-orange-tint)" };
  return { fg: "var(--vm-text-soft)", bg: "var(--vm-tile-2)" };
}

const ETAPA_META: Record<
  EtapaCPFL,
  { label: string; color: string; bg: string; icon: typeof CheckCircle2 }
> = {
  AGUARDANDO: { label: "Aguardando CPFL", color: "#D97706", bg: "var(--vm-orange-tint)", icon: Clock },
  APROVADA:   { label: "Aprovada",        color: "#00875F", bg: "var(--vm-accent-tint)", icon: CheckCircle2 },
  REPROVADA:  { label: "Reprovada",       color: "#B91C1C", bg: "var(--vm-red-tint)",    icon: XCircle },
};

const FILTROS: Array<{ id: EtapaCPFL | "TODAS"; label: string }> = [
  { id: "TODAS", label: "Todas" },
  { id: "AGUARDANDO", label: "Aguardando" },
  { id: "APROVADA", label: "Aprovadas" },
  { id: "REPROVADA", label: "Reprovadas" },
];

/**
 * Mesmo tratamento de PDF de /painel/realizadas: a rota exige Bearer, que uma
 * navegação `<a href>` nunca envia — por isso busca como blob pelo `api` (que
 * injeta o token) e abre o blob.
 */
function pdfFileParam(dbPath: string): string {
  const FILES_BASE = "/var/www/html/glpi/plugins/vistomapprojetos/files/";
  return dbPath.startsWith(FILES_BASE)
    ? dbPath.slice(FILES_BASE.length)
    : dbPath.replace(/^.*\/files\//, "");
}

/* ─── página ─────────────────────────────────────────────────────── */

const STATS_VAZIO: CPFLStats = {
  total: 0,
  aguardando: 0,
  aprovadas: 0,
  reprovadas: 0,
  aguardandoMais30d: 0,
};

export default function ValidacaoCPFLPage() {
  const [items, setItems] = useState<VistoriaCPFL[]>([]);
  const [stats, setStats] = useState<CPFLStats>(STATS_VAZIO);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [etapa, setEtapa] = useState<EtapaCPFL | "TODAS">("TODAS");
  const [q, setQ] = useState("");
  const [municipio, setMunicipio] = useState<string>("");

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const r = await painelService.fetchCPFL({ limit: 5000 });
      setItems(r.items);
      setStats(r.stats);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  const municipios = useMemo(
    () => Array.from(new Set(items.map((i) => i.municipio).filter((m) => m && m !== "—"))).sort(),
    [items]
  );

  // Filtro no cliente: o conjunto é pequeno (centenas) e evita ida ao servidor
  // a cada tecla. Quando crescer, vira filtro no banco — a API já aceita.
  const filtrados = useMemo(() => {
    const termo = q.trim().toLowerCase();
    return items.filter((i) => {
      if (etapa !== "TODAS" && i.etapa !== etapa) return false;
      if (municipio && i.municipio !== municipio) return false;
      if (!termo) return true;
      return (
        i.equipamento.toLowerCase().includes(termo) ||
        i.municipio.toLowerCase().includes(termo) ||
        (i.endereco ?? "").toLowerCase().includes(termo) ||
        (i.tecnico?.nome ?? "").toLowerCase().includes(termo)
      );
    });
  }, [items, etapa, municipio, q]);

  async function abrirPdf(item: VistoriaCPFL) {
    if (!item.pdfPath) return;
    try {
      const r = await api.get(`/painel/pdf?file=${encodeURIComponent(pdfFileParam(item.pdfPath))}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(r.data as Blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      /* silencioso: o PDF é acessório aqui, não o objetivo da tela */
    }
  }

  return (
    <div className="space-y-5">
      {/* ── CABEÇALHO ── */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-5"
        style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-block h-px w-8" style={{ background: "var(--vm-accent)" }} />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: "var(--vm-accent)" }}
              >
                Concessionária
              </span>
            </div>
            <h1 className="text-[22px] font-bold leading-tight" style={{ color: "var(--vm-text)" }}>
              Validação CPFL
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition hover:brightness-95 disabled:opacity-50"
            style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatPill label="Aguardando" value={stats.aguardando} color="#D97706" bg="rgba(217,119,6,0.10)" />
          <StatPill label="Aprovadas"  value={stats.aprovadas}  color="#34D399" bg="rgba(52,211,153,0.10)" />
          <StatPill label="Reprovadas" value={stats.reprovadas} color="#F87171" bg="rgba(248,113,113,0.10)" />
          <StatPill
            label="Parado +30 dias"
            value={stats.aguardandoMais30d}
            color="#DC2626"
            bg="rgba(220,38,38,0.10)"
          />
        </div>
      </div>

      {/* ── ERRO ── */}
      {erro && (
        <div
          className="flex items-start gap-3 rounded-2xl px-5 py-4"
          style={{ background: "var(--vm-red-tint)", border: "1px solid #FECACA" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-red-700">Falha ao carregar a validação CPFL</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-red-500">{erro}</p>
          </div>
        </div>
      )}

      {/* ── FILTROS ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex h-9 min-w-[200px] max-w-[380px] flex-1 items-center gap-2 rounded-xl px-3"
          style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--vm-faint)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Equipamento, endereço, técnico…"
            className="flex-1 bg-transparent text-[12px] text-[var(--vm-text-soft)] outline-none placeholder:text-[#D1D5DB]"
          />
          {q && (
            <button onClick={() => setQ("")} className="text-[var(--vm-faint)] hover:text-[var(--vm-text-soft)]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div
          className="flex items-center gap-0.5 rounded-xl p-0.5"
          style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)" }}
        >
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setEtapa(f.id)}
              className="rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition"
              style={{
                background: etapa === f.id ? "var(--vm-card)" : "transparent",
                color:
                  etapa === f.id
                    ? f.id === "TODAS"
                      ? "var(--vm-text)"
                      : ETAPA_META[f.id].color
                    : "var(--vm-text-soft)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {municipios.length > 1 && (
          <select
            value={municipio}
            onChange={(e) => setMunicipio(e.target.value)}
            className="h-9 rounded-xl px-3 text-[12px] font-semibold outline-none"
            style={{
              background: "var(--vm-card)",
              border: "1px solid var(--vm-border)",
              color: "var(--vm-text-soft)",
            }}
          >
            <option value="">Todos os municípios</option>
            {municipios.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}

        <span className="ml-auto text-[11.5px] font-semibold" style={{ color: "var(--vm-muted)" }}>
          {filtrados.length} de {items.length}
        </span>
      </div>

      {/* ── LISTA ── */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[150px] animate-pulse rounded-2xl"
              style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)" }}
            />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-2xl px-6 py-14 text-center"
          style={{ background: "var(--vm-tile)", border: "1px dashed var(--vm-border)" }}
        >
          <ShieldCheck className="h-7 w-7" style={{ color: "var(--vm-faint)" }} />
          <p className="text-[13.5px] font-bold" style={{ color: "var(--vm-text)" }}>
            Nenhuma vistoria nesse recorte
          </p>
          <p className="max-w-[420px] text-[12px]" style={{ color: "var(--vm-muted)" }}>
            {items.length === 0
              ? "Nada foi enviado à concessionária ainda."
              : "Os filtros atuais não deixaram nenhuma vistoria de fora do recorte."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtrados.map((v) => (
              <CardCPFL key={v.id} v={v} onPdf={() => void abrirPdf(v)} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ─── componentes ────────────────────────────────────────────────── */

function StatPill({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: bg, border: "1px solid var(--vm-border)" }}>
      <p className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: "var(--vm-faint)" }}>
        {label}
      </p>
      <p className="mt-1 text-[22px] font-bold leading-none tabular-nums" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function CardCPFL({ v, onPdf }: { v: VistoriaCPFL; onPdf: () => void }) {
  const meta = ETAPA_META[v.etapa];
  const Icone = meta.icon;
  const espera = corDaEspera(v.diasAguardando);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="flex flex-col rounded-2xl p-4"
      style={{
        background: "var(--vm-card)",
        border: "1px solid var(--vm-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-bold" style={{ color: "var(--vm-text)" }}>
            {v.equipamento}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[12px]" style={{ color: "var(--vm-muted)" }}>
            <MapPin className="h-3 w-3 shrink-0" />
            {v.endereco ?? v.municipio}
          </p>
        </div>
        <span
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-bold"
          style={{ background: meta.bg, color: meta.color }}
        >
          <Icone className="h-3 w-3" />
          {meta.label}
        </span>
      </div>

      <div
        className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px]"
        style={{ color: "var(--vm-text-soft)" }}
      >
        <span className="flex items-center gap-1">
          <Building2 className="h-3 w-3 shrink-0" />
          {v.municipio}
        </span>
        <span className="flex items-center gap-1">
          <User className="h-3 w-3 shrink-0" />
          {v.tecnico?.nome ?? <span style={{ color: "var(--vm-faint)" }}>sem técnico</span>}
        </span>
      </div>

      <div
        className="mt-2.5 grid grid-cols-2 gap-2 border-t pt-2.5 text-[11px]"
        style={{ borderColor: "var(--vm-border-soft)", color: "var(--vm-muted)" }}
      >
        <span className="flex items-center gap-1">
          <Send className="h-3 w-3 shrink-0" />
          Enviado {fmtDate(v.dataEnvio)}
        </span>
        {v.etapa === "APROVADA" ? (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3 shrink-0" />
            Aprovado {fmtDate(v.dataAprovacao)}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3 shrink-0" />
            Vistoria {fmtDate(v.dataVistoria)}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-1.5 pt-3">
        {v.etapa === "AGUARDANDO" && (
          <span
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-bold"
            style={{ background: espera.bg, color: espera.fg }}
          >
            <Clock className="h-3 w-3" />
            {v.diasAguardando == null ? "sem data de envio" : `${v.diasAguardando} dias parada`}
          </span>
        )}
        {v.pendencia && (
          <span
            className="rounded-lg px-2 py-1 text-[10.5px] font-semibold"
            style={{ background: "var(--vm-tile-2)", color: "var(--vm-text-soft)" }}
          >
            {v.pendencia}
          </span>
        )}
        {v.pdfPath && (
          <button
            type="button"
            onClick={onPdf}
            className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-bold transition hover:brightness-95"
            style={{ background: "var(--vm-tile-2)", color: "#2563EB" }}
          >
            <FileText className="h-3 w-3" />
            PDF
          </button>
        )}
      </div>
    </motion.div>
  );
}
