"use client";

/**
 * Fila de Decisão — Impedimento, Recusa e Exceção.
 *
 * Reprojetada em 2026-09-14: a versão anterior desta tela misturava fila de
 * decisão com histórico completo (KPIs, rankings, lista de tudo que já foi
 * decidido) — o que precisava de ação agora ficava em segundo plano, do
 * mesmo tamanho visual que registros de semanas atrás. Esta tela agora SÓ
 * mostra o que está PENDENTE. Histórico (o que já foi aprovado/reprovado,
 * rankings por motivo/técnico) mudou de casa: é a própria Auditoria, que já
 * registra cada decisão — não faz sentido manter duas telas de histórico
 * pra mesma informação.
 *
 * Três naturezas (ver lib/glpi/ocorrencias.ts): impedimento (o ambiente
 * travou), recusa (houve decisão) e exceção (pedido de sair do fluxo,
 * geralmente com o técnico esperando a decisão em tempo real).
 *
 * Impedimento x Recusa é uma DECISÃO DO ANALISTA no momento de aprovar (ver
 * o modal "Essa solicitação é Impedimento ou Recusa?") — o técnico continua
 * relatando do MESMO jeito de sempre. Exceção não passa por essa pergunta:
 * é uma decisão sim/não própria, sem categoria pra escolher.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Ban, Camera, CheckCircle2, ChevronRight, ExternalLink,
  History, MapPin, RefreshCw, Search, ShieldAlert, X,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { VistoriaDetalheModal } from "@/components/painel/VistoriaDetalheModal";
import type {
  Ocorrencia,
  OcorrenciaPrioridade,
  OcorrenciaTipo,
  OcorrenciasResponse,
} from "@/lib/glpi/ocorrencias";

/* ─── linguagem visual ────────────────────────────────────────────────────── */

/** Mesmas cores em toda parte — mapa, Central de Atividades, Auditoria. */
const TIPO_COR: Record<OcorrenciaTipo, string> = {
  impedimento: "#B45309",
  recusa: "#6B7280",
  excecao: "#4F46E5",
};
const TIPO_LABEL: Record<OcorrenciaTipo, string> = {
  impedimento: "Impedimento",
  recusa: "Recusa",
  excecao: "Exceção",
};
const TIPO_DESCRICAO: Record<OcorrenciaTipo, string> = {
  impedimento: "O ambiente travou a vistoria — acesso, condomínio, área restrita. Pode destravar.",
  recusa: "Houve decisão explícita de não executar — sinal fora do padrão, morador recusou, risco.",
  excecao: "O técnico pediu pra sair do fluxo esperado e isso precisou de análise.",
};

