"use client";

/**
 * Central de Atividades.
 *
 * Esta página era a caixa onde TUDO vivia misturado — impedimento, recusa,
 * exceção e pedido de aprovação apareciam com a mesma cara, e o analista tinha
 * que ler cada um pra descobrir o que era. Agora ela faz só duas coisas:
 *
 *   1. diz de onde vem cada natureza de ocorrência e quantas existem;
 *   2. põe na frente o que está travado esperando decisão.
 *
 * O trabalho de fato acontece na Central de Ocorrências (/painel/ocorrencias),
 * onde cada tipo tem recorte, filtro, histórico de tentativas e evidência.
 * Notificação ≠ ocorrência: uma chama atenção, a outra é um fato operacional
 * registrado.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, Ban, Bell, CheckCircle2, ChevronRight, Clock,
  Construction, RefreshCw, Undo2,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import type { Ocorrencia, OcorrenciaTipo, OcorrenciasResponse } from "@/lib/glpi/ocorrencias";

const TIPO_COR: Record<OcorrenciaTipo, string> = {
  impedimento: "#B45309",
  recusa: "#6B7280",
  excecao: "#4F46E5",
};

const BLOCOS: Array<{
  tipo: OcorrenciaTipo;
  titulo: string;
  icone: React.ElementType;
  descricao: string;
}> = [
  {
    tipo: "impedimento",
    titulo: "Impedimentos",
    icone: Construction,
    descricao: "O ambiente travou a vistoria — condomínio, acesso, área restrita.",
  },
  {
    tipo: "recusa",
    titulo: "Recusas",
    icone: Ban,
    descricao: "Houve decisão de não executar — sinal fora do padrão, morador, risco.",
  },
  {
    tipo: "excecao",
    titulo: "Exceções",
    icone: AlertTriangle,
    descricao: "Pedido de sair do fluxo esperado, como trabalhar fora do raio.",
  },
];

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

interface DevolucoesStats {
  total: number;
  pendentes: number;
  canceladas: number;
}

export default function AtividadesPage() {
  const { session } = useAuthStore();
  const [dados, setDados] = useState<OcorrenciasResponse | null>(null);
  const [devolucoes, setDevolucoes] = useState<DevolucoesStats | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${session.token}` };
    try {
      const [oc, dev] = await Promise.all([
        api.get<OcorrenciasResponse>("/painel/ocorrencias", { headers }),
        api.get<{ stats: DevolucoesStats }>("/painel/devolucoes", { headers }).catch(() => null),
      ]);
      setDados(oc.data);
      setDevolucoes(dev?.data.stats ?? null);
    } catch {
      /* mantém o que já está na tela */
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => { carregar(); }, [carregar]);

  // "Precisa de decisão" é o único recorte que merece estar aqui: é o que
  // efetivamente segura a operação até alguém responder.
  const pendentes = useMemo<Ocorrencia[]>(
    () => (dados?.ocorrencias ?? [])
      .filter((o) => o.status === "PENDENTE")
      .sort((a, b) => (b.horasAberto ?? 0) - (a.horasAberto ?? 0)),
    [dados]
  );

  const totalAberto = pendentes.length + (devolucoes?.pendentes ?? 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--vm-accent-tint)", color: "#00875F" }}
          >
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: "var(--vm-text)" }}>Central de Atividades</h1>
            <p className="max-w-[70ch] text-[13px]" style={{ color: "var(--vm-muted)" }}>
              Onde está cada coisa e o que precisa de você agora. O tratamento de cada
              ocorrência acontece na área dela.
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

      {/* o que precisa de decisão */}
      <div className="rounded-2xl" style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}>
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: pendentes.length ? "1px solid var(--vm-border)" : "none" }}>
          <Clock className="h-4 w-4" style={{ color: totalAberto > 0 ? "#DC2626" : "#059669" }} />
          <h2 className="text-[13.5px] font-bold" style={{ color: "var(--vm-text)" }}>Precisa de decisão</h2>
          {totalAberto > 0 && (
            <span
              className="rounded-full px-2 py-[1px] text-[10.5px] font-bold tabular-nums"
              style={{ background: "rgba(220,38,38,0.12)", color: "#DC2626" }}
            >
              {totalAberto}
            </span>
          )}
        </div>

        {loading && !dados ? (
          <p className="py-10 text-center text-[13px]" style={{ color: "var(--vm-faint)" }}>Carregando…</p>
        ) : totalAberto === 0 ? (
          <div className="flex items-center gap-3 px-5 py-6">
            <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "#059669" }} />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--vm-text)" }}>Nada parado esperando análise</p>
              <p className="text-[12px]" style={{ color: "var(--vm-faint)" }}>
                Toda ocorrência registrada já foi respondida.
              </p>
            </div>
          </div>
        ) : (
          <ul>
            {pendentes.map((o, i) => (
              <li key={o.chave}>
                <Link
                  href={`/painel/ocorrencias?tipo=${o.tipo}`}
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-[var(--vm-tile)]"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--vm-border)" }}
                >
                  <span
                    className="shrink-0 rounded-md px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-wide"
                    style={{ background: tint(TIPO_COR[o.tipo], 0.13), color: TIPO_COR[o.tipo] }}
                  >
                    {o.tipo === "impedimento" ? "Impedimento" : o.tipo === "recusa" ? "Recusa" : "Exceção"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold" style={{ color: "var(--vm-text)" }}>{o.motivoLabel}</p>
                    <p className="truncate text-[11.5px]" style={{ color: "var(--vm-faint)" }}>
                      {o.equipamento} · {o.tecnicoNome}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px]" style={{ color: "#DC2626" }}>
                    há {relativo(o.criadoEm)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--vm-faint)" }} />
                </Link>
              </li>
            ))}
            {(devolucoes?.pendentes ?? 0) > 0 && (
              <li>
                <Link
                  href="/painel/devolucoes"
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-[var(--vm-tile)]"
                  style={{ borderTop: pendentes.length ? "1px solid var(--vm-border)" : "none" }}
                >
                  <span
                    className="shrink-0 rounded-md px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-wide"
                    style={{ background: "rgba(0,179,136,0.12)", color: "#00875F" }}
                  >
                    Devolução
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold" style={{ color: "var(--vm-text)" }}>
                      {devolucoes?.pendentes} vistoria{(devolucoes?.pendentes ?? 0) > 1 ? "s" : ""} aguardando correção do técnico
                    </p>
                    <p className="text-[11.5px]" style={{ color: "var(--vm-faint)" }}>Devolvidas pelo analista</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--vm-faint)" }} />
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* onde está cada natureza */}
      <div>
        <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--vm-faint)" }}>
          Ocorrências operacionais
        </h2>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {BLOCOS.map(({ tipo, titulo, icone: Icone, descricao }) => {
            const t = dados?.resumo.porTipo[tipo];
            const cor = TIPO_COR[tipo];
            return (
              <Link
                key={tipo}
                href={`/painel/ocorrencias?tipo=${tipo}`}
                className="group rounded-2xl p-4 transition hover:brightness-[0.99]"
                style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: tint(cor, 0.13), color: cor }}
                  >
                    <Icone className="h-4.5 w-4.5" />
                  </span>
                  <div className="text-right">
                    <p className="text-[22px] font-bold leading-none tabular-nums" style={{ color: "var(--vm-text)" }}>
                      {t?.total ?? 0}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>no total</p>
                  </div>
                </div>
                <p className="mt-2.5 text-[14px] font-bold" style={{ color: "var(--vm-text)" }}>{titulo}</p>
                <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "var(--vm-muted)" }}>{descricao}</p>
                <div className="mt-2.5 flex items-center gap-2 text-[11px]">
                  {(t?.pendentes ?? 0) > 0 ? (
                    <span className="font-semibold" style={{ color: "#DC2626" }}>{t?.pendentes} aguardando análise</span>
                  ) : (
                    <span style={{ color: "var(--vm-faint)" }}>nada em aberto</span>
                  )}
                  {(t?.novas7d ?? 0) > 0 && (
                    <>
                      <span style={{ color: "var(--vm-faint)" }}>·</span>
                      <span style={{ color: "var(--vm-muted)" }}>{t?.novas7d} em 7 dias</span>
                    </>
                  )}
                </div>
              </Link>
            );
          })}

          {/* devoluções vivem em módulo próprio: analista → técnico, não é ocorrência de campo */}
          <Link
            href="/painel/devolucoes"
            className="rounded-2xl p-4 transition hover:brightness-[0.99]"
            style={{ background: "var(--vm-card)", border: "1px solid var(--vm-border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "rgba(0,179,136,0.13)", color: "#00875F" }}
              >
                <Undo2 className="h-4.5 w-4.5" />
              </span>
              <div className="text-right">
                <p className="text-[22px] font-bold leading-none tabular-nums" style={{ color: "var(--vm-text)" }}>
                  {devolucoes?.total ?? 0}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--vm-faint)" }}>no total</p>
              </div>
            </div>
            <p className="mt-2.5 text-[14px] font-bold" style={{ color: "var(--vm-text)" }}>Devoluções</p>
            <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "var(--vm-muted)" }}>
              Vistoria devolvida pelo analista pro técnico corrigir — sentido oposto das outras.
            </p>
            <div className="mt-2.5 text-[11px]">
              {(devolucoes?.pendentes ?? 0) > 0 ? (
                <span className="font-semibold" style={{ color: "#DC2626" }}>{devolucoes?.pendentes} aguardando correção</span>
              ) : (
                <span style={{ color: "var(--vm-faint)" }}>nada em aberto</span>
              )}
            </div>
          </Link>
        </div>
      </div>

      <p className="text-center text-[11.5px]" style={{ color: "var(--vm-faint)" }}>
        Ver tudo junto, com filtros e histórico de tentativas:{" "}
        <Link href="/painel/ocorrencias" className="font-semibold underline" style={{ color: "#00875F" }}>
          Central de Ocorrências
        </Link>
      </p>
    </div>
  );
}
