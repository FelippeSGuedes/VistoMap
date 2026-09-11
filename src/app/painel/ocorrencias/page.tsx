"use client";

/**
 * Central de Ocorrências Operacionais.
 *
 * Substitui a leitura "caixa de entrada de notificações" por uma pergunta
 * operacional: POR QUE as vistorias não estão sendo concluídas?
 *
 * Três naturezas que antes apareciam iguais (ver lib/glpi/ocorrencias.ts):
 * impedimento (o ambiente travou), recusa (houve decisão) e exceção (pedido
 * de sair do fluxo). O tipo é a única coisa que ganha cor forte; prioridade e
 * status entram em tom baixo, pra tela não virar um mosaico.
 *
 * Todo número aqui sai de dado real. Onde não há amostra, o indicador mostra
 * "—" e o insight simplesmente não aparece — nunca um número inventado.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle, Ban, Camera, CheckCircle2, ChevronRight, Clock, ExternalLink,
  Layers, MapPin, RefreshCw, RotateCw, Search, ShieldAlert, TrendingUp, User, X,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { VistoriaDetalheModal } from "@/components/painel/VistoriaDetalheModal";
import type {
  Ocorrencia,
  OcorrenciaPrioridade,
  OcorrenciaStatus,
  OcorrenciaTipo,
  OcorrenciasResponse,
  OcorrenciasResumo,
} from "@/lib/glpi/ocorrencias";

/* ─── linguagem visual ────────────────────────────────────────────────────── */

/** Impedimento e recusa usam EXATAMENTE as cores do mapa — é a mesma coisa. */
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

const STATUS_LABEL: Record<OcorrenciaStatus, string> = {
  PENDENTE: "Aguardando análise",
  APROVADO: "Aprovada",
  REPROVADO: "Reprovada",
  REABERTA: "Reaberta",
};

