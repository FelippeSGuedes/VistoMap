"use client";

/**
 * AtualizacaoCard — botão de "procurar atualização" no Perfil.
 *
 * POR QUE EXISTE: a atualização OTA só rodava sozinha, uma vez por abertura
 * do app, e desistia por 10 minutos depois de duas falhas (o disjuntor).
 * Num técnico com sinal ruim isso virava um beco: ele via "Disjuntor OTA
 * acionado" e não tinha NADA pra fazer além de fechar e abrir o app de
 * novo — ou resetar os dados, que também apaga a fila offline. Pedido
 * direto em 2026-10-05 depois de várias falhas seguidas em campo.
 *
 * O toque manual ignora o disjuntor de propósito: ele existe pra impedir
 * LOOP automático, e um toque deliberado (tipicamente já no wi-fi, depois
 * de ver que falhou) é exatamente o caso em que insistir é o certo.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Download, Loader2, RefreshCw } from "lucide-react";
import {
  executarAtualizacaoOta,
  lerVersaoOtaAtual,
  type ResultadoOta,
} from "@/hooks/useOtaUpdate";
import { useOtaStore } from "@/store/ota";

export function AtualizacaoCard() {
  const [versao, setVersao] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoOta | null>(null);
  const progresso = useOtaStore((s) => s.progresso);
  const phase = useOtaStore((s) => s.phase);

  useEffect(() => {
    void lerVersaoOtaAtual().then(setVersao);
  }, []);

  const procurar = useCallback(async () => {
    setRodando(true);
    setResultado(null);
    try {
      const r = await executarAtualizacaoOta({ origem: "manual" });
      setResultado(r);
      if (r.estado === "ja-atualizado") setVersao(r.versaoAtual ?? versao);
    } finally {
      // Em "atualizando" o WebView recarrega e esta tela morre junto; o
      // finally é pros outros casos.
      setRodando(false);
    }
  }, [versao]);

  const baixando = rodando && phase === "baixando";

  return (
    <section>
      <p
        className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: "#B0BAC5" }}
      >
        Atualização
      </p>
      <div
        className="overflow-hidden rounded-2xl p-3.5"
        style={{
          background: "rgba(255,255,255,0.9)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 3px rgba(6,59,59,0.04)",
          border: "1px solid rgba(6,59,59,0.05)",
        }}
      >
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <span className="text-[12.5px] font-medium" style={{ color: "#5A6775" }}>
            Versão instalada
          </span>
          <span
            className="truncate font-mono text-[12px] font-semibold"
            style={{ color: "#063B3B" }}
          >
            {versao ?? "—"}
          </span>
        </div>

        <button
          type="button"
          onClick={procurar}
          disabled={rodando}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[13.5px] font-semibold transition active:scale-[0.98] disabled:opacity-70"
          style={{
            background: "rgba(0,179,136,0.10)",
            border: "1px solid rgba(0,179,136,0.28)",
            color: "#00835F",
          }}
        >
          {rodando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {baixando ? `Baixando… ${progresso}%` : "Procurando…"}
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Procurar atualização
            </>
          )}
        </button>

        {resultado && !rodando && <Resultado r={resultado} />}

        <p className="mt-2.5 text-center text-[10.5px] leading-snug" style={{ color: "#9AA6B2" }}>
          Prefira Wi-Fi. A atualização baixa alguns MB de uma vez e, em sinal
          fraco, pode cair no meio.
        </p>
      </div>
    </section>
  );
}

function Resultado({ r }: { r: ResultadoOta }) {
  if (r.estado === "atualizando") {
    return (
      <Faixa tom="ok" icone={<Download className="h-3.5 w-3.5" />}>
        Atualizando para {r.versaoNova} — o app vai reiniciar.
      </Faixa>
    );
  }
  if (r.estado === "ja-atualizado") {
    return (
      <Faixa tom="ok" icone={<Check className="h-3.5 w-3.5" />}>
        Já está na versão mais recente.
      </Faixa>
    );
  }
  return (
    <Faixa tom="erro" icone={<AlertTriangle className="h-3.5 w-3.5" />}>
      {r.motivo ?? "Não foi possível atualizar."}
    </Faixa>
  );
}

function Faixa({
  tom,
  icone,
  children,
}: {
  tom: "ok" | "erro";
  icone: React.ReactNode;
  children: React.ReactNode;
}) {
  const ok = tom === "ok";
  return (
    <div
      className="mt-2.5 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] leading-snug"
      style={{
        background: ok ? "rgba(0,179,136,0.08)" : "rgba(239,68,68,0.07)",
        border: `1px solid ${ok ? "rgba(0,179,136,0.22)" : "rgba(239,68,68,0.20)"}`,
        color: ok ? "#00704F" : "#B42318",
      }}
    >
      <span className="mt-[1px] shrink-0">{icone}</span>
      <span>{children}</span>
    </div>
  );
}
