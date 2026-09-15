"use client";

/**
 * /painel/cpfl — Pendências Nansen.
 *
 * Reformulada em 2026-09-15: até então esta tela era um painel de
 * acompanhamento GERAL da concessionária (Aguardando/Aprovadas/Reprovadas,
 * dias parado, sincronizar status, recuperar avaliador) — 100% leitura, já
 * que quem aprova/reprova é a CPFL, direto no GLPI.
 *
 * Isso saiu daqui de propósito (pedido do usuário: "remodelação completa
 * ... sendo focal apenas para isso"). O motivo de fundo: "Pendência Nansen"
 * NÃO é decisão da CPFL — é o apontamento de que algo nos dados/fotos está
 * errado, e quem resolve é o time interno (Nansen), não a concessionária.
 * Por isso é o ÚNICO recorte que faz sentido virar fila de ação; o resto
 * era só um espelho do que a CPFL já decidiu, sem nada pra fazer aqui.
 *
 * A tela agora é 100% isso: uma fila de projetos aprovados com pendência
 * ainda em aberto do lado da Nansen, ordenada pela mais antiga primeiro (é
 * a espera que importa, não o total). Continua sem inventar decisão da
 * CPFL — o status "Aprovado com Pendências" já foi dado por quem aprovou o
 * projeto (plugin GLPI); aqui só se resolve o que falta pra virar "Sem
 * Pendências" (corrigir dados, devolver pro técnico, ou as duas coisas).
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Search,
  Undo2,
  User,
  Wrench,
  X,
} from "lucide-react";
import { painelService } from "@/services/painel";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth";
import { EditarVistoriaModal } from "@/components/painel/EditarVistoriaModal";
import { DEVOLUCAO_ITENS, DEVOLUCAO_MOTIVOS } from "@/lib/glpi/devolucaoItens";
import type { VistoriaCPFL } from "@/services/painel";

/* ─── helpers ────────────────────────────────────────────────────── */

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(String(iso).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(String(iso).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
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

/** "Aprovado com Pendências" + pendência ainda em Nansen — o único recorte que esta tela mostra (ver comentário no topo do arquivo). */
function ehPendenciaNansen(v: VistoriaCPFL): boolean {
  return v.etapa === "APROVADA" && v.pendencia === "Pendência Nansen";
}

export default function ValidacaoCPFLPage() {
  const { session } = useAuthStore();
  const podeAgir = session?.role !== "leitura";
  const [items, setItems] = useState<VistoriaCPFL[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [municipio, setMunicipio] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  const [tratando, setTratando] = useState<VistoriaCPFL | null>(null);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const r = await painelService.fetchCPFL({ limit: 5000 });
      setItems(r.items.filter(ehPendenciaNansen));
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

  // Ordem por urgência: quem espera tratativa há mais tempo primeiro.
  const filtrados = useMemo(() => {
    const termo = q.trim().toLowerCase();
    return items
      .filter((i) => {
        if (municipio && i.municipio !== municipio) return false;
        if (!termo) return true;
        return (
          i.equipamento.toLowerCase().includes(termo) ||
          i.municipio.toLowerCase().includes(termo) ||
          (i.endereco ?? "").toLowerCase().includes(termo) ||
          (i.tecnico?.nome ?? "").toLowerCase().includes(termo)
        );
      })
      .sort((a, b) => (diasDesde(b.dataAprovacao) ?? 0) - (diasDesde(a.dataAprovacao) ?? 0));
  }, [items, municipio, q]);

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
              <span className="inline-block h-px w-8" style={{ background: "#0F766E" }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#0F766E" }}>
                Aprovado com pendências
              </span>
            </div>
            <h1 className="text-[22px] font-bold leading-tight" style={{ color: "var(--vm-text)" }}>
              Pendências Nansen
            </h1>
            <p className="mt-1 max-w-[62ch] text-[12.5px]" style={{ color: "var(--vm-muted)" }}>
              Projetos que a CPFL aprovou com ressalva — corrija os dados ou devolva pro técnico, depois
              finalize pra fechar a pendência e regerar o projeto.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={loading}
            className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition hover:brightness-95 disabled:opacity-50"
            style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {toast && (
          <div
            className="mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium"
            style={{ background: "var(--vm-tile-2)", border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
          >
            {toast}
          </div>
        )}
      </div>

      {/* ── ERRO ── */}
      {erro && (
        <div
          className="flex items-start gap-3 rounded-2xl px-5 py-4"
          style={{ background: "var(--vm-red-tint)", border: "1px solid #FECACA" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-red-700">Falha ao carregar as pendências</p>
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
          <CheckCircle2 className="h-7 w-7" style={{ color: "#0F766E" }} />
          <p className="text-[13.5px] font-bold" style={{ color: "var(--vm-text)" }}>
            {items.length === 0 ? "Nenhuma pendência Nansen agora" : "Nada bate com esses filtros"}
          </p>
          <p className="max-w-[420px] text-[12px]" style={{ color: "var(--vm-muted)" }}>
            {items.length === 0
              ? "Assim que a CPFL aprovar um projeto com ressalva, ele aparece aqui."
              : "Ajuste a busca ou o município."}
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
                onTratar={podeAgir ? () => setTratando(v) : undefined}
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

function CardCPFL({
  v,
  onPdf,
  onTratar,
}: {
  v: VistoriaCPFL;
  onPdf: () => void;
  onTratar?: () => void;
}) {
  const dias = diasDesde(v.dataAprovacao);
  const espera = corDaEspera(dias);

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
          style={{ background: espera.bg, color: espera.fg }}
        >
          <Calendar className="h-3 w-3" />
          {dias == null ? "sem data" : `há ${dias} dia${dias === 1 ? "" : "s"}`}
        </span>
      </div>

      <div
        className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px]"
        style={{ color: "var(--vm-text-soft)" }}
      >
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
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0" />
          Aprovado {fmtDate(v.dataAprovacao)}
        </span>
      </div>

      {/* Quem aprovou com pendência (users_id_avaliadordavistoriacpflfield,
          gravado pelo plugin GLPI ao aprovar) — nem sempre preenchido. */}
      {v.avaliadorInterno && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px]" style={{ color: "var(--vm-muted)" }}>
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          Aprovado por {v.avaliadorInterno}
        </div>
      )}

      <div
        className="mt-2.5 flex items-center gap-1.5 border-t pt-2.5"
        style={{ borderColor: "var(--vm-border-soft)" }}
      >
        <span
          className="rounded-lg px-2 py-1 text-[10.5px] font-semibold"
          style={{ background: "var(--vm-teal-tint)", color: "#0F766E" }}
        >
          {v.pendencia}
        </span>
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
