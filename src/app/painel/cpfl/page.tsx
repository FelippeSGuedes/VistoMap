"use client";

/**
 * /painel/cpfl — Validação da Concessionária.
 *
 * Fecha um buraco de processo: o fluxo terminava em "enviei pra CPFL" e nunca
 * mais voltava. Havia 308 vistorias paradas em "Em análise" sem nenhuma tela
 * que as acompanhasse, e nenhum jeito de ver há quanto tempo estavam lá.
 *
 * A tela é SOMENTE LEITURA sobre a decisão da CPFL de propósito: quem
 * aprova/reprova é a CPFL, direto no GLPI — não existe (nem vai existir)
 * botão pra isso aqui.
 *
 * EXCEÇÃO (2026-09-15): "Pendência Nansen" não é decisão da CPFL — é o
 * apontamento de que ALGO nos dados/fotos está errado, e quem resolve isso é
 * o time interno (Nansen), não a concessionária. Por isso só ESSE recorte
 * ganhou tratativa própria (corrigir campos, solicitar devolução ao técnico,
 * finalizar — que regera o projeto e fecha a pendência). Continua sem
 * inventar decisão nenhuma da CPFL: o status "Aprovado com Pendências" já
 * foi dado por quem aprovou o projeto (plugin GLPI); aqui só se resolve o
 * que falta pra ele virar "Sem Pendências".
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
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Undo2,
  User,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { painelService } from "@/services/painel";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth";
import { EditarVistoriaModal } from "@/components/painel/EditarVistoriaModal";
import { DEVOLUCAO_ITENS, DEVOLUCAO_MOTIVOS } from "@/lib/glpi/devolucaoItens";
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

/** "Aprovado com Pendências" + pendência ainda em Nansen — o único recorte que ganha tratativa própria (ver comentário no topo do arquivo). */
function ehPendenciaNansen(v: VistoriaCPFL): boolean {
  return v.etapa === "APROVADA" && v.pendencia === "Pendência Nansen";
}

