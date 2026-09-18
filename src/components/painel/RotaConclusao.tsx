"use client";

import { useMemo } from "react";
import type { PanoramaOperacao } from "@/types";

/**
 * Rota até a conclusão — burn-down do parque com cone de projeção.
 *
 * Por que este gráfico e não um cartão de KPI: a operação de vistoria é um
 * universo FECHADO (todo o parque já está cadastrado, ninguém cria demanda
 * nova). Num universo assim a pergunta gerencial não é "quantos tem em cada
 * status agora" — é "quanto falta, em que ritmo estamos indo e quando isso
 * acaba". Um número solto não responde; a curva descendo até encostar no
 * eixo responde de uma vez.
 *
 * O cone existe porque a resposta honesta é um intervalo, não uma data. O
 * ritmo dos últimos 7 dias e o dos últimos 30 divergem MUITO nesta operação
 * (a equipe acelerou), e escolher um dos dois pra cravar uma data seria
 * fingir uma precisão que o dado não tem. As duas bordas do cone são as duas
 * projeções; a largura dele é literalmente a incerteza.
 *
 * Vive dentro do hero escuro do /painel, então é dark-only de propósito —
 * não é um componente de tema duplo mal resolvido.
 */

const VB_W = 860;
const VB_H = 330;
const PAD_L = 52;
const PAD_R = 16;
const PAD_T = 18;
const PAD_B = 34;

const VERDE = "#00ff88";
const AMBAR = "#f59e0b";

