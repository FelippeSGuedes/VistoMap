"use client";

/**
 * Análise Operacional dos Técnicos — substitui o antigo widget "Top
 * Técnicos" (ranking estático). Não é mais um ranking: é uma central de
 * análise individual — escolhe um técnico na lateral e o painel principal
 * mostra tudo sobre a operação dele no período (KPIs, rota no mapa,
 * timeline, evolução do aproveitamento, distribuição, cidades, alertas,
 * resumo e observações manuais).
 *
 * O período NÃO tem seletor próprio aqui — segue o filtro geral do
 * dashboard (periodoRange/periodoModo/concessionaria vêm por prop de
 * page.tsx), diferente de /painel/tecnicos/[id], que tem seletor
 * independente.
 *
 * Regra de "sem dado real, sem inventar" (pedido explícito do usuário):
 * qualquer métrica indisponível mostra "—" ou some, nunca um valor
 * fabricado. Pausa/tempo parado nunca aparece — confirmado morto no
 * backend (togglePausaAlmoco sem uso).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  MapPin,
  Route as RouteIcon,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Timer,
  Trash2,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { api } from "@/services/api";
import { painelService } from "@/services/painel";
import type { RankingTecnicoItem, VistoriaTecnicoPeriodo, TecnicoObservacao } from "@/services/painel";
import type { AuditEntry, TecnicoAtivo } from "@/types";
import { ACAO_META, initials } from "@/lib/auditMeta";
import { VelocityChart } from "./VelocityChart";
import AnaliseOperacionalMapa from "./AnaliseOperacionalMapa";

type PeriodoModo = "hoje" | "7dias" | "30dias" | "todoperiodo" | "personalizado";

export interface AnaliseOperacionalTecnicosProps {
  periodoRange: { inicio: string; fim: string; dias: number };
  periodoModo: PeriodoModo;
  periodoLabel: string;
  concessionaria?: string;
  equipePeriodo: Array<{ ranking: RankingTecnicoItem; ativo: TecnicoAtivo | null }>;
}

interface ExpedienteHistItem {
  id: number;
  inicio_at: string;
  fim_at: string | null;
  duracao_min: number | null;
}

/* ── helpers de data/formatação ─────────────────────────────────────────── */
function toDate(iso: string): Date {
  return new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
}
function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  return toDate(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtHoraCurta(iso: string | null): string {
  if (!iso) return "—";
  return toDate(iso).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtRelativo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const min = Math.round((Date.now() - toDate(iso).getTime()) / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
}
function fmtDuracaoMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}
function fmtKm(km: number): string {
  return `${km.toFixed(1).replace(".", ",")} km`;
}

// "Realizada" = o TÉCNICO concluiu a vistoria — inclui "Em análise" (só
// finalizou, aguardando a decisão da concessionária), não só o que já foi
// decidido (Aprovada/Aprovado/Aprovado com Pendências). Sem "Em análise"
// aqui, toda vistoria finalizada HOJE (que ainda não teve tempo de ser
// decidida) caía fora de "Realizadas" e virava "Pendente" por engano —
// bug relatado em campo 2026-09-24 ("filtrei Hoje e mostrou só 1
// realizada, o que não é verdade"). Mesmo critério de "concluída" já usado
// em fetchRankingTecnicosPeriodo (STATUS_CONCLUIDO_SQL).
const REALIZADA_STATUS = ["Em análise", "Em analise", "Finalizada", "Finalizado", "Aprovada", "Aprovado", "Aprovado com Pendências"];
const REPROVADA_STATUS = ["Reprovada", "Reprovado"];

const statusCfg: Record<TecnicoAtivo["status"], { label: string; color: string }> = {
  "em-campo": { label: "Em campo", color: "#00B388" },
  base: { label: "Na base", color: "#2563EB" },
  "off-shift": { label: "Fora de turno", color: "#94A3B8" },
  offline: { label: "Offline", color: "#94A3B8" },
};

type Ordenacao = "aproveitamento" | "vistorias" | "distancia" | "reprovacoes";

export default function AnaliseOperacionalTecnicos({
  periodoRange,
  periodoModo,
  periodoLabel,
  concessionaria,
  equipePeriodo,
}: AnaliseOperacionalTecnicosProps) {
  const [busca, setBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("vistorias");
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);

  const listaOrdenada = useMemo(() => {
    const filtrada = busca.trim()
      ? equipePeriodo.filter((x) => x.ranking.nome.toLowerCase().includes(busca.trim().toLowerCase()))
      : equipePeriodo;
    const arr = [...filtrada];
    if (ordenacao === "aproveitamento") {
      arr.sort((a, b) => {
        const pa = a.ranking.total > 0 ? a.ranking.aprovadas / a.ranking.total : -1;
        const pb = b.ranking.total > 0 ? b.ranking.aprovadas / b.ranking.total : -1;
        return pb - pa;
      });
    } else if (ordenacao === "distancia") {
      arr.sort((a, b) => (b.ranking.kmPercorrido ?? -1) - (a.ranking.kmPercorrido ?? -1));
    } else if (ordenacao === "reprovacoes") {
      arr.sort((a, b) => b.ranking.reprovadas - a.ranking.reprovadas);
    } else {
      arr.sort((a, b) => b.ranking.total - a.ranking.total);
    }
    return arr;
  }, [equipePeriodo, busca, ordenacao]);

  // Seleciona automaticamente o primeiro da lista quando não há seleção
  // válida (primeira carga, ou o técnico selecionado saiu do recorte atual).
  useEffect(() => {
    if (listaOrdenada.length === 0) return;
    if (!listaOrdenada.some((x) => x.ranking.id === selecionadoId)) {
      setSelecionadoId(listaOrdenada[0].ranking.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaOrdenada]);

  const selecionado = equipePeriodo.find((x) => x.ranking.id === selecionadoId) ?? null;

  /* ── dados do técnico selecionado ──────────────────────────────────────── */
  const [vistorias, setVistorias] = useState<VistoriaTecnicoPeriodo[]>([]);
  const [auditoria, setAuditoria] = useState<AuditEntry[]>([]);
  const [expediente, setExpediente] = useState<ExpedienteHistItem[]>([]);
  const [observacoes, setObservacoes] = useState<TecnicoObservacao[]>([]);
  const [carregandoTecnico, setCarregandoTecnico] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selecionadoId) return;
    let alive = true;
    setCarregandoTecnico(true);
    const desdeExp = `${periodoRange.inicio} 00:00:00`;
    const ateExp = `${periodoRange.fim} 23:59:59`;
    (async () => {
      const [v, a, e, o] = await Promise.allSettled([
        painelService.fetchVistoriasTecnico(selecionadoId, periodoRange.inicio, periodoRange.fim, concessionaria),
        painelService.fetchAudit({ ator_id: selecionadoId, limit: 100 }),
        api.get<{ itens: ExpedienteHistItem[] }>(
          `/painel/expediente/historico?users_id=${selecionadoId}&desde=${encodeURIComponent(desdeExp)}&ate=${encodeURIComponent(ateExp)}&limit=200`
        ),
        painelService.fetchTecnicoObservacoes(selecionadoId),
      ]);
      if (!alive) return;
      if (v.status === "fulfilled") setVistorias(v.value);
      else { setVistorias([]); console.warn("[analise-operacional] fetchVistoriasTecnico falhou:", v.reason); }
      if (a.status === "fulfilled") setAuditoria(a.value);
      else { setAuditoria([]); console.warn("[analise-operacional] fetchAudit falhou:", a.reason); }
      if (e.status === "fulfilled") setExpediente(e.value.data.itens);
      else { setExpediente([]); console.warn("[analise-operacional] expediente/historico falhou:", e.reason); }
      if (o.status === "fulfilled") setObservacoes(o.value);
      else { setObservacoes([]); console.warn("[analise-operacional] fetchTecnicoObservacoes falhou:", o.reason); }
      setAtualizadoEm(new Date());
      setCarregandoTecnico(false);
    })();
    return () => { alive = false; };
  }, [selecionadoId, periodoRange, concessionaria]);

  /* ── KPIs derivados (realizadas/atribuídas — bate com o exemplo do usuário, difere da lateral que reaproveita aprovadas/concluídas) ── */
  const kpis = useMemo(() => {
    const atribuidas = vistorias.length;
    const realizadas = vistorias.filter((v) => v.statusName && REALIZADA_STATUS.includes(v.statusName)).length;
    const reprovadas = vistorias.filter((v) => v.statusName && REPROVADA_STATUS.includes(v.statusName)).length;
    // Por subtração (não por situação): garante que as 3 categorias somam
    // exatamente "atribuídas" — usadas juntas no donut de distribuição.
    const pendentes = Math.max(atribuidas - realizadas - reprovadas, 0);
    const aproveitamento = atribuidas > 0 ? Math.round((realizadas / atribuidas) * 100) : null;
    const tempoEmCampoMin = expediente.reduce((s, e) => s + (e.duracao_min ?? 0), 0);
    const cidadesMap = new Map<string, number>();
    for (const v of vistorias) {
      if (!v.municipio || v.municipio === "—") continue;
      cidadesMap.set(v.municipio, (cidadesMap.get(v.municipio) ?? 0) + 1);
    }
    const cidades = [...cidadesMap.entries()].map(([municipio, total]) => ({ municipio, total })).sort((a, b) => b.total - a.total);
    return { atribuidas, realizadas, reprovadas, pendentes, aproveitamento, tempoEmCampoMin, cidades };
  }, [vistorias, expediente]);

  /* ── evolução do aproveitamento (cumulativo, ordem cronológica) ─────────── */
  const evolucao = useMemo(() => {
    const resolvidas = vistorias.filter((v) => v.statusName && (REALIZADA_STATUS.includes(v.statusName) || REPROVADA_STATUS.includes(v.statusName)));
    let realizadasAcc = 0;
    let reprovadasAcc = 0;
    const values: number[] = [];
    const labels: string[] = [];
    for (const v of resolvidas) {
      if (v.statusName && REALIZADA_STATUS.includes(v.statusName)) realizadasAcc++;
      else reprovadasAcc++;
      const total = realizadasAcc + reprovadasAcc;
      values.push(Math.round((realizadasAcc / total) * 100));
      labels.push(periodoModo === "hoje" ? fmtHoraCurta(v.dataVistoria) : (v.dataVistoria ? toDate(v.dataVistoria).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—"));
    }
    return { values, labels };
  }, [vistorias, periodoModo]);

  // Maior SLA médio de execução entre a equipe no período — referência de
  // escala pro anel do gráfico "Tempo médio de vistoria" (não é bom/ruim,
  // só a magnitude relativa ao restante da equipe).
  const maxSlaEquipe = useMemo(
    () => Math.max(...equipePeriodo.map((x) => x.ranking.slaExecucaoMedioMin).filter((n): n is number => n != null), 1),
    [equipePeriodo]
  );

  /* ── alertas operacionais (linguagem descritiva, nunca acusatória) ──────── */
  const alertas = useMemo(() => {
    const lista: Array<{ texto: string; tom: "neutro" | "atencao" }> = [];
    if (kpis.reprovadas > 0) {
      lista.push({ texto: `${kpis.reprovadas} reprovaç${kpis.reprovadas !== 1 ? "ões" : "ão"} no período`, tom: "atencao" });
    }
    if (kpis.pendentes > 0 && periodoModo !== "hoje") {
      lista.push({ texto: `${kpis.pendentes} vistoria${kpis.pendentes !== 1 ? "s" : ""} pendente${kpis.pendentes !== 1 ? "s" : ""} em aberto atualmente`, tom: "neutro" });
    }
    const km = selecionado?.ranking.kmPercorrido;
    if (km != null && km > 0) {
      lista.push({ texto: `${fmtKm(km)} percorridos no período`, tom: "neutro" });
    }
    const desloc = selecionado?.ranking.tempoDeslocamentoMedioMin;
    if (desloc != null) {
      const comDado = equipePeriodo.map((x) => x.ranking.tempoDeslocamentoMedioMin).filter((n): n is number => n != null);
      if (comDado.length > 1) {
        const media = comDado.reduce((a, b) => a + b, 0) / comDado.length;
        if (media > 0 && desloc > media * 1.2) {
          const pct = Math.round((desloc / media - 1) * 100);
          lista.push({ texto: `Tempo médio de deslocamento ${pct}% acima da média da equipe`, tom: "atencao" });
        }
      }
    }
    return lista;
  }, [kpis, periodoModo, selecionado, equipePeriodo]);

  /* ── resumo operacional (template — cláusulas somem sozinhas sem dado) ──── */
  const resumo = useMemo(() => {
    if (!selecionado) return "";
    const primeiroNome = selecionado.ranking.nome.split(" ")[0];
    const partes: string[] = [`${primeiroNome} atendeu ${kpis.atribuidas} vistoria${kpis.atribuidas !== 1 ? "s" : ""} no período`];
    if (kpis.realizadas > 0) partes.push(`${kpis.realizadas} realizada${kpis.realizadas !== 1 ? "s" : ""}`);
    if (kpis.reprovadas > 0) partes.push(`${kpis.reprovadas} reprovada${kpis.reprovadas !== 1 ? "s" : ""}`);
    if (kpis.pendentes > 0) partes.push(`${kpis.pendentes} pendente${kpis.pendentes !== 1 ? "s" : ""} em aberto`);
    let texto = partes.join(", ") + ".";
    if (kpis.aproveitamento != null) texto += ` Aproveitamento de ${kpis.aproveitamento}%.`;
    const km = selecionado.ranking.kmPercorrido;
    if (km != null && km > 0) texto += ` Percorreu ${fmtKm(km)}.`;
    if (kpis.cidades.length > 0) texto += ` Atuou em ${kpis.cidades.length} cidade${kpis.cidades.length !== 1 ? "s" : ""}.`;
    return texto;
  }, [selecionado, kpis]);

  /* ── observações ──────────────────────────────────────────────────────── */
  const [novaObs, setNovaObs] = useState("");
  const [enviandoObs, setEnviandoObs] = useState(false);
  async function enviarObservacao() {
    if (!selecionadoId || !novaObs.trim()) return;
    setEnviandoObs(true);
    try {
      const obs = await painelService.criarTecnicoObservacao(selecionadoId, novaObs.trim());
      setObservacoes((prev) => [obs, ...prev]);
      setNovaObs("");
    } catch (err) {
      console.warn("[analise-operacional] criarTecnicoObservacao falhou:", err);
    } finally {
      setEnviandoObs(false);
    }
  }
  async function removerObservacao(id: number) {
    setObservacoes((prev) => prev.filter((o) => o.id !== id));
    try {
      await painelService.excluirTecnicoObservacao(id);
    } catch (err) {
      console.warn("[analise-operacional] excluirTecnicoObservacao falhou:", err);
    }
  }

  const donutSegments = [
    { label: "Realizadas", value: kpis.realizadas, color: "#16A34A" },
    { label: "Reprovadas", value: kpis.reprovadas, color: "#DC2626" },
    { label: "Pendentes", value: kpis.pendentes, color: "#F59E0B" },
  ];

  const inicioHoje = periodoModo === "hoje" && expediente.length > 0
    ? expediente.reduce((min, e) => (min == null || e.inicio_at < min ? e.inicio_at : min), null as string | null)
    : null;

  return (
    <div className="vm-card flex flex-col overflow-hidden rounded-2xl bg-white lg:flex-row" style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      {/* ═══════ Header (título + período, sem seletor próprio) ═══════ */}
      <div className="flex w-full flex-col lg:hidden">
        <HeaderBar periodoLabel={periodoLabel} atualizadoEm={atualizadoEm} />
      </div>

      {/* ═══════ Lateral: busca + chips + lista de técnicos ═══════ */}
      <div className="flex w-full shrink-0 flex-col border-b border-[var(--vm-tile-2)] lg:w-[280px] lg:border-b-0 lg:border-r">
        <div className="hidden px-5 pt-4 pb-2 lg:block">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#059669]" strokeWidth={2} />
            <span className="text-[13px] font-semibold text-[var(--vm-text)]">Análise Operacional</span>
          </div>
          <span className="text-[9.5px] text-[var(--vm-faint)]">{periodoLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 pt-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--vm-faint)]" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar técnico…"
            className="w-full bg-transparent px-1 py-1.5 text-[12px] text-[var(--vm-text)] outline-none placeholder:text-[var(--vm-faint)]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-1">
          {([
            ["vistorias", "Vistorias"],
            ["aproveitamento", "Aproveitamento"],
            ["distancia", "Distância"],
            ["reprovacoes", "Reprovações"],
          ] as Array<[Ordenacao, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setOrdenacao(key)}
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold transition"
              style={
                ordenacao === key
                  ? { background: "#059669", color: "#fff" }
                  : { background: "var(--vm-tile)", color: "var(--vm-muted)" }
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex max-h-[420px] flex-col gap-1 overflow-y-auto px-2 pb-3 lg:max-h-none lg:flex-1">
          {listaOrdenada.length === 0 ? (
            <p className="px-3 py-8 text-center text-[11.5px] text-[var(--vm-faint)]">Nenhum técnico encontrado.</p>
          ) : (
            listaOrdenada.map(({ ranking: r, ativo }) => {
              const aprovPct = r.total > 0 ? Math.round((r.aprovadas / r.total) * 100) : null;
              const isSel = r.id === selecionadoId;
              const status = ativo?.status ?? "offline";
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelecionadoId(r.id)}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition"
                  style={{ background: isSel ? "var(--vm-accent-tint)" : "transparent" }}
                >
                  <span
                    className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white"
                    style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}
                  >
                    {initials(r.nome)}
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white"
                      style={{ background: statusCfg[status].color }}
                      title={statusCfg[status].label}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-[var(--vm-text)]">{r.nome.split(" ")[0]} {r.nome.split(" ")[1] ?? ""}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[9.5px] text-[var(--vm-faint)]">
                      <span className="font-semibold text-[var(--vm-text-soft)]">{r.total} vist.</span>
                      {aprovPct != null && <span>· {aprovPct}% aprov.</span>}
                      {r.reprovadas > 0 && <span className="font-semibold text-[#DC2626]">· {r.reprovadas} reprov.</span>}
                      {r.kmPercorrido != null && r.kmPercorrido > 0 && <span>· {fmtKm(r.kmPercorrido)}</span>}
                      {r.cidades > 0 && <span>· {r.cidades} cid.</span>}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ═══════ Painel principal: técnico selecionado ═══════ */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="hidden lg:block">
          <HeaderBar periodoLabel={periodoLabel} atualizadoEm={atualizadoEm} />
        </div>

        {!selecionado ? (
          <div className="flex flex-1 items-center justify-center p-10 text-[12.5px] text-[var(--vm-faint)]">
            Selecione um técnico na lateral.
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {/* Header do técnico */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--vm-tile)] px-4 py-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold text-white"
                style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}
              >
                {initials(selecionado.ranking.nome)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[14.5px] font-bold text-[var(--vm-text)]">{selecionado.ranking.nome}</h3>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
                    style={{ background: `${statusCfg[selecionado.ativo?.status ?? "offline"].color}15`, color: statusCfg[selecionado.ativo?.status ?? "offline"].color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusCfg[selecionado.ativo?.status ?? "offline"].color }} />
                    {statusCfg[selecionado.ativo?.status ?? "offline"].label}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--vm-muted)]">
                  {periodoModo === "hoje" && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Início: {inicioHoje ? fmtDataHora(inicioHoje) : "—"}</span>
                  )}
                  <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> Última atividade: {fmtRelativo(selecionado.ativo?.ultimaAtividade)}</span>
                  {(selecionado.ativo?.status === "em-campo" || selecionado.ativo?.status === "base") && selecionado.ativo?.municipio && (
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {selecionado.ativo.municipio}</span>
                  )}
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
              <KpiTile icon={Send} label="Atribuídas" value={kpis.atribuidas} color="#3B82F6" />
              <KpiTile icon={CheckCircle2} label="Realizadas" value={kpis.realizadas} color="#059669" />
              <KpiTile icon={XCircle} label="Reprovadas" value={kpis.reprovadas} color="#DC2626" />
              <KpiTile icon={Clock} label="Pendentes" value={kpis.pendentes} color="#F59E0B" />
              <KpiTile icon={RouteIcon} label="Distância" value={selecionado.ranking.kmPercorrido != null ? fmtKm(selecionado.ranking.kmPercorrido) : "—"} color="#0891B2" />
              <KpiTile icon={Building2} label="Cidades" value={kpis.cidades.length} color="#7C3AED" />
              <KpiTile icon={Timer} label="Tempo em campo" value={kpis.tempoEmCampoMin > 0 ? fmtDuracaoMin(kpis.tempoEmCampoMin) : "—"} color="#475569" />
            </div>

            {/* Mapa + Timeline */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl p-3" style={{ border: "1px solid var(--vm-border-soft)" }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--vm-text)]">
                    <MapPin className="h-3.5 w-3.5 text-[#00875F]" /> Rota do dia
                  </span>
                  <span className="text-[9.5px] text-[var(--vm-faint)]">pino = data da vistoria</span>
                </div>
                <div className="h-[280px]">
                  <AnaliseOperacionalMapa vistorias={vistorias} />
                </div>
              </div>

              <div className="rounded-xl p-3" style={{ border: "1px solid var(--vm-border-soft)" }}>
                <span className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--vm-text)]">
                  <Activity className="h-3.5 w-3.5 text-[#3B82F6]" /> Linha do tempo
                </span>
                <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
                  {auditoria.length === 0 ? (
                    <p className="py-8 text-center text-[11.5px] text-[var(--vm-faint)]">
                      {carregandoTecnico ? "Carregando…" : "Sem eventos nesse período."}
                    </p>
                  ) : (
                    auditoria.map((e) => {
                      const meta = ACAO_META[e.acao];
                      const Icon = meta?.icon ?? Activity;
                      const municipio = e.alvo?.label
                        ? vistorias.find((v) => v.equipamento === e.alvo!.label)?.municipio
                        : null;
                      return (
                        <div key={e.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--vm-tile)]">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: meta?.bg ?? "var(--vm-tile)", color: meta?.fg ?? "#475569" }}>
                            <Icon className="h-3 w-3" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[11.5px] font-semibold text-[var(--vm-text)]">
                                {meta?.label ?? e.acao}{e.alvo?.label ? ` · ${e.alvo.label}` : ""}
                              </p>
                              <span className="shrink-0 text-[10px] text-[var(--vm-faint)]">{fmtDataHora(e.timestamp)}</span>
                            </div>
                            {municipio && <p className="text-[10.5px] text-[var(--vm-muted)]">{municipio}</p>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Desempenho do técnico — aproveitamento total + tempo médio de vistoria */}
            <div className="rounded-xl p-3" style={{ border: "1px solid var(--vm-border-soft)" }}>
              <span className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--vm-text)]">
                <TrendingUp className="h-3.5 w-3.5 text-[#16A34A]" /> Desempenho do técnico
              </span>
              <div className="flex flex-wrap items-center justify-around gap-4">
                <RadialStat
                  label="Aproveitamento total"
                  valueLabel={kpis.aproveitamento != null ? `${kpis.aproveitamento}%` : "—"}
                  fraction={kpis.aproveitamento != null ? kpis.aproveitamento / 100 : null}
                  color="#059669"
                />
                <RadialStat
                  label="Tempo médio de vistoria"
                  valueLabel={selecionado.ranking.slaExecucaoMedioMin != null ? fmtDuracaoMin(selecionado.ranking.slaExecucaoMedioMin) : "—"}
                  fraction={
                    selecionado.ranking.slaExecucaoMedioMin != null && maxSlaEquipe > 0
                      ? selecionado.ranking.slaExecucaoMedioMin / maxSlaEquipe
                      : null
                  }
                  color="#2563EB"
                />
              </div>
            </div>

            {/* Aproveitamento ao longo do período + Distribuição/Cidades */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl p-3" style={{ border: "1px solid var(--vm-border-soft)" }}>
                <span className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--vm-text)]">
                  <TrendingUp className="h-3.5 w-3.5 text-[#16A34A]" /> Aproveitamento ao longo do período
                </span>
                {evolucao.values.length >= 2 ? (
                  <VelocityChart values={evolucao.values} labels={evolucao.labels} avg={evolucao.values.reduce((a, b) => a + b, 0) / evolucao.values.length} peak={Math.max(...evolucao.values)} />
                ) : (
                  <p className="flex h-[160px] items-center justify-center text-[11.5px] text-[var(--vm-faint)]">Dados insuficientes no período.</p>
                )}
              </div>

              <div className="rounded-xl p-3" style={{ border: "1px solid var(--vm-border-soft)" }}>
                <span className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--vm-text)]">
                  Distribuição das vistorias
                </span>
                <DistribuicaoDonut segments={donutSegments} />
                {kpis.cidades.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-[var(--vm-tile-2)] pt-2">
                    <span className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--vm-faint)]">Cidades visitadas</span>
                    {kpis.cidades.map((c) => (
                      <div key={c.municipio} className="flex items-center justify-between text-[11px]">
                        <span className="truncate text-[var(--vm-text-soft)]">{c.municipio}</span>
                        <span className="font-bold tabular-nums text-[var(--vm-text)]">{c.total}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Alertas + Resumo */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl p-3" style={{ border: "1px solid var(--vm-border-soft)" }}>
                <span className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--vm-text)]">
                  <ShieldAlert className="h-3.5 w-3.5 text-[#C2410C]" /> Alertas operacionais
                </span>
                {alertas.length === 0 ? (
                  <p className="text-[11.5px] text-[var(--vm-faint)]">Sem ocorrências indicadas para este período.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {alertas.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11.5px]" style={{ color: a.tom === "atencao" ? "#B45309" : "var(--vm-text-soft)" }}>
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {a.texto}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl p-3" style={{ border: "1px solid var(--vm-border-soft)" }}>
                <span className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--vm-text)]">
                  Resumo operacional
                </span>
                <p className="text-[12px] leading-relaxed text-[var(--vm-text-soft)]">{resumo}</p>
              </div>
            </div>

            {/* Observações */}
            <div className="rounded-xl p-3" style={{ border: "1px solid var(--vm-border-soft)" }}>
              <span className="mb-2 block text-[12px] font-semibold text-[var(--vm-text)]">Observações do dia</span>
              <div className="flex items-center gap-2">
                <input
                  value={novaObs}
                  onChange={(e) => setNovaObs(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") enviarObservacao(); }}
                  placeholder="Adicionar observação…"
                  className="flex-1 rounded-lg px-3 py-1.5 text-[12px] outline-none"
                  style={{ border: "1px solid var(--vm-border-soft)" }}
                />
                <button
                  type="button"
                  onClick={enviarObservacao}
                  disabled={enviandoObs || !novaObs.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white transition disabled:opacity-40"
                  style={{ background: "#059669" }}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              {observacoes.length > 0 && (
                <div className="mt-2 max-h-[160px] space-y-1.5 overflow-y-auto">
                  {observacoes.map((o) => (
                    <div key={o.id} className="flex items-start justify-between gap-2 rounded-lg bg-[var(--vm-tile)] px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] text-[var(--vm-text-soft)]">{o.texto}</p>
                        <p className="mt-0.5 text-[9.5px] text-[var(--vm-faint)]">{o.autorNome} · {fmtDataHora(o.criadoEm)}</p>
                      </div>
                      <button type="button" onClick={() => removerObservacao(o.id)} className="shrink-0 text-[var(--vm-faint)] transition hover:text-[#DC2626]">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HeaderBar({ periodoLabel, atualizadoEm }: { periodoLabel: string; atualizadoEm: Date | null }) {
  return (
    <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2.5">
      <div className="flex flex-col leading-tight">
        <span className="text-[13px] font-semibold text-[var(--vm-text)]">Análise Operacional dos Técnicos</span>
        <span className="text-[9.5px] text-[var(--vm-faint)]">{periodoLabel}</span>
      </div>
      {atualizadoEm && (
        <span className="shrink-0 text-[10px] text-[var(--vm-faint)]">Atualizado {fmtRelativo(atualizadoEm.toISOString())}</span>
      )}
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl px-3 py-2.5" style={{ background: "var(--vm-tile)" }}>
      <span className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wide" style={{ color }}>
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className="text-[16px] font-bold tabular-nums text-[var(--vm-text)]">{value}</span>
    </div>
  );
}

/** Anel único (gauge) — "Aproveitamento total"/"Tempo médio de vistoria". `fraction` é 0–1 (null = sem dado, anel fica cinza/vazio); o rótulo central é livre (%, ou uma duração formatada). */
function RadialStat({
  label,
  valueLabel,
  fraction,
  color,
}: {
  label: string;
  valueLabel: string;
  fraction: number | null;
  color: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const size = 104;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const clamped = fraction == null ? 0 : Math.min(1, Math.max(0, fraction));
  const dash = shown ? clamped * c : 0;

  return (
    <div ref={ref} className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--vm-tile-2)" strokeWidth={stroke} />
          {fraction != null && (
            <circle
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              transform={`rotate(-90 ${cx} ${cx})`}
              style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.22,.7,.2,1)" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[15px] font-bold tabular-nums text-[var(--vm-text)]">
          {valueLabel}
        </div>
      </div>
      <span className="text-center text-[10.5px] font-semibold text-[var(--vm-muted)]">{label}</span>
    </div>
  );
}

function DistribuicaoDonut({ segments }: { segments: Array<{ label: string; value: number; color: string }> }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const size = 108;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  let acc = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--vm-tile-2)" strokeWidth={stroke} />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s, i) => {
              const frac = s.value / total;
              const len = frac * c;
              const dashoffset = -acc;
              acc += len;
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cx}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={dashoffset}
                  transform={`rotate(-90 ${cx} ${cx})`}
                />
              );
            })}
        <text x={cx} y={cx} textAnchor="middle" dominantBaseline="central" className="fill-[var(--vm-text)]" style={{ fontSize: 18, fontWeight: 700 }}>
          {total}
        </text>
      </svg>
      <div className="flex-1 space-y-1.5">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-[11.5px]">
            <span className="flex items-center gap-1.5 font-medium text-[var(--vm-text-soft)]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} /> {s.label}
            </span>
            <span className="font-bold tabular-nums text-[var(--vm-text)]">{s.value}</span>
          </div>
        ))}
        {total === 0 && <p className="text-[11px] text-[var(--vm-faint)]">Sem vistorias no período.</p>}
      </div>
    </div>
  );
}