function tint(hex: string, alpha: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function dataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function duracao(horas: number | null): string {
  if (horas == null) return "—";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${Math.round(horas)} h`;
  return `${Math.round(horas / 24)} d`;
}

const PRIORIDADE_PESO: Record<OcorrenciaPrioridade, number> = { critico: 0, atencao: 1, normal: 2 };

/* ─── página ──────────────────────────────────────────────────────────────── */

type Segmento = "todas" | OcorrenciaTipo;
const SEGMENTOS: Array<{ id: Segmento; label: string }> = [
  { id: "todas", label: "Todas" },
  { id: "impedimento", label: "Impedimentos" },
  { id: "recusa", label: "Recusas" },
  { id: "excecao", label: "Exceções" },
];

export default function OcorrenciasPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-[13px]" style={{ color: "var(--vm-faint)" }}>Carregando…</p>}>
      <Conteudo />
    </Suspense>
  );
}

function Conteudo() {
  const { session } = useAuthStore();
  const router = useRouter();
  const params = useSearchParams();
  const segmento = (params.get("tipo") as Segmento) || "todas";

  const [dados, setDados] = useState<OcorrenciasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroPrio, setFiltroPrio] = useState<"todas" | OcorrenciaPrioridade>("todas");
  const [selecionada, setSelecionada] = useState<Ocorrencia | null>(null);
  const [vistoriaAberta, setVistoriaAberta] = useState<Ocorrencia | null>(null);

  const carregar = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const r = await api.get<OcorrenciasResponse>("/painel/ocorrencias", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      setDados(r.data);
    } catch {
      /* mantém o que já estava na tela */
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => { carregar(); }, [carregar]);

  const trocarSegmento = (id: Segmento) => {
    router.replace(id === "todas" ? "/painel/ocorrencias" : `/painel/ocorrencias?tipo=${id}`);
  };

  // Só PENDENTE — é o único motivo desta tela existir agora. O que já foi
  // decidido mora na Auditoria (link "Ver histórico" mais abaixo).
  const pendentesDoSegmento = useMemo(
    () =>
      (dados?.ocorrencias ?? []).filter(
        (o) => o.status === "PENDENTE" && (segmento === "todas" || o.tipo === segmento)
      ),
    [dados, segmento]
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pendentesDoSegmento
      .filter((o) => {
        if (filtroPrio !== "todas" && o.prioridade !== filtroPrio) return false;
        if (!q) return true;
        return (
          o.equipamento.toLowerCase().includes(q) ||
          o.motivoLabel.toLowerCase().includes(q) ||
          o.tecnicoNome.toLowerCase().includes(q) ||
          (o.municipio ?? "").toLowerCase().includes(q) ||
          o.justificativa.toLowerCase().includes(q)
        );
      })
      // Urgência antes de data: um impedimento de ontem não pode ficar
      // atrás de uma exceção que chegou há 2 minutos.
      .sort((a, b) => {
        const p = PRIORIDADE_PESO[a.prioridade] - PRIORIDADE_PESO[b.prioridade];
        if (p !== 0) return p;
        return (b.horasAberto ?? 0) - (a.horasAberto ?? 0);
      });
  }, [pendentesDoSegmento, busca, filtroPrio]);

  // Tentativas anteriores da mesma vistoria — precisa do histórico completo
  // (não só pendentes) pra saber que essa já travou antes.
  const historico = useMemo(() => {
    if (!selecionada || !dados) return [];
    return dados.ocorrencias
      .filter((o) => o.vistoriaId === selecionada.vistoriaId)
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }, [selecionada, dados]);

  const titulo = segmento === "todas" ? "Fila de Decisão" : TIPO_LABEL[segmento];
  const acento = segmento === "todas" ? "#B45309" : TIPO_COR[segmento];
  const linkHistorico = segmento === "todas" ? "/painel/auditoria" : `/painel/auditoria?tipo=${segmento}`;

  return (
    <div className="space-y-5">
      {/* ── cabeçalho ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: tint(acento, 0.15), color: acento }}
          >
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: "var(--vm-text)" }}>{titulo}</h1>
            <p className="max-w-[68ch] text-[13px]" style={{ color: "var(--vm-muted)" }}>
              {segmento === "todas"
                ? "Só o que espera você agora — impedimento, recusa e exceção."
                : TIPO_DESCRICAO[segmento]}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={linkHistorico}
            className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold transition hover:brightness-95"
            style={{ border: "1px solid var(--vm-border)", background: "var(--vm-card)", color: "var(--vm-muted)" }}
          >
            <History className="h-3.5 w-3.5" /> Ver histórico
          </Link>
          <button
            type="button"
            onClick={carregar}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition hover:brightness-95"
            style={{ border: "1px solid var(--vm-border)", background: "var(--vm-card)" }}
            title="Atualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} style={{ color: "var(--vm-muted)" }} />
          </button>
        </div>
      </div>

      {/* ── segmentos ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {SEGMENTOS.map((s) => {
          const ativo = segmento === s.id;
          const cor = s.id === "todas" ? "var(--vm-text)" : TIPO_COR[s.id];
          const n = s.id === "todas"
            ? dados?.resumo.pendentes ?? 0
            : dados?.resumo.porTipo[s.id].pendentes ?? 0;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => trocarSegmento(s.id)}
              className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition"
              style={{
                background: ativo && s.id !== "todas" ? tint(TIPO_COR[s.id], 0.12) : "var(--vm-card)",
                border: `1px solid ${ativo ? (s.id === "todas" ? "var(--vm-text-soft)" : tint(TIPO_COR[s.id], 0.4)) : "var(--vm-border)"}`,
                color: ativo ? cor : "var(--vm-muted)",
              }}
            >
              {s.id !== "todas" && (
                <span className="h-2 w-2 rounded-full" style={{ background: TIPO_COR[s.id] }} />
              )}
              {s.label}
              <span
                className="rounded-full px-1.5 text-[10px] font-bold tabular-nums"
                style={{ background: n > 0 ? "rgba(220,38,38,0.12)" : "var(--vm-tile)", color: n > 0 ? "#DC2626" : "var(--vm-faint)" }}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── filtros ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--vm-faint)" }} />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Equipamento, motivo, técnico, município…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
            style={{ color: "var(--vm-text)" }}
          />
        </div>
        <select
          value={filtroPrio}
          onChange={(e) => setFiltroPrio(e.target.value as typeof filtroPrio)}
          className="rounded-xl px-3 py-2 text-[12.5px] outline-none"
          style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", color: "var(--vm-text)" }}
        >
          <option value="todas">Qualquer prioridade</option>
          <option value="critico">Crítico</option>
          <option value="atencao">Atenção</option>
          <option value="normal">Normal</option>
        </select>
      </div>

      {/* ── fila ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl" style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}>
        {loading && !dados ? (
          <p className="py-14 text-center text-[13px]" style={{ color: "var(--vm-faint)" }}>Carregando…</p>
        ) : filtradas.length === 0 ? (
          <div className="py-14 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6" style={{ color: "#059669" }} />
            <p className="text-[13px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>
              {pendentesDoSegmento.length === 0 ? "Nada esperando decisão" : "Nada bate com esses filtros"}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--vm-faint)" }}>
              {pendentesDoSegmento.length === 0
                ? "Assim que um técnico registrar algo novo, aparece aqui."
                : "Ajuste a busca ou a prioridade."}
            </p>
          </div>
        ) : (
          <ul>
            {filtradas.map((o, i) => (
              <li key={o.chave}>
                <button
                  type="button"
                  onClick={() => setSelecionada(o)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--vm-tile)]"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--vm-border)" }}
                >
                  {/* trilho de prioridade — só marca o que foge do normal */}
                  <span
                    className="h-9 w-[3px] shrink-0 rounded-full"
                    style={{ background: o.prioridade === "critico" ? "#DC2626" : o.prioridade === "atencao" ? "rgba(220,38,38,0.35)" : "transparent" }}
                  />
                  <span
                    className="shrink-0 rounded-md px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-wide"
                    style={{ background: tint(TIPO_COR[o.tipo], 0.13), color: TIPO_COR[o.tipo] }}
                  >
                    {TIPO_LABEL[o.tipo]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-[13px] font-semibold" style={{ color: "var(--vm-text)" }}>
                        {o.motivoLabel}
                      </span>
                      {o.totalTentativas > 1 && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-[1px] text-[9.5px] font-bold"
                          style={{ background: "rgba(180,83,9,0.12)", color: "#B45309" }}
                        >
                          tentativa {o.tentativa}/{o.totalTentativas}
                        </span>
                      )}
                      {o.prioridade === "critico" && (
                        <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wide" style={{ color: "#DC2626" }}>
                          Crítico
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]" style={{ color: "var(--vm-faint)" }}>
                      <span className="font-medium" style={{ color: "var(--vm-muted)" }}>{o.equipamento}</span>
                      {o.municipio && <><span>·</span><span>{o.municipio}</span></>}
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: o.tecnicoCor ?? "#B8C0C8" }} />
                        {o.tecnicoNome}
                      </span>
                      {o.fotoUrl && <><span>·</span><Camera className="h-3 w-3" /></>}
                    </div>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-[11px] font-semibold" style={{ color: "#DC2626" }}>
                      aberta há {duracao(o.horasAberto)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--vm-faint)" }} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── detalhe ───────────────────────────────────────────────────── */}
      {selecionada && (
        <Detalhe
          o={selecionada}
          historico={historico}
          onFechar={() => setSelecionada(null)}
          onVerVistoria={() => setVistoriaAberta(selecionada)}
          onRespondida={() => { setSelecionada(null); void carregar(); }}
          token={session?.token}
          podeAgir={session?.role !== "leitura"}
        />
      )}

      <VistoriaDetalheModal
        open={!!vistoriaAberta}
        vistoriaId={vistoriaAberta?.vistoriaId ?? null}
        equipamentoLabel={vistoriaAberta?.equipamento}
        onClose={() => setVistoriaAberta(null)}
      />
    </div>
  );
}

function corStatusPendente(): string {
  return "#DC2626";
}

/* ─── detalhe ─────────────────────────────────────────────────────────────── */

function Detalhe({
  o, historico, onFechar, onVerVistoria, onRespondida, token, podeAgir,
}: {
  o: Ocorrencia;
  historico: Ocorrencia[];
  onFechar: () => void;
  onVerVistoria: () => void;
  onRespondida: () => void;
  token?: string;
  podeAgir: boolean;
}) {
  const [motivoReprova, setMotivoReprova] = useState("");
  const [reprovando, setReprovando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Só origem="recusa" pergunta isso — exceção (fora do raio) é um sim/não
  // simples, sem categoria pra escolher. Pré-seleciona o palpite automático
  // quando existe: na maioria das vezes o analista só confirma.
  const [escolhendoCategoria, setEscolhendoCategoria] = useState(false);
  const [categoriaEscolhida, setCategoriaEscolhida] = useState<"impedimento" | "recusa">(
    o.tipo === "excecao" ? "recusa" : o.tipo
  );

  async function responder(acao: "aprovar" | "reprovar") {
    if (!token) return;
    if (acao === "reprovar" && !motivoReprova.trim()) {
      setReprovando(true);
      setEscolhendoCategoria(false); // mutuamente exclusivo com o seletor de categoria
      return;
    }
    if (acao === "aprovar" && o.origem === "recusa" && !escolhendoCategoria) {
      setEscolhendoCategoria(true);
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const rota = o.origem === "recusa"
        ? `/painel/notificacoes/recusas/${o.id}/responder`
        : `/painel/notificacoes/${o.id}/responder`;
      await api.post(
        rota,
        {
          acao,
          motivo: motivoReprova.trim() || undefined,
          categoria: acao === "aprovar" && o.origem === "recusa" ? categoriaEscolhida : undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onRespondida();
    } catch {
      setErro("Não foi possível registrar a decisão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  const respostas = Object.entries(o.respostas).filter(([, v]) => String(v ?? "").trim().length > 0);

  return (
    <div className="fixed inset-0 z-[300] flex justify-end bg-black/40 backdrop-blur-sm" onClick={onFechar}>
      <aside
        className="flex h-full w-full max-w-[520px] flex-col overflow-y-auto"
        style={{ background: "var(--vm-card)", borderLeft: "1px solid var(--vm-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* cabeçalho */}
        <div className="sticky top-0 z-10 px-5 py-4" style={{ background: "var(--vm-card)", borderBottom: "1px solid var(--vm-border)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span
                className="inline-block rounded-md px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-wide"
                style={{ background: tint(TIPO_COR[o.tipo], 0.13), color: TIPO_COR[o.tipo] }}
              >
                {TIPO_LABEL[o.tipo]}
              </span>
              <h2 className="mt-1.5 text-[17px] font-bold leading-tight" style={{ color: "var(--vm-text)" }}>
                {o.motivoLabel}
              </h2>
              <p className="text-[12px]" style={{ color: "var(--vm-muted)" }}>
                {o.equipamento}{o.municipio ? ` · ${o.municipio}` : ""}
              </p>
            </div>
            <button type="button" onClick={onFechar} className="shrink-0 rounded-lg p-1" style={{ color: "var(--vm-faint)" }}>
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* estado */}
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Situação" valor="Aguardando análise" cor={corStatusPendente()} />
            <Campo label="Prioridade"
              valor={o.prioridade === "critico" ? "Crítico" : o.prioridade === "atencao" ? "Atenção" : "Normal"}
              cor={o.prioridade === "critico" ? "#DC2626" : undefined} />
            <Campo label="Registrada em" valor={dataHora(o.criadoEm)} />
            <Campo label="Aberta há" valor={duracao(o.horasAberto)} cor="#DC2626" />
          </div>

          {/* técnico */}
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)" }}>
            <span className="h-8 w-8 shrink-0 rounded-full" style={{ background: o.tecnicoCor ?? "#B8C0C8" }} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold" style={{ color: "var(--vm-text)" }}>{o.tecnicoNome}</p>
              <p className="text-[10.5px] uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>Técnico responsável</p>
            </div>
          </div>

          {/* justificativa */}
          <Bloco titulo="O que o técnico relatou">
            <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vm-text-soft)" }}>{o.justificativa}</p>
            {o.distanciaM != null && (
              <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--vm-faint)" }}>
                Distância do ponto autorizado: <strong style={{ color: "var(--vm-text)" }}>{o.distanciaM} m</strong>
              </p>
            )}
          </Bloco>

          {respostas.length > 0 && (
            <Bloco titulo="Respostas do registro">
              <dl className="space-y-1.5">
                {respostas.map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-[12px]">
                    <dt className="shrink-0 capitalize" style={{ color: "var(--vm-faint)" }}>{k.replace(/_/g, " ")}:</dt>
                    <dd style={{ color: "var(--vm-text-soft)" }}>{v}</dd>
                  </div>
                ))}
              </dl>
            </Bloco>
          )}

          {o.fotoUrl && (
            <Bloco titulo="Evidência">
              <a href={o.fotoUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl" style={{ border: "1px solid var(--vm-border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.fotoUrl} alt="Evidência do registro" className="max-h-[260px] w-full object-cover" />
              </a>
            </Bloco>
          )}

          {/* histórico de tentativas */}
          {historico.length > 1 && (
            <Bloco titulo={`Histórico desta vistoria — ${historico.length} tentativas`}>
              <ol className="space-y-2">
                {historico.map((h, i) => (
                  <li key={h.chave} className="flex gap-2.5">
                    <span
                      className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8.5px] font-bold text-white"
                      style={{ background: h.chave === o.chave ? TIPO_COR[h.tipo] : "var(--vm-faint)" }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold" style={{ color: "var(--vm-text)" }}>{h.motivoLabel}</p>
                      <p className="text-[11px]" style={{ color: "var(--vm-faint)" }}>
                        {dataHora(h.criadoEm)} · {h.tecnicoNome} · {h.status === "PENDENTE" ? "Aguardando análise" : h.status === "APROVADO" ? "Aprovada" : h.status === "REPROVADO" ? "Reprovada" : "Reaberta"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Bloco>
          )}

          {/* ligações */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onVerVistoria}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition hover:brightness-95"
              style={{ border: "1px solid var(--vm-border)", background: "var(--vm-tile)", color: "var(--vm-text)" }}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ver vistoria
            </button>
            {o.latitude != null && o.longitude != null && (
              <Link
                href={`/painel/mapa?vistoria=${o.vistoriaId}`}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition hover:brightness-95"
                style={{ border: "1px solid var(--vm-border)", background: "var(--vm-tile)", color: "var(--vm-text)" }}
              >
                <MapPin className="h-3.5 w-3.5" /> Ver no mapa
              </Link>
            )}
          </div>

          {/* decisão */}
          {podeAgir && (
            <div className="rounded-xl p-3" style={{ border: "1px solid var(--vm-border)", background: "var(--vm-tile)" }}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
                Decisão do analista
              </p>

              {/* Aprovar (recusa) pede a categoria ANTES de enviar — o técnico
                  só relata o que aconteceu, quem classifica é quem aprova. */}
              {escolhendoCategoria && (
                <div className="mb-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-[12px] font-semibold" style={{ color: "var(--vm-text)" }}>
                      Essa solicitação se enquadra em Impedimento ou Recusa?
                    </p>
                    <button
                      type="button"
                      onClick={() => setEscolhendoCategoria(false)}
                      className="text-[11px] font-semibold underline-offset-2 hover:underline"
                      style={{ color: "var(--vm-faint)" }}
                    >
                      voltar
                    </button>
                  </div>
                  <p className="mb-2 text-[11px]" style={{ color: "var(--vm-faint)" }}>
                    Impedimento: o ambiente travou (acesso, condomínio) — pode destravar depois.
                    Recusa: houve decisão explícita — sai de circulação de vez.
                  </p>
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    {(["impedimento", "recusa"] as const).map((c) => {
                      const ativo = categoriaEscolhida === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCategoriaEscolhida(c)}
                          className="rounded-lg px-3 py-2.5 text-left text-[12.5px] font-bold transition"
                          style={{
                            background: ativo ? tint(TIPO_COR[c], 0.14) : "var(--vm-card)",
                            color: ativo ? TIPO_COR[c] : "var(--vm-text-soft)",
                            border: `1.5px solid ${ativo ? TIPO_COR[c] : "var(--vm-border)"}`,
                          }}
                        >
                          {TIPO_LABEL[c]}
                          {o.categoriaSugerida && o.tipo === c && (
                            <span className="mt-0.5 block text-[9.5px] font-medium uppercase tracking-wide" style={{ opacity: 0.75 }}>
                              sugestão automática
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {reprovando && (
                <textarea
                  value={motivoReprova}
                  onChange={(e) => setMotivoReprova(e.target.value)}
                  rows={2}
                  placeholder="Motivo da reprovação (obrigatório)"
                  className="mb-2 w-full resize-none rounded-lg px-2.5 py-2 text-[12px] outline-none"
                  style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", color: "var(--vm-text)" }}
                />
              )}
              {erro && <p className="mb-2 text-[11.5px] font-medium" style={{ color: "#DC2626" }}>{erro}</p>}
              <div className="flex gap-2">
                {!reprovando && (
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={() => responder("aprovar")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                    style={{ background: "#059669" }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {escolhendoCategoria ? `Confirmar ${TIPO_LABEL[categoriaEscolhida]}` : "Aprovar"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => responder("reprovar")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold transition hover:brightness-95 disabled:opacity-50"
                  style={{ background: "rgba(220,38,38,0.10)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.3)" }}
                >
                  <Ban className="h-3.5 w-3.5" /> {reprovando ? "Confirmar reprovação" : "Reprovar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Campo({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)" }}>
      <p className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>{label}</p>
      <p className="mt-0.5 text-[12.5px] font-semibold" style={{ color: cor ?? "var(--vm-text)" }}>{valor}</p>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>{titulo}</p>
      {children}
    </div>
  );
}