function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtDataCurta(iso: string): string {
  const [a, m] = iso.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m) - 1] ?? ""}/${a.slice(2)}`;
}

function fmtHorizonte(dias: number): string {
  if (dias < 45) return `${dias} dias`;
  const meses = dias / 30.4;
  return `${meses.toFixed(meses < 10 ? 1 : 0).replace(".", ",")} meses`;
}

export function RotaConclusao({ panorama }: { panorama: PanoramaOperacao | null }) {
  const modelo = useMemo(() => {
    if (!panorama) return null;
    const { universo, velocidade, projecao } = panorama;
    const restantesHoje = universo.naoIniciadas;

    /* ── Histórico: reconstrói quantos faltavam em cada dia dos últimos 90.
       restantes(t) = restantes_hoje + tudo que foi finalizado depois de t.
       Derivado do audit log, não estimado.                              ── */
    const serie = velocidade.serie;
    const historico: Array<{ x: number; y: number }> = [];
    let acumuladoFuturo = 0;
    for (let i = serie.length - 1; i >= 0; i--) {
      historico.unshift({ x: i - (serie.length - 1), y: restantesHoje + acumuladoFuturo });
      acumuladoFuturo += serie[i].total;
    }

    /* ── Projeções: as duas bordas do cone ─────────────────────────────── */
    const otim = projecao.otimista;
    const cons = projecao.conservadora;
    // Sem ritmo nenhum não há cone — melhor não desenhar do que inventar.
    if (!otim && !cons) return null;
    const horizonteMax = Math.max(otim?.dias ?? 0, cons?.dias ?? 0);

    const xMin = -(serie.length - 1);
    const xMax = horizonteMax;
    const yMax = Math.max(...historico.map((p) => p.y), restantesHoje) * 1.04;

    const sx = (x: number) => PAD_L + ((x - xMin) / (xMax - xMin)) * (VB_W - PAD_L - PAD_R);
    const sy = (y: number) => PAD_T + (1 - y / yMax) * (VB_H - PAD_T - PAD_B);

    const linhaHist = historico.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ");
    const areaHist = `${PAD_L},${sy(0)} ${linhaHist} ${sx(0)},${sy(0)}`;

    // O cone sai de (hoje, restantes) e abre até as duas datas de término.
    const cone =
      otim && cons
        ? `${sx(0)},${sy(restantesHoje)} ${sx(otim.dias)},${sy(0)} ${sx(cons.dias)},${sy(0)}`
        : null;

    /* ── Marcas de mês no eixo X ───────────────────────────────────────── */
    const hoje = new Date();
    const ticks: Array<{ x: number; label: string }> = [];
    for (let d = xMin; d <= xMax; d++) {
      const dt = new Date(hoje);
      dt.setDate(dt.getDate() + d);
      if (dt.getDate() === 1) {
        ticks.push({ x: d, label: fmtDataCurta(dt.toISOString().slice(0, 10)) });
      }
    }

    // Ponto inicial do histórico (90 dias atrás) — vira uma etiqueta numérica
    // direta, porque a QUEDA real em 90 dias é pequena frente à escala total
    // (esta operação só andou ~14% até agora), então a linha por si fica
    // quase reta e a inclinação sozinha não comunica a evolução. Um número
    // ao lado do outro ("há 90 dias" x "hoje") resolve isso sem mentir sobre
    // a escala do eixo.
    const inicioHist = historico[0];

    return {
      sx,
      sy,
      linhaHist,
      areaHist,
      cone,
      ticks,
      yMax,
      restantesHoje,
      inicioHist,
      otim,
      cons,
      universo,
      velocidade,
    };
  }, [panorama]);

  if (!panorama || !modelo) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.3)",
          fontSize: "0.82rem",
        }}
      >
        Calculando o panorama da operação…
      </div>
    );
  }

  const { sx, sy, linhaHist, areaHist, cone, ticks, yMax, restantesHoje, inicioHist, otim, cons, universo, velocidade } =
    modelo;

  const pct = universo.progressoPct;
  // Aceleração: o ritmo recente contra o do mês — é o que explica por que as
  // duas pontas do cone estão tão distantes uma da outra.
  const acelerando = velocidade.ritmoDia7 > velocidade.ritmoDia30 * 1.15;

  return (
    <div
      style={{
        flex: 1,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: "26px 28px 18px",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      {/* ── Cabeçalho: o número que responde "onde estamos" ────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 22, flexWrap: "wrap" }}>
        <div>
          <div
            style={{
              fontSize: "0.64rem",
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: "rgba(255,255,255,0.4)",
              marginBottom: 6,
            }}
          >
            PROGRESSO DO PARQUE
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              style={{
                fontSize: "2.6rem",
                fontWeight: 800,
                lineHeight: 1,
                color: "#fff",
                letterSpacing: "-0.03em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {pct.toFixed(1).replace(".", ",")}%
            </span>
            <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.55)" }}>
              {fmtNum(universo.concluidas)} de {fmtNum(universo.total)} equipamentos
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, marginLeft: "auto", flexWrap: "wrap" }}>
          <Metrica
            valor={`${velocidade.ritmoDia7.toFixed(1).replace(".", ",")}/dia`}
            rotulo="ritmo · 7 dias"
            cor={acelerando ? VERDE : undefined}
          />
          <Metrica
            valor={`${velocidade.ritmoDiaAtivo.toFixed(0)}/dia`}
            rotulo={`em ${velocidade.diasAtivos30} dias trabalhados`}
          />
          <Metrica valor={fmtNum(restantesHoje)} rotulo="ainda a vistoriar" cor={AMBAR} />
        </div>
      </div>

      {/* ── O gráfico ──────────────────────────────────────────────────── */}
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", flex: 1, marginTop: 10, minHeight: 0, overflow: "visible" }}
        role="img"
        aria-label={`Burn-down: ${fmtNum(restantesHoje)} equipamentos restantes, com projeção de término entre ${
          otim ? fmtHorizonte(otim.dias) : "—"
        } e ${cons ? fmtHorizonte(cons.dias) : "—"}`}
      >
        <defs>
          <linearGradient id="rc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={VERDE} stopOpacity="0.28" />
            <stop offset="100%" stopColor={VERDE} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="rc-cone" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={VERDE} stopOpacity="0.22" />
            <stop offset="100%" stopColor={VERDE} stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* grade horizontal — recessiva, só pra dar escala */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = sy(yMax * f);
          return (
            <g key={f}>
              <line
                x1={PAD_L}
                y1={y}
                x2={VB_W - PAD_R}
                y2={y}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="1"
              />
              <text
                x={PAD_L - 8}
                y={y + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="rgba(255,255,255,0.35)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {f === 0 ? "0" : fmtNum(Math.round(yMax * f))}
              </text>
            </g>
          );
        })}

        {/* cone de projeção — a largura é a incerteza entre os dois ritmos */}
        {cone && <polygon points={cone} fill="url(#rc-cone)" />}
        {otim && (
          <line
            x1={sx(0)}
            y1={sy(restantesHoje)}
            x2={sx(otim.dias)}
            y2={sy(0)}
            stroke={VERDE}
            strokeWidth="1.5"
            strokeDasharray="5 4"
            opacity="0.85"
          />
        )}
        {cons && (
          <line
            x1={sx(0)}
            y1={sy(restantesHoje)}
            x2={sx(cons.dias)}
            y2={sy(0)}
            stroke={VERDE}
            strokeWidth="1.5"
            strokeDasharray="5 4"
            opacity="0.45"
          />
        )}

        {/* histórico real */}
        <polygon points={areaHist} fill="url(#rc-area)" />
        <polyline points={linhaHist} fill="none" stroke={VERDE} strokeWidth="2" />

        {/* marco do "hoje" */}
        <line
          x1={sx(0)}
          y1={PAD_T}
          x2={sx(0)}
          y2={VB_H - PAD_B}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1"
        />
        {/* Marco "há 90 dias" — número explícito ao lado de "hoje", porque a
            queda em 90 dias é pequena frente à escala total e a inclinação
            da linha sozinha não deixa isso óbvio. */}
        <circle cx={sx(inicioHist.x)} cy={sy(inicioHist.y)} r="3" fill="rgba(255,255,255,0.55)" />
        <text
          x={sx(inicioHist.x) + 8}
          y={sy(inicioHist.y) - 7}
          fontSize="9.5"
          fontWeight="700"
          fill="rgba(255,255,255,0.65)"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {fmtNum(inicioHist.y)}
        </text>
        <text
          x={sx(inicioHist.x) + 8}
          y={sy(inicioHist.y) + 12}
          fontSize="8.5"
          fill="rgba(255,255,255,0.4)"
        >
          há 90 dias
        </text>

        <circle cx={sx(0)} cy={sy(restantesHoje)} r="4.5" fill={VERDE} />
        <circle cx={sx(0)} cy={sy(restantesHoje)} r="9" fill={VERDE} opacity="0.18" />
        <text
          x={sx(0)}
          y={PAD_T - 5}
          textAnchor="middle"
          fontSize="9.5"
          fontWeight="700"
          fill="rgba(255,255,255,0.5)"
          letterSpacing="0.1em"
        >
          HOJE
        </text>

        {/* eixo X por mês */}
        {ticks.map((t) => (
          <text
            key={t.x}
            x={sx(t.x)}
            y={VB_H - PAD_B + 15}
            textAnchor="middle"
            fontSize="9.5"
            fill="rgba(255,255,255,0.32)"
          >
            {t.label}
          </text>
        ))}

        {/* rótulos diretos nas duas pontas do cone — sem legenda separada */}
        {otim && (
          <text
            x={sx(otim.dias)}
            y={sy(0) - 9}
            textAnchor="end"
            fontSize="10.5"
            fontWeight="700"
            fill={VERDE}
          >
            {fmtHorizonte(otim.dias)}
          </text>
        )}
        {cons && (
          <text
            x={sx(cons.dias) - 2}
            y={sy(0) - 9}
            textAnchor="end"
            fontSize="10.5"
            fontWeight="600"
            fill="rgba(0,255,136,0.6)"
          >
            {fmtHorizonte(cons.dias)}
          </text>
        )}
      </svg>

      {/* ── Leitura em palavras: o gráfico não deve depender de interpretação ── */}
      <p
        style={{
          margin: "2px 0 0",
          fontSize: "0.74rem",
          lineHeight: 1.5,
          color: "rgba(255,255,255,0.5)",
        }}
      >
        No ritmo das últimas semanas o parque fecha em{" "}
        <strong style={{ color: VERDE, fontWeight: 700 }}>
          {otim ? fmtHorizonte(otim.dias) : "—"}
        </strong>
        ; mantido o ritmo médio dos últimos 30 dias,{" "}
        <strong style={{ color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>
          {cons ? fmtHorizonte(cons.dias) : "—"}
        </strong>
        . {acelerando ? "A equipe está acelerando — a ponta otimista é a mais recente." : "Os dois ritmos estão próximos."}
      </p>
    </div>
  );
}

function Metrica({ valor, rotulo, cor }: { valor: string; rotulo: string; cor?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: "1.05rem",
          fontWeight: 700,
          color: cor ?? "#fff",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.2,
          whiteSpace: "nowrap",
        }}
      >
        {valor}
      </div>
      <div style={{ fontSize: "0.66rem", color: "rgba(255,255,255,0.42)", whiteSpace: "nowrap" }}>
        {rotulo}
      </div>
    </div>
  );
}
