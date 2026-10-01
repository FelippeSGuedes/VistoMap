"use client";

/**
 * /painel/print — render "headless" do dashboard "Equipe ao vivo" pra
 * exportação em PDF (ver /api/painel/export-pdf). NUNCA acessada por uma
 * pessoa de verdade: só o Puppeteer navega aqui (loopback interno,
 * 127.0.0.1, nunca passa pelo nginx) com o token já semeado no
 * localStorage. Por isso busca dados com `fetch` cru em `/api/painel/...`
 * (rota de arquivo real) em vez de `services/painel.ts`/`api.ts` — aquele
 * client usa `NEXT_PUBLIC_BASE_PATH` ("/painel/api/...") pra bater no
 * rewrite do nginx, que não existe nesse acesso direto ao container.
 *
 * Reaproveita <EquipeAoVivo print /> tal e qual a tela usa — mesmo mapa,
 * mesmos gráficos — só troca os controles interativos por texto estático
 * e deixa "Vistorias por município" listar tudo (ver prop `print`).
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import EquipeAoVivo from "../EquipeAoVivo";
import type { HistoricoAnalytics, RankingTecnicoItem, TopTecnicosDashboard } from "@/services/painel";
import type { PainelStats, TecnicoAtivo } from "@/types";
import type { PainelMapaResponse } from "@/types/painel-mapa";

const TOKEN_KEY = "vistomap.token";

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const token = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
    const res = await fetch(path, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

declare global {
  interface Window {
    __PDF_READY__?: boolean;
  }
}

function PainelPrintPageInner() {
  const params = useSearchParams();
  const inicio = params.get("inicio") ?? "";
  const fim = params.get("fim") ?? "";
  const dias = Number(params.get("dias") ?? "30") || 30;
  const concessionaria = params.get("concessionaria") ?? "";
  const municipio = params.get("municipio") ?? "";
  const periodoLabel = params.get("periodoLabel") ?? "30 dias";

  const [stats, setStats] = useState<PainelStats | null>(null);
  const [tecnicos, setTecnicos] = useState<TecnicoAtivo[]>([]);
  const [historico, setHistorico] = useState<HistoricoAnalytics | null>(null);
  const [topTecsDash, setTopTecsDash] = useState<TopTecnicosDashboard | null>(null);
  const [mapaRealtime, setMapaRealtime] = useState<PainelMapaResponse | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const qsBase = new URLSearchParams();
      if (concessionaria) qsBase.set("concessionaria", concessionaria);
      if (municipio) qsBase.set("municipio", municipio);

      const qsHistorico = new URLSearchParams(qsBase);
      if (inicio) qsHistorico.set("inicio", inicio);
      if (fim) qsHistorico.set("fim", fim);

      const qsTop = new URLSearchParams(qsBase);
      qsTop.set("periodo", "personalizado");
      if (inicio) qsTop.set("inicio", inicio);
      if (fim) qsTop.set("fim", fim);
      qsTop.set("limit", "50");

      const qsMapa = new URLSearchParams();
      if (concessionaria) qsMapa.set("concessionaria", concessionaria);
      if (inicio) qsMapa.set("inicio", inicio);
      if (fim) qsMapa.set("fim", fim);

      const [s, t, h, tt, mp] = await Promise.all([
        fetchJson<PainelStats>(`/api/painel/stats?${qsBase.toString()}`),
        fetchJson<TecnicoAtivo[]>(`/api/painel/tecnicos`),
        fetchJson<HistoricoAnalytics>(`/api/painel/historico?${qsHistorico.toString()}`),
        fetchJson<TopTecnicosDashboard>(`/api/painel/dashboard/top-tecnicos?${qsTop.toString()}`),
        fetchJson<PainelMapaResponse>(`/api/painel/mapa?${qsMapa.toString()}`),
      ]);
      if (!alive) return;
      setStats(s);
      setTecnicos(t ?? []);
      setHistorico(h);
      setTopTecsDash(tt);
      setMapaRealtime(mp);
      // Dá um tempo pro mapa (dentro de EquipeAoVivo) montar e carregar os
      // tiles antes de avisar o Puppeteer que pode tirar o PDF.
      window.setTimeout(() => {
        if (alive) {
          setPronto(true);
          window.__PDF_READY__ = true;
        }
      }, 3000);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const equipePeriodo = useMemo(() => {
    const porId = new Map(tecnicos.map((t) => [String(t.id), t]));
    return (topTecsDash?.tecnicos ?? [])
      .map((ranking: RankingTecnicoItem) => ({ ranking, ativo: porId.get(String(ranking.id)) ?? null }))
      .filter((x) => x.ativo?.status !== "offline")
      .sort((a, b) => b.ranking.total - a.ranking.total);
  }, [topTecsDash, tecnicos]);

  const tecnicosPorReprovacao = useMemo(
    () =>
      [...(topTecsDash?.tecnicos ?? [])]
        .filter((t) => t.reprovadas > 0)
        .sort((a, b) => b.reprovadas - a.reprovadas)
        .slice(0, 6),
    [topTecsDash]
  );

  const vistoriasMapa = useMemo(
    () => (mapaRealtime?.vistorias ?? []).filter((v) => v.tecnico_id != null),
    [mapaRealtime]
  );
  const tecnicosMapa = useMemo(
    () => (mapaRealtime?.tecnicos ?? []).filter((t) => t.status_operacional !== "offline"),
    [mapaRealtime]
  );

  return (
    <div style={{ background: "#F4F5F7", padding: 20, minHeight: "100vh" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0B0B0B" }}>Dashboard VistoMap — Equipe ao vivo</div>
        <div style={{ fontSize: 11.5, color: "#6B7280" }}>
          Período: {periodoLabel} · {concessionaria || "Todas as concessionárias"} · {municipio || "Todos os municípios"} · Gerado em{" "}
          {new Date().toLocaleString("pt-BR")}
        </div>
      </div>
      {!pronto && <div style={{ fontSize: 12, color: "#9CA3AF", padding: 24 }}>Carregando dados…</div>}
      <div style={{ opacity: pronto ? 1 : 0 }}>
        <EquipeAoVivo
          periodoLabel={periodoLabel}
          periodoRange={{ inicio, fim, dias }}
          historico={historico}
          topTecsDash={topTecsDash}
          equipePeriodo={equipePeriodo}
          vistoriasMapa={vistoriasMapa}
          tecnicosMapa={tecnicosMapa}
          tecnicosPorReprovacao={tecnicosPorReprovacao}
          kpiEmVistoria={stats?.emVistoria ?? 0}
          kpiEmDeslocamento={stats?.emDeslocamento ?? 0}
          municipio={municipio}
          onMunicipioChange={() => {}}
          onRefresh={() => {}}
          print
        />
      </div>
    </div>
  );
}

export default function PainelPrintPage() {
  return (
    <Suspense fallback={null}>
      <PainelPrintPageInner />
    </Suspense>
  );
}
