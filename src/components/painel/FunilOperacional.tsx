"use client";

import { useMemo } from "react";
import { GitBranch, Repeat2 } from "lucide-react";
import type { PanoramaOperacao } from "@/types";

/**
 * Funil operacional — quantos equipamentos passaram por cada etapa e quanto
 * tempo (mediana) levou até a próxima, derivado do audit log.
 *
 * Isto não existia: a tela mostrava CONTAGEM por estado atual (Pendente/Em
 * vistoria/Concluída), que é uma foto parada. O funil mostra a TRANSIÇÃO —
 * de 1.514 atribuições, quantas chegaram a sair pra campo, quantas de fato
 * iniciaram a vistoria, quantas terminaram — e quanto tempo cada passo típico
 * consome. É o que separa "onde as coisas estão" de "onde elas emperram".
 *
 * O retrabalho de atribuição (equipamento atribuído mais de uma vez) mora
 * aqui do lado, não dentro do funil: não é uma etapa a mais no fluxo, é um
 * comportamento que ACONTECE antes da 1ª etapa e se repete — misturar os
 * dois no mesmo gráfico obscureceria os dois.
 */

const COR = "#6366F1"; // mesma família do PipelineWidget (indigo) — funil e pipeline são parentes visuais

function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtMin(min: number): string {
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h < 24) return m > 0 ? `${h}h${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr > 0 ? `${d}d ${hr}h` : `${d}d`;
}

export function FunilOperacional({ panorama }: { panorama: PanoramaOperacao | null }) {
  const dados = useMemo(() => {
    if (!panorama) return null;
    const { funil, retrabalho } = panorama;
    if (funil.length === 0 || funil[0].total === 0) return null;

    const max = funil[0].total;
    const etapas = funil.map((e, i) => ({
      ...e,
      pct: max > 0 ? (e.total / max) * 100 : 0,
      // Queda em relação à etapa anterior (não à primeira) — é o que aponta
      // ONDE no fluxo o volume se perde.
      quedaPct: i === 0 ? null : funil[i - 1].total > 0 ? (1 - e.total / funil[i - 1].total) * 100 : null,
    }));

    const pctRetrabalho =
      retrabalho.equipamentosAtribuidos > 0
        ? (retrabalho.equipamentosReatribuidos / retrabalho.equipamentosAtribuidos) * 100
        : 0;

    return { etapas, retrabalho, pctRetrabalho };
  }, [panorama]);

  return (
    <div
      className="vm-card flex flex-col overflow-hidden rounded-2xl"
      style={{
        background: "var(--vm-card)",
        border: "1px solid var(--vm-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${COR}1F`, border: `1px solid ${COR}30` }}
        >
          <GitBranch className="h-3.5 w-3.5" style={{ color: COR }} strokeWidth={2} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold text-[var(--vm-text)]">Funil Operacional</span>
          <span className="text-[9.5px] text-[var(--vm-faint)]">
            do momento em que atribui até a vistoria terminar
          </span>
        </div>
      </div>

      {!dados ? (
        <div className="px-5 pb-6">
          <div className="h-32 w-full animate-pulse rounded-xl bg-[var(--vm-tile-2)]" />
        </div>
      ) : (
        <div className="px-5 pb-5">
          {/* ── Etapas: barra decrescente com tempo típico até a próxima ── */}
          <div className="flex flex-col gap-0">
            {dados.etapas.map((e, i) => (
              <div key={e.id}>
                <div className="flex items-center gap-3 py-1.5">
                  <span
                    className="w-[92px] shrink-0 text-[11px] font-medium"
                    style={{ color: "var(--vm-muted)" }}
                  >
                    {e.label}
                  </span>
                  <div
                    className="h-6 flex-1 overflow-hidden rounded-md"
                    style={{ background: "var(--vm-tile-2)" }}
                  >
                    <div
                      className="flex h-full items-center justify-end rounded-md pr-2 transition-[width] duration-700 ease-out"
                      style={{
                        width: `${Math.max(e.pct, 4)}%`,
                        background: COR,
                        opacity: 0.35 + (i / Math.max(dados.etapas.length - 1, 1)) * 0.55,
                      }}
                    >
                      <span className="text-[11px] font-bold tabular-nums text-white drop-shadow-sm">
                        {fmtNum(e.total)}
                      </span>
                    </div>
                  </div>
                  <span
                    className="w-[38px] shrink-0 text-right text-[10px] tabular-nums"
                    style={{ color: "var(--vm-faint)" }}
                  >
                    {i === 0 ? "" : e.pct.toFixed(0) + "%"}
                  </span>
                </div>

                {/* conector com o tempo mediano até esta etapa + a queda */}
                {i > 0 && (
                  <div
                    className="ml-[104px] flex items-center gap-2 pb-1 pl-1 text-[9.5px]"
                    style={{ color: "var(--vm-faint)" }}
                  >
                    <span>
                      {e.medianaMinDesdeAnterior != null
                        ? `típico: ${fmtMin(e.medianaMinDesdeAnterior)}`
                        : "sem amostra suficiente"}
                    </span>
                    {e.quedaPct != null && e.quedaPct > 1 && (
                      <span style={{ color: "#F59E0B" }}>· {e.quedaPct.toFixed(0)}% não chegou aqui</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Retrabalho de atribuição ── */}
          <div
            className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5"
            style={{ background: "var(--vm-tile)", border: "1px solid var(--vm-border)" }}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "rgba(245,158,11,0.14)" }}
            >
              <Repeat2 className="h-3.5 w-3.5" style={{ color: "#F59E0B" }} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[15px] font-bold tabular-nums text-[var(--vm-text)]">
                  {dados.pctRetrabalho.toFixed(0)}%
                </span>
                <span className="text-[10.5px]" style={{ color: "var(--vm-muted)" }}>
                  das atribuições precisaram ser refeitas
                </span>
              </div>
              <span className="block text-[9.5px]" style={{ color: "var(--vm-faint)" }}>
                {fmtNum(dados.retrabalho.equipamentosReatribuidos)} de{" "}
                {fmtNum(dados.retrabalho.equipamentosAtribuidos)} equipamentos · o mais reatribuído passou por{" "}
                {dados.retrabalho.maxAtribuicoes}x
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
