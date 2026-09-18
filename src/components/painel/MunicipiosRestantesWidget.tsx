"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPinOff } from "lucide-react";
import type { PanoramaOperacao } from "@/types";

/**
 * O que FALTA, por município — o inverso do que os mapas de "Top Municípios"
 * / "Aprovados" / "Pendentes CPFL" já mostram (todos eles são sobre o que já
 * foi CONCLUÍDO). Sem isto, o gestor via onde a equipe teve resultado, mas
 * não onde o trabalho que falta está concentrado — pergunta gerencial básica
 * ("onde eu ainda preciso mandar gente") que nenhum widget respondia.
 *
 * Lista, não mapa: pra ~15-20 municípios uma barra horizontal ranqueada com
 * rótulo direto responde mais rápido que um choropleth (que já está sendo
 * usado, do lado, pro trabalho feito) — dois mapas coloridos lado a lado
 * competiriam por atenção sem ganho real de leitura.
 *
 * A tira de idade no topo é o "por quê" antes do "onde": o mesmo total de
 * restantes pode ser saudável (tudo recente) ou um risco real (grande parte
 * há 90+ dias) — números iguais, urgência bem diferente. Cor é status
 * reservado (recente→crítico), não categórica: cada faixa é um degrau de
 * risco, não uma identidade solta.
 */

const FAIXA_COR: Record<string, string> = {
  "0-30": "#94A3B8",
  "31-60": "#FBBF24",
  "61-90": "#F97316",
  "90+": "#DC2626",
};

function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function MunicipiosRestantesWidget({ panorama }: { panorama: PanoramaOperacao | null }) {
  const router = useRouter();
  const [expandido, setExpandido] = useState(false);

  const municipios = panorama?.municipiosRestantes ?? [];
  const faixas = panorama?.backlog.faixas ?? [];
  const totalFaixas = faixas.reduce((s, f) => s + f.total, 0);

  const { itens, max, restanteFora } = useMemo(() => {
    const ordenado = [...municipios].sort((a, b) => b.restantes - a.restantes);
    const visiveis = ordenado.slice(0, expandido ? 20 : 8);
    const max = ordenado.length > 0 ? ordenado[0].restantes : 0;
    const foraDaLista = ordenado.slice(visiveis.length).reduce((s, m) => s + m.restantes, 0);
    return { itens: visiveis, max, restanteFora: foraDaLista };
    // `municipios` é derivado de panorama a cada render — a dependência
    // real e estável é o próprio panorama, não o array recriado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panorama, expandido]);

  const loading = municipios.length === 0;

  return (
    <div
      className="vm-card flex flex-col overflow-hidden rounded-2xl bg-white"
      style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.22)" }}
        >
          <MapPinOff className="h-3.5 w-3.5" style={{ color: "#F59E0B" }} strokeWidth={2} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold text-[var(--vm-text)]">O que ainda falta, por cidade</span>
          <span className="text-[9.5px] text-[var(--vm-faint)]">
            equipamentos sem vistoria — clique pra ver em Central de Vistorias
          </span>
        </div>
      </div>

      {loading ? (
        <div className="px-5 pb-5">
          <div className="h-40 w-full animate-pulse rounded-xl bg-[var(--vm-tile-2)]" />
        </div>
      ) : (
        <div className="px-5 pb-4">
          {/* ── Há quanto tempo espera — o "por quê" antes do "onde" ── */}
          {totalFaixas > 0 && (
            <div className="mb-4">
              <div className="mb-1.5 flex h-3.5 w-full gap-[2px] overflow-hidden rounded-sm">
                {faixas.map((f) => {
                  const pct = (f.total / totalFaixas) * 100;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={f.id}
                      title={`${f.label}: ${fmtNum(f.total)} equipamentos`}
                      style={{ width: `${pct}%`, background: FAIXA_COR[f.id] ?? "#94A3B8" }}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {faixas.map((f) => (
                  <div key={f.id} className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: FAIXA_COR[f.id] ?? "#94A3B8" }}
                    />
                    <span className="text-[9.5px]" style={{ color: "var(--vm-faint)" }}>
                      {f.label}
                    </span>
                    <span
                      className="text-[10px] font-bold tabular-nums"
                      style={{ color: "var(--vm-text)" }}
                    >
                      {fmtNum(f.total)}
                    </span>
                  </div>
                ))}
                {panorama?.backlog.idadeMediaDias != null && (
                  <span className="ml-auto text-[9.5px] tabular-nums" style={{ color: "var(--vm-faint)" }}>
                    média {panorama.backlog.idadeMediaDias}d na fila
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {itens.map((m) => {
              const pct = max > 0 ? (m.restantes / max) * 100 : 0;
              return (
                <button
                  key={m.municipio}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/painel/central-vistorias?status=1&busca=${encodeURIComponent(m.municipio)}`
                    )
                  }
                  className="group flex w-full items-center gap-2.5 rounded-lg py-1 text-left transition hover:bg-[var(--vm-tile)]"
                >
                  <span
                    className="w-[104px] shrink-0 truncate text-[11px] font-medium"
                    style={{ color: "var(--vm-text)" }}
                    title={m.municipio}
                  >
                    {m.municipio}
                  </span>
                  <div className="h-4 flex-1 overflow-hidden rounded" style={{ background: "var(--vm-tile-2)" }}>
                    <div
                      className="h-full rounded transition-[width] duration-700 ease-out group-hover:opacity-80"
                      style={{ width: `${Math.max(pct, 3)}%`, background: "#F59E0B" }}
                    />
                  </div>
                  <span
                    className="w-10 shrink-0 text-right text-[11px] font-bold tabular-nums"
                    style={{ color: "var(--vm-text)" }}
                  >
                    {fmtNum(m.restantes)}
                  </span>
                  <span
                    className="hidden w-14 shrink-0 text-right text-[9.5px] tabular-nums sm:block"
                    style={{ color: "var(--vm-faint)" }}
                    title="idade média do que está esperando nesta cidade"
                  >
                    {m.idadeMediaDias != null ? `${m.idadeMediaDias}d` : "—"}
                  </span>
                </button>
              );
            })}
          </div>

          {municipios.length > 8 && (
            <button
              type="button"
              onClick={() => setExpandido((v) => !v)}
              className="mt-2.5 text-[10.5px] font-semibold"
              style={{ color: "#F59E0B" }}
            >
              {expandido
                ? "mostrar menos"
                : `+ ${municipios.length - 8} cidades · ${fmtNum(restanteFora)} equipamentos`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