export default function ValidacaoCPFLPage() {
  const { session } = useAuthStore();
  const podeAgir = session?.role !== "leitura";
  const [items, setItems] = useState<VistoriaCPFL[]>([]);
  const [stats, setStats] = useState<CPFLStats>(STATS_VAZIO);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [etapa, setEtapa] = useState<EtapaCPFL | "TODAS">("TODAS");
  const [q, setQ] = useState("");
  const [municipio, setMunicipio] = useState<string>("");
  const [soPendenciaNansen, setSoPendenciaNansen] = useState(false);

  const [sincronizando, setSincronizando] = useState(false);
  const [recuperandoAvaliador, setRecuperandoAvaliador] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [tratando, setTratando] = useState<VistoriaCPFL | null>(null);

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

  // ?etapa=AGUARDANDO permite que o botão do e-mail de lembrete caia direto na
  // tela já filtrada. Lido de window em vez de useSearchParams de propósito:
  // useSearchParams exige fronteira de Suspense no app router e derruba o
  // build estático — aqui não vale o custo, é só um parâmetro de entrada.
  useEffect(() => {
    const alvo = new URLSearchParams(window.location.search).get("etapa");
    if (alvo === "AGUARDANDO" || alvo === "APROVADA" || alvo === "REPROVADA") {
      setEtapa(alvo);
    }
  }, []);

  const municipios = useMemo(
    () => Array.from(new Set(items.map((i) => i.municipio).filter((m) => m && m !== "—"))).sort(),
    [items]
  );

  // Filtro no cliente: o conjunto é pequeno (centenas) e evita ida ao servidor
  // a cada tecla. Quando crescer, vira filtro no banco — a API já aceita.
  const totalPendenciaNansen = useMemo(() => items.filter(ehPendenciaNansen).length, [items]);

  const filtrados = useMemo(() => {
    const termo = q.trim().toLowerCase();
    return items.filter((i) => {
      if (soPendenciaNansen && !ehPendenciaNansen(i)) return false;
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
  }, [items, etapa, municipio, q, soPendenciaNansen]);

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

  // Não é "aprovar" — é corrigir o status NATIVO do GLPI (states_id) de
  // equipamento que a CPFL JÁ aprovou (statusvistoria + data preenchida)
  // mas que nunca avançou pra "Liberado para Instalação" porque nada
  // fazia essa ponte automaticamente (achado 2026-09-10). Continua sem
  // inventar decisão nenhuma da CPFL — só propaga uma que já existe.
  async function handleSincronizar() {
    setSincronizando(true);
    try {
      const r = await painelService.sincronizarStatusCPFL();
      setToast(
        r.liberados.length === 0
          ? "Nada pra corrigir — todo mundo aprovado já está com o status certo."
          : `${r.liberados.length} equipamento(s) corrigido(s) pra "Liberado para Instalação": ${r.liberados
              .map((e) => e.equipamento)
              .join(", ")}`
      );
    } catch (e) {
      setToast(`❌ Falha ao sincronizar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSincronizando(false);
      setTimeout(() => setToast(null), 8000);
    }
  }

  // A CPFL aprova direto no GLPI dela — o único jeito de saber quem foi é
  // o histórico nativo do GLPI (glpi_logs). Best-effort de propósito: só
  // grava quando o histórico não deixa margem pra dúvida (ver
  // recuperarAvaliadorViaLogsGlpi em painel.ts); o resto fica reportado,
  // nunca "no chute".
  async function handleRecuperarAvaliador() {
    setRecuperandoAvaliador(true);
    try {
      const r = await painelService.recuperarAvaliadorCPFL();
      const partes: string[] = [];
      if (r.recuperados.length > 0) {
        partes.push(
          `${r.recuperados.length} recuperado(s): ${r.recuperados.map((x) => `${x.equipamento} → ${x.avaliador}`).join(", ")}`
        );
      }
      if (r.naoRecuperados.length > 0) {
        partes.push(`${r.naoRecuperados.length} sem confirmação suficiente no histórico do GLPI`);
      }
      setToast(partes.length > 0 ? partes.join(" · ") : "Nada pendente — nenhum aprovado sem avaliador registrado.");
      if (r.recuperados.length > 0) void carregar();
    } catch (e) {
      setToast(`❌ Falha ao recuperar avaliador: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRecuperandoAvaliador(false);
      setTimeout(() => setToast(null), 10000);
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleSincronizar()}
              disabled={sincronizando}
              title='Corrige o status geral (states_id) de equipamentos já aprovados pela CPFL que ficaram presos em "Vistoriado" — não aprova nada, só propaga uma aprovação que já existe.'
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
              style={{ background: "var(--vm-accent)" }}
            >
              <ShieldCheck className={`h-3.5 w-3.5 ${sincronizando ? "animate-pulse" : ""}`} />
              {sincronizando ? "Sincronizando…" : "Sincronizar status"}
            </button>
            <button
              type="button"
              onClick={() => void handleRecuperarAvaliador()}
              disabled={recuperandoAvaliador}
              title='Tenta recuperar, pelo histórico nativo do GLPI, o nome de quem aprovou vistorias que a CPFL aprovou direto no GLPI dela (sem passar pelo VistoMap) — best-effort, só grava quando o histórico não deixa margem pra dúvida.'
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition hover:brightness-95 disabled:opacity-50"
              style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
            >
              <User className={`h-3.5 w-3.5 ${recuperandoAvaliador ? "animate-pulse" : ""}`} />
              {recuperandoAvaliador ? "Buscando…" : "Recuperar avaliador"}
            </button>
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
        </div>

        {toast && (
          <div
            className="mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium"
            style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
          >
            {toast}
          </div>
        )}

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

        {totalPendenciaNansen > 0 && (
          <button
            type="button"
            onClick={() => setSoPendenciaNansen((v) => !v)}
            className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-bold transition"
            style={{
              background: soPendenciaNansen ? "#0F766E" : "var(--vm-teal-tint)",
              color: soPendenciaNansen ? "#fff" : "#0F766E",
              border: `1px solid ${soPendenciaNansen ? "#0F766E" : "rgba(15,118,110,0.3)"}`,
            }}
          >
            <Wrench className="h-3.5 w-3.5" />
            Pendência Nansen ({totalPendenciaNansen})
          </button>
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
              <CardCPFL
                key={v.id}
                v={v}
                onPdf={() => void abrirPdf(v)}
                onTratar={podeAgir && ehPendenciaNansen(v) ? () => setTratando(v) : undefined}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <TratativaDrawer
        item={tratando}
        onClose={() => setTratando(null)}
        onResolved={(msg) => {
          setTratando(null);
          setToast(msg);
          setTimeout(() => setToast(null), 8000);
          void carregar();
        }}
      />
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

function CardCPFL({
  v,
  onPdf,
  onTratar,
}: {
  v: VistoriaCPFL;
  onPdf: () => void;
  onTratar?: () => void;
}) {
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
          {/* Marcador discreto: o nome é o que importa, mas o analista precisa
              saber que não adianta procurar essa pessoa no GLPI. */}
          {v.tecnicoDesligado && (
            <span
              className="rounded px-1 py-px text-[9.5px] font-semibold uppercase tracking-wide"
              style={{ background: "var(--vm-tile-2)", color: "var(--vm-faint)" }}
              title="Usuário não existe mais no GLPI — nome recuperado do histórico"
            >
              desligado
            </span>
          )}
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

      {/* Analista do VistoMap que aprovou/reprovou em /painel/revisitas — só
          aparece quando a decisão passou por lá (a maioria vem de aprovação
          direta da CPFL no GLPI, fora do alcance do VistoMap). */}
      {v.avaliadorInterno && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px]" style={{ color: "var(--vm-muted)" }}>
          <ShieldCheck className="h-3 w-3 shrink-0" />
          Aprovado internamente por {v.avaliadorInterno}
        </div>
      )}

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
            style={{
              background: v.pendencia === "Pendência Nansen" ? "var(--vm-teal-tint)" : "var(--vm-tile-2)",
              color: v.pendencia === "Pendência Nansen" ? "#0F766E" : "var(--vm-text-soft)",
            }}
          >
            {v.pendencia}
          </span>
        )}
        {onTratar && (
          <button
            type="button"
            onClick={onTratar}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-bold text-white transition hover:brightness-110"
            style={{ background: "#0F766E" }}
          >
            <Wrench className="h-3 w-3" />
            Tratar
          </button>
        )}
        {v.pdfPath && (
          <button
            type="button"
            onClick={onPdf}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-bold transition hover:brightness-95 ${onTratar ? "" : "ml-auto"}`}
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

/**
 * Tratativa de "Pendência Nansen" — a única escrita desta tela (ver
 * comentário no topo do arquivo). Três ações independentes:
 *   - Corrigir dados: edita campos direto aqui (fica no drawer — a pendência
 *     só fecha quando o analista confirmar em "Finalizar").
 *   - Solicitar devolução: quando precisa o técnico voltar ao local (foto
 *     ruim, dropdown errado etc.) — mesmo mecanismo de Central de Vistorias.
 *   - Finalizar: marca "Sem Pendências", grava a data de resolução e agenda
 *     a regeneração do projeto — fecha o drawer e atualiza a lista.
 */
function TratativaDrawer({
  item,
  onClose,
  onResolved,
}: {
  item: VistoriaCPFL | null;
  onClose: () => void;
  onResolved: (mensagem: string) => void;
}) {
  const [detalhe, setDetalhe] = useState<{ fields?: Record<string, string> } | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);
  const [salvoAgora, setSalvoAgora] = useState<string | null>(null);

  const [modo, setModo] = useState<"menu" | "devolver">("menu");
  const [devItens, setDevItens] = useState<string[]>([]);
  const [devMotivos, setDevMotivos] = useState<string[]>([]);
  const [devMotivoOutro, setDevMotivoOutro] = useState("");
  const [devLoading, setDevLoading] = useState(false);
  const [devErro, setDevErro] = useState<string | null>(null);

  const [finalizando, setFinalizando] = useState(false);
  const [finalizarErro, setFinalizarErro] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setModo("menu");
    setDevItens([]);
    setDevMotivos([]);
    setDevMotivoOutro("");
    setDevErro(null);
    setFinalizarErro(null);
    setSalvoAgora(null);
    setCarregandoDetalhe(true);
    api
      .get<{ vistoria: { fields?: Record<string, string> } }>(`/painel/vistoria/${item.id}`)
      .then((r) => setDetalhe(r.data.vistoria))
      .catch(() => setDetalhe(null))
      .finally(() => setCarregandoDetalhe(false));
  }, [item]);

  function toggleDevItem(key: string) {
    setDevItens((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }
  function toggleDevMotivo(m: string) {
    setDevMotivos((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  async function handleDevolver() {
    if (!item) return;
    if (devItens.length === 0) { setDevErro("Selecione ao menos um item errado."); return; }
    if (devMotivos.length === 0) { setDevErro("Selecione ao menos um motivo."); return; }
    if (devMotivos.includes("Outro") && !devMotivoOutro.trim()) { setDevErro('Descreva o motivo em "Outro".'); return; }
    setDevLoading(true);
    setDevErro(null);
    try {
      await api.post(`/painel/central-vistorias/${item.id}/devolver`, {
        itens: devItens,
        motivos: devMotivos,
        motivoOutro: devMotivoOutro.trim() || undefined,
      });
      onResolved(`${item.equipamento}: devolução solicitada — o técnico foi notificado.`);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Falha ao solicitar devolução.";
      setDevErro(msg);
    } finally {
      setDevLoading(false);
    }
  }

  async function handleFinalizar() {
    if (!item) return;
    setFinalizando(true);
    setFinalizarErro(null);
    try {
      await painelService.resolverPendenciaCpfl(item.id);
      onResolved(`${item.equipamento}: pendência resolvida — o projeto será regenerado automaticamente.`);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Falha ao finalizar a pendência.";
      setFinalizarErro(msg);
    } finally {
      setFinalizando(false);
    }
  }

  return (
    <>
      <AnimatePresence>
        {item && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex justify-end"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="flex h-full w-full max-w-[480px] flex-col"
              style={{ background: "var(--vm-card)", borderLeft: "1px solid var(--vm-border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex items-start justify-between gap-3 border-b px-5 py-4"
                style={{ borderColor: "var(--vm-border-soft)" }}
              >
                <div className="min-w-0">
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: "#0F766E" }}>
                    Pendência Nansen
                  </p>
                  <h2 className="mt-0.5 truncate text-[16px] font-bold" style={{ color: "var(--vm-text)" }}>
                    {item?.equipamento}
                  </h2>
                  <p className="mt-0.5 truncate text-[12px]" style={{ color: "var(--vm-muted)" }}>
                    {item?.endereco ?? item?.municipio}
                  </p>
                </div>
                <button type="button" onClick={onClose} style={{ color: "var(--vm-faint)" }}>
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {carregandoDetalhe ? (
                  <div
                    className="flex items-center justify-center gap-2 py-10 text-[13px]"
                    style={{ color: "var(--vm-faint)" }}
                  >
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando dados da vistoria…
                  </div>
                ) : modo === "menu" ? (
                  <div className="space-y-3">
                    <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vm-text-soft)" }}>
                      A CPFL aprovou o projeto, mas apontou uma pendência a resolver. Corrija os dados
                      diretamente ou devolva pro técnico refazer em campo — depois finalize pra fechar a
                      pendência e regerar o projeto.
                    </p>

                    {salvoAgora && (
                      <div
                        className="rounded-xl px-3 py-2.5 text-[11.5px] font-medium"
                        style={{ background: "var(--vm-indigo-tint)", color: "#4338CA" }}
                      >
                        {salvoAgora}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setEditarOpen(true)}
                      className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition hover:brightness-95"
                      style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)" }}
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: "var(--vm-indigo-tint)", color: "#4338CA" }}
                      >
                        <Pencil className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-[13px] font-bold" style={{ color: "var(--vm-text)" }}>
                          Corrigir dados
                        </span>
                        <span className="block text-[11px]" style={{ color: "var(--vm-muted)" }}>
                          Ajustar endereço, medições e outros campos direto aqui.
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setModo("devolver")}
                      className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition hover:brightness-95"
                      style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)" }}
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: "var(--vm-orange-tint)", color: "#C2410C" }}
                      >
                        <Undo2 className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-[13px] font-bold" style={{ color: "var(--vm-text)" }}>
                          Solicitar devolução
                        </span>
                        <span className="block text-[11px]" style={{ color: "var(--vm-muted)" }}>
                          Precisa o técnico voltar no local (foto ruim, poste errado…).
                        </span>
                      </span>
                    </button>

                    <div
                      className="mt-5 rounded-xl p-3.5"
                      style={{ background: "var(--vm-teal-tint)", border: "1px solid rgba(15,118,110,0.25)" }}
                    >
                      <p className="mb-2 text-[12.5px] font-bold" style={{ color: "#0F766E" }}>
                        Já corrigiu tudo?
                      </p>
                      <p className="mb-3 text-[11.5px] leading-relaxed" style={{ color: "var(--vm-text-soft)" }}>
                        Finalizar marca a pendência como resolvida e regera o projeto automaticamente com
                        os dados atualizados.
                      </p>
                      {finalizarErro && (
                        <p className="mb-2 text-[11.5px] font-medium" style={{ color: "#DC2626" }}>
                          {finalizarErro}
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={finalizando}
                        onClick={() => void handleFinalizar()}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                        style={{ background: "#0F766E" }}
                      >
                        {finalizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Finalizar — projeto será regerado
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setModo("menu")}
                      className="text-[11.5px] font-semibold underline-offset-2 hover:underline"
                      style={{ color: "var(--vm-faint)" }}
                    >
                      ← voltar
                    </button>

                    <p className="text-[9.5px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
                      O que está errado?
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {DEVOLUCAO_ITENS.map((it) => {
                        const ativo = devItens.includes(it.key);
                        return (
                          <button
                            key={it.key}
                            type="button"
                            onClick={() => toggleDevItem(it.key)}
                            className="rounded-lg px-2.5 py-2 text-left text-[11.5px] font-semibold transition"
                            style={{
                              background: ativo ? "rgba(194,65,12,0.12)" : "var(--vm-tile)",
                              color: ativo ? "#C2410C" : "var(--vm-text-soft)",
                              border: `1px solid ${ativo ? "rgba(194,65,12,0.4)" : "var(--vm-border)"}`,
                            }}
                          >
                            {it.label}
                          </button>
                        );
                      })}
                    </div>

                    <p className="mt-3 text-[9.5px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
                      Motivo
                    </p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {DEVOLUCAO_MOTIVOS.map((m) => {
                        const ativo = devMotivos.includes(m);
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => toggleDevMotivo(m)}
                            className="rounded-lg px-2.5 py-2 text-left text-[11.5px] font-semibold transition"
                            style={{
                              background: ativo ? "rgba(194,65,12,0.12)" : "var(--vm-tile)",
                              color: ativo ? "#C2410C" : "var(--vm-text-soft)",
                              border: `1px solid ${ativo ? "rgba(194,65,12,0.4)" : "var(--vm-border)"}`,
                            }}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>

                    {devMotivos.includes("Outro") && (
                      <textarea
                        value={devMotivoOutro}
                        onChange={(e) => setDevMotivoOutro(e.target.value)}
                        placeholder="Descreva o motivo…"
                        rows={2}
                        className="mt-2 w-full resize-none rounded-lg px-2.5 py-2 text-[12px] outline-none"
                        style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)", color: "var(--vm-text)" }}
                      />
                    )}

                    {devErro && (
                      <p className="mt-2 text-[11.5px] font-medium" style={{ color: "#DC2626" }}>
                        {devErro}
                      </p>
                    )}

                    <button
                      type="button"
                      disabled={devLoading}
                      onClick={() => void handleDevolver()}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                      style={{ background: "#C2410C" }}
                    >
                      {devLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                      Confirmar devolução ao técnico
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <EditarVistoriaModal
        open={editarOpen}
        vistoriaId={item?.id ?? null}
        equipamento={item?.equipamento}
        municipio={item?.municipio}
        initial={detalhe?.fields ?? {}}
        onClose={() => setEditarOpen(false)}
        onSaved={(r) => {
          setEditarOpen(false);
          // Só fecha o modal de edição — a pendência continua aberta até o
          // analista clicar "Finalizar" (o próprio drawer segue aberto).
          setSalvoAgora(
            r.regeneradoPdf
              ? `Dados corrigidos — PDF marcado para regeneração. Clique em "Finalizar" quando terminar.`
              : `${r.affected} campo(s) atualizado(s). Clique em "Finalizar" quando terminar.`
          );
          if (item) {
            api
              .get<{ vistoria: { fields?: Record<string, string> } }>(`/painel/vistoria/${item.id}`)
              .then((res) => setDetalhe(res.data.vistoria))
              .catch(() => {});
          }
        }}
      />
    </>
  );
}