function tint(hex: string, alpha: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function relativo(iso: string): string {
  const t = new Date(iso.replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(t)) return "—";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
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
  const [filtroStatus, setFiltroStatus] = useState<"todos" | OcorrenciaStatus>("todos");
  const [filtroPrio, setFiltroPrio] = useState<"todas" | OcorrenciaPrioridade>("todas");
  const [filtroTec, setFiltroTec] = useState<number | "todos">("todos");
  const [filtroMotivo, setFiltroMotivo] = useState<string | "todos">("todos");
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
    setFiltroMotivo("todos");
    router.replace(id === "todas" ? "/painel/ocorrencias" : `/painel/ocorrencias?tipo=${id}`);
  };

  // O recorte do segmento vem ANTES dos filtros: os indicadores no topo
  // precisam falar do que está sendo olhado, não do conjunto inteiro.
  const doSegmento = useMemo(
    () => (dados?.ocorrencias ?? []).filter((o) => segmento === "todas" || o.tipo === segmento),
    [dados, segmento]
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return doSegmento.filter((o) => {
      if (filtroStatus !== "todos" && o.status !== filtroStatus) return false;
      if (filtroPrio !== "todas" && o.prioridade !== filtroPrio) return false;
      if (filtroTec !== "todos" && o.tecnicoId !== filtroTec) return false;
      if (filtroMotivo !== "todos" && o.motivo !== filtroMotivo) return false;
      if (!q) return true;
      return (
        o.equipamento.toLowerCase().includes(q) ||
        o.motivoLabel.toLowerCase().includes(q) ||
        o.tecnicoNome.toLowerCase().includes(q) ||
        (o.municipio ?? "").toLowerCase().includes(q) ||
        o.justificativa.toLowerCase().includes(q)
      );
    });
  }, [doSegmento, busca, filtroStatus, filtroPrio, filtroTec, filtroMotivo]);

  const kpis = useMemo(() => resumirLocal(doSegmento), [doSegmento]);
  const motivos = useMemo(() => rank(doSegmento, (o) => o.motivo, (o) => o.motivoLabel), [doSegmento]);
  const porTecnico = useMemo(() => rank(doSegmento, (o) => String(o.tecnicoId), (o) => o.tecnicoNome, (o) => o.tecnicoCor), [doSegmento]);
  const insights = useMemo(() => gerarInsights(doSegmento, motivos, porTecnico), [doSegmento, motivos, porTecnico]);

  // Tentativas anteriores da mesma vistoria — o que mostra "isso já travou antes".
  const historico = useMemo(() => {
    if (!selecionada || !dados) return [];
    return dados.ocorrencias
      .filter((o) => o.vistoriaId === selecionada.vistoriaId)
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }, [selecionada, dados]);

  const titulo = segmento === "todas" ? "Ocorrências Operacionais" : TIPO_LABEL[segmento];
  const acento = segmento === "todas" ? "#B45309" : TIPO_COR[segmento];

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
                ? "Tudo que travou a execução das vistorias — impedimento, recusa e exceção, separados pelo que cada um significa."
                : TIPO_DESCRICAO[segmento]}
            </p>
          </div>
        </div>
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

      {/* ── segmentos ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {SEGMENTOS.map((s) => {
          const ativo = segmento === s.id;
          const cor = s.id === "todas" ? "var(--vm-text)" : TIPO_COR[s.id];
          const n = s.id === "todas"
            ? dados?.ocorrencias.length ?? 0
            : dados?.resumo.porTipo[s.id].total ?? 0;
          const pend = s.id === "todas"
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
              <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--vm-faint)" }}>{n}</span>
              {pend > 0 && (
                <span
                  className="rounded-full px-1.5 text-[9.5px] font-bold"
                  style={{ background: "rgba(220,38,38,0.12)", color: "#DC2626" }}
                >
                  {pend} aberta{pend > 1 ? "s" : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── indicadores ───────────────────────────────────────────────── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
        <Indicador icon={Clock} label="Aguardando análise" valor={kpis.pendentes} cor="#DC2626"
          nota={kpis.pendentes === 0 ? "nada parado agora" : "precisa de decisão"} />
        <Indicador icon={TrendingUp} label="Novas em 7 dias" valor={kpis.novas7d} cor={acento} />
        <Indicador icon={RotateCw} label="Vistorias reincidentes" valor={kpis.reincidentes} cor="#B45309"
          nota="travaram mais de uma vez" />
        <Indicador icon={CheckCircle2} label="Resolvidas" valor={kpis.resolvidas} cor="#059669" />
        <Indicador icon={Layers} label="Tempo médio até resolver"
          texto={duracao(kpis.tempoMedioHoras)} cor="#3B82F6"
          nota={kpis.tempoMedioHoras == null ? "sem amostra ainda" : undefined} />
      </div>

      {/* ── insights (só com amostra suficiente) ──────────────────────── */}
      {insights.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl px-4 py-3"
          style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)" }}
        >
          {insights.map((i) => (
            <span key={i} className="text-[12.5px]" style={{ color: "var(--vm-text-soft)" }}>
              {i}
            </span>
          ))}
        </div>
      )}

      {/* ── rankings ──────────────────────────────────────────────────── */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <Cartao titulo="Principais motivos" icone={AlertTriangle} cor={acento}
          vazio={motivos.length === 0 ? "Nenhuma ocorrência neste recorte." : null}>
          {motivos.slice(0, 8).map((m) => (
            <BarraRank
              key={m.chave}
              label={m.label}
              total={m.total}
              max={motivos[0]?.total ?? 1}
              cor={m.cor ?? acento}
              ativo={filtroMotivo === m.chave}
              onClick={() => setFiltroMotivo(filtroMotivo === m.chave ? "todos" : m.chave)}
            />
          ))}
        </Cartao>

        <Cartao titulo="Por técnico" icone={User} cor={acento}
          vazio={porTecnico.length === 0 ? "Nenhuma ocorrência neste recorte." : null}>
          {porTecnico.slice(0, 8).map((t) => (
            <BarraRank
              key={t.chave}
              label={t.label}
              total={t.total}
              max={porTecnico[0]?.total ?? 1}
              cor={t.cor ?? "var(--vm-text-soft)"}
              ativo={filtroTec === Number(t.chave)}
              onClick={() => setFiltroTec(filtroTec === Number(t.chave) ? "todos" : Number(t.chave))}
            />
          ))}
        </Cartao>
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
            placeholder="Equipamento, motivo, técnico, município, justificativa…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
            style={{ color: "var(--vm-text)" }}
          />
        </div>
        <Seletor valor={filtroStatus} onChange={(v) => setFiltroStatus(v as typeof filtroStatus)}
          opcoes={[["todos", "Qualquer status"], ["PENDENTE", "Aguardando análise"], ["APROVADO", "Aprovada"], ["REPROVADO", "Reprovada"], ["REABERTA", "Reaberta"]]} />
        <Seletor valor={filtroPrio} onChange={(v) => setFiltroPrio(v as typeof filtroPrio)}
          opcoes={[["todas", "Qualquer prioridade"], ["critico", "Crítico"], ["atencao", "Atenção"], ["normal", "Normal"]]} />
        {(filtroMotivo !== "todos" || filtroTec !== "todos") && (
          <button
            type="button"
            onClick={() => { setFiltroMotivo("todos"); setFiltroTec("todos"); }}
            className="rounded-xl px-3 py-2 text-[12px] font-semibold transition hover:brightness-95"
            style={{ border: "1px solid var(--vm-border)", background: "var(--vm-card)", color: "var(--vm-muted)" }}
          >
            Limpar seleção do gráfico
          </button>
        )}
      </div>

      {/* ── lista ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl" style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}>
        {loading && !dados ? (
          <p className="py-14 text-center text-[13px]" style={{ color: "var(--vm-faint)" }}>Carregando ocorrências…</p>
        ) : filtradas.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-[13px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>
              {doSegmento.length === 0 ? "Nenhuma ocorrência registrada" : "Nada bate com esses filtros"}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--vm-faint)" }}>
              {doSegmento.length === 0
                ? "Quando um técnico registrar um impedimento, uma recusa ou uma exceção, ela aparece aqui."
                : "Ajuste a busca ou limpe os filtros."}
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
                    <p className="text-[11px] font-semibold" style={{ color: corStatus(o.status) }}>
                      {STATUS_LABEL[o.status]}
                    </p>
                    <p className="text-[10.5px]" style={{ color: "var(--vm-faint)" }}>{relativo(o.criadoEm)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--vm-faint)" }} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {filtradas.length > 0 && (
        <p className="text-center text-[11.5px]" style={{ color: "var(--vm-faint)" }}>
          {filtradas.length} de {doSegmento.length} ocorrência{doSegmento.length > 1 ? "s" : ""} neste recorte
        </p>
      )}

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

/* ─── agregações ──────────────────────────────────────────────────────────── */

function resumirLocal(lista: Ocorrencia[]) {
  const seteDias = 7 * 24 * 3_600_000;
  const agora = Date.now();
  let pendentes = 0, novas7d = 0, resolvidas = 0, soma = 0, amostra = 0;
  const reincidentes = new Set<number>();
  for (const o of lista) {
    if (o.status === "PENDENTE") pendentes += 1;
    if (agora - new Date(o.criadoEm.replace(" ", "T") + "Z").getTime() <= seteDias) novas7d += 1;
    if (o.status === "APROVADO" || o.status === "REPROVADO") {
      resolvidas += 1;
      if (o.resolvidoEm) {
        const h = (new Date(o.resolvidoEm.replace(" ", "T") + "Z").getTime()
          - new Date(o.criadoEm.replace(" ", "T") + "Z").getTime()) / 3_600_000;
        if (Number.isFinite(h) && h >= 0) { soma += h; amostra += 1; }
      }
    }
    if (o.totalTentativas > 1) reincidentes.add(o.vistoriaId);
  }
  return {
    pendentes, novas7d, resolvidas,
    reincidentes: reincidentes.size,
    tempoMedioHoras: amostra > 0 ? soma / amostra : null,
  };
}

interface ItemRank { chave: string; label: string; total: number; cor?: string | null }

function rank(
  lista: Ocorrencia[],
  chave: (o: Ocorrencia) => string,
  label: (o: Ocorrencia) => string,
  cor?: (o: Ocorrencia) => string | null
): ItemRank[] {
  const m = new Map<string, ItemRank>();
  for (const o of lista) {
    const k = chave(o);
    const atual = m.get(k) ?? { chave: k, label: label(o), total: 0, cor: cor?.(o) ?? null };
    atual.total += 1;
    m.set(k, atual);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

/**
 * Insights só existem com amostra que sustente o número. Abaixo disso, uma
 * porcentagem sobre 3 registros é ruído disfarçado de informação — então a
 * faixa simplesmente não aparece.
 */
const AMOSTRA_MINIMA = 10;

function gerarInsights(lista: Ocorrencia[], motivos: ItemRank[], tecnicos: ItemRank[]): string[] {
  const out: string[] = [];
  const total = lista.length;
  if (total < AMOSTRA_MINIMA) return out;

  const topMotivo = motivos[0];
  if (topMotivo) {
    const pct = Math.round((topMotivo.total / total) * 100);
    if (pct >= 20) out.push(`${pct}% das ocorrências são "${topMotivo.label}".`);
  }
  const reincidentes = new Set(lista.filter((o) => o.totalTentativas > 1).map((o) => o.vistoriaId));
  if (reincidentes.size > 0) {
    out.push(`${reincidentes.size} vistoria${reincidentes.size > 1 ? "s travaram" : " travou"} mais de uma vez.`);
  }
  const topTec = tecnicos[0];
  if (topTec && topTec.total >= 3 && topTec.total / total >= 0.25) {
    out.push(`${topTec.label} concentra ${topTec.total} das ${total} ocorrências.`);
  }
  const antiga = lista
    .filter((o) => o.status === "PENDENTE" && o.horasAberto != null)
    .sort((a, b) => (b.horasAberto ?? 0) - (a.horasAberto ?? 0))[0];
  if (antiga) out.push(`A mais antiga sem decisão está aberta há ${duracao(antiga.horasAberto)}.`);
  return out;
}

function corStatus(s: OcorrenciaStatus): string {
  if (s === "PENDENTE") return "#DC2626";
  if (s === "APROVADO") return "#059669";
  if (s === "REPROVADO") return "#B45309";
  return "var(--vm-muted)";
}

/* ─── peças ───────────────────────────────────────────────────────────────── */

function Indicador({
  icon: Icon, label, valor, texto, cor, nota,
}: {
  icon: React.ElementType; label: string; valor?: number; texto?: string; cor: string; nota?: string;
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" style={{ color: cor }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>{label}</span>
      </div>
      <p className="mt-1.5 text-[24px] font-bold leading-none tabular-nums" style={{ color: "var(--vm-text)" }}>
        {texto ?? valor ?? 0}
      </p>
      {nota && <p className="mt-1 text-[10.5px]" style={{ color: "var(--vm-faint)" }}>{nota}</p>}
    </div>
  );
}

function Cartao({
  titulo, icone: Icone, cor, vazio, children,
}: {
  titulo: string; icone: React.ElementType; cor: string; vazio: string | null; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}>
      <div className="mb-3 flex items-center gap-2">
        <Icone className="h-4 w-4" style={{ color: cor }} />
        <h2 className="text-[13.5px] font-bold" style={{ color: "var(--vm-text)" }}>{titulo}</h2>
      </div>
      {vazio ? (
        <p className="py-6 text-center text-[12px]" style={{ color: "var(--vm-faint)" }}>{vazio}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function BarraRank({
  label, total, max, cor, ativo, onClick,
}: {
  label: string; total: number; max: number; cor: string; ativo: boolean; onClick: () => void;
}) {
  const pct = Math.max(4, Math.round((total / Math.max(max, 1)) * 100));
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-lg px-1.5 py-1 text-left transition hover:bg-[var(--vm-tile)]"
      style={ativo ? { background: "var(--vm-tile)" } : undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[12px]" style={{ color: ativo ? "var(--vm-text)" : "var(--vm-text-soft)" }}>{label}</span>
        <span className="shrink-0 text-[12px] font-bold tabular-nums" style={{ color: "var(--vm-text)" }}>{total}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--vm-tile-2, rgba(127,127,127,0.12))" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cor }} />
      </div>
    </button>
  );
}

function Seletor({
  valor, onChange, opcoes,
}: {
  valor: string; onChange: (v: string) => void; opcoes: Array<[string, string]>;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl px-3 py-2 text-[12.5px] outline-none"
      style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)", color: "var(--vm-text)" }}
    >
      {opcoes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
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

  async function responder(acao: "aprovar" | "reprovar") {
    if (!token) return;
    if (acao === "reprovar" && !motivoReprova.trim()) { setReprovando(true); return; }
    setEnviando(true);
    setErro(null);
    try {
      const rota = o.origem === "recusa"
        ? `/painel/notificacoes/recusas/${o.id}/responder`
        : `/painel/notificacoes/${o.id}/responder`;
      await api.post(rota, { acao, motivo: motivoReprova.trim() || undefined }, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
            <Campo label="Situação" valor={STATUS_LABEL[o.status]} cor={corStatus(o.status)} />
            <Campo label="Prioridade"
              valor={o.prioridade === "critico" ? "Crítico" : o.prioridade === "atencao" ? "Atenção" : "Normal"}
              cor={o.prioridade === "critico" ? "#DC2626" : undefined} />
            <Campo label="Registrada em" valor={dataHora(o.criadoEm)} />
            <Campo label={o.status === "PENDENTE" ? "Aberta há" : "Resolvida em"}
              valor={o.status === "PENDENTE" ? duracao(o.horasAberto) : dataHora(o.resolvidoEm)} />
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

          {o.motivoReprovacao && (
            <Bloco titulo="Motivo da reprovação">
              <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vm-text-soft)" }}>{o.motivoReprovacao}</p>
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
                        {dataHora(h.criadoEm)} · {h.tecnicoNome} · {STATUS_LABEL[h.status]}
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
          {o.status === "PENDENTE" && podeAgir && (
            <div className="rounded-xl p-3" style={{ border: "1px solid var(--vm-border)", background: "var(--vm-tile)" }}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>
                Decisão do analista
              </p>
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
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => responder("aprovar")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                  style={{ background: "#059669" }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar
                </button>
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

          {o.status === "APROVADO" && o.origem === "recusa" && (
            <Link
              href="/painel/rejeitadas"
              className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold transition hover:brightness-95"
              style={{ border: "1px solid var(--vm-border)", background: "var(--vm-tile)", color: "var(--vm-text)" }}
            >
              <RotateCw className="h-3.5 w-3.5" /> Reatribuir e reabrir esta vistoria
            </Link>
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
