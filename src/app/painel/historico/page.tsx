"use client";

/**
 * /painel/historico — Analytics operacionais.
 *
 * Período selecionável (7/30/90 dias). Vistas:
 *  • 6 KPIs grandes
 *  • Série diária empilhada (finalizadas/aprovadas/reprovadas)
 *  • Gauge taxas aprovação/revisita
 *  • Donut volume por status
 *  • Ranking municípios + ranking técnicos (BarRanking)
 */

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Activity,
  Award,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  FileText,
  RefreshCcw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import {
  AreaChart,
  BarRanking,
  DonutChart,
  GaugeRate,
  StackedArea,
} from "@/components/painel/Charts";
import { painelService, type HistoricoAnalytics } from "@/services/painel";

function fmtDia(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const PERIODOS = [
  { id: 7, label: "7 dias" },
  { id: 30, label: "30 dias" },
  { id: 90, label: "90 dias" },
];

export default function HistoricoPainelPage() {
  const [dias, setDias] = useState<number>(30);
  const [data, setData] = useState<HistoricoAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    painelService.fetchHistorico(dias).then((d) => {
      if (alive) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [dias]);

  const labels = data?.serieDiaria.map((s) => fmtDia(s.dia));
  const finalizadasSerie = data?.serieDiaria.map((s) => s.finalizadas) ?? [];
  const aprovadasSerie = data?.serieDiaria.map((s) => s.aprovadas) ?? [];
  const reprovadasSerie = data?.serieDiaria.map((s) => s.reprovadas) ?? [];

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between gap-4"
      >
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: "#00B388" }}
          >
            Analytics · Operação
          </p>
          <h1
            className="mt-1 text-[28px] font-semibold tracking-[-0.5px]"
            style={{ color: "#063B3B" }}
          >
            Histórico Operacional
          </h1>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "#566773" }}>
            Indicadores agregados, séries temporais e produtividade da equipe.
          </p>
        </div>
        <div
          className="flex items-center gap-1 rounded-2xl p-1"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.06)",
            boxShadow: "0 1px 3px rgba(6,59,59,0.03)",
          }}
        >
          {PERIODOS.map((p) => {
            const active = p.id === dias;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setDias(p.id)}
                className="rounded-xl px-3 py-1.5 text-[11.5px] font-semibold transition"
                style={{
                  background: active
                    ? "linear-gradient(135deg, #00C99B 0%, #00875F 100%)"
                    : "transparent",
                  color: active ? "#fff" : "#566773",
                  boxShadow: active
                    ? "0 4px 12px rgba(0,179,136,0.28)"
                    : "none",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* KPIS top */}
      <section className="grid grid-cols-6 gap-3">
        <KpiCard
          icon={ClipboardCheck}
          label="Finalizadas"
          value={data?.totais.vistoriasFinalizadas}
          hex="#00B388"
          pill="#ECFDF5"
          loading={loading}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Aprovadas"
          value={data?.totais.aprovadas}
          hex="#00875F"
          pill="#ECFDF5"
          loading={loading}
        />
        <KpiCard
          icon={XCircle}
          label="Reprovadas"
          value={data?.totais.reprovadas}
          hex="#B91C1C"
          pill="#FEF2F2"
          loading={loading}
        />
        <KpiCard
          icon={RotateCw}
          label="Revisitas finalizadas"
          value={data?.totais.revisitasFinalizadas}
          hex="#C2410C"
          pill="#FFF7ED"
          loading={loading}
        />
        <KpiCard
          icon={FileText}
          label="PDFs gerados"
          value={data?.totais.pdfsGerados}
          hex="#4338CA"
          pill="#EEF2FF"
          loading={loading}
        />
        <KpiCard
          icon={Compass}
          label="Quilometragem"
          value={data?.kmOperacional}
          suffix=" km"
          hex="#0EA5E9"
          pill="#E0F2FE"
          loading={loading}
        />
      </section>

      {/* GRID: série temporal + gauges */}
      <section className="grid grid-cols-12 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="col-span-8 overflow-hidden rounded-[20px] p-5"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.05)",
            boxShadow:
              "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.06)",
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p
                className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
                style={{ color: "#00B388" }}
              >
                Série diária
              </p>
              <h3
                className="mt-0.5 text-[16px] font-semibold tracking-[-0.2px]"
                style={{ color: "#063B3B" }}
              >
                Volume operacional · últimos {dias} dias
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[10.5px]">
              <Legend color="#00B388" label="Finalizadas" />
              <Legend color="#0EA5E9" label="Aprovadas" />
              <Legend color="#EF4444" label="Reprovadas" />
            </div>
          </div>
          <div className="mt-3 h-[240px]">
            {data && (
              <StackedArea
                labels={labels}
                series={[
                  { name: "Finalizadas", color: "#00B388", data: finalizadasSerie },
                  { name: "Aprovadas",   color: "#0EA5E9", data: aprovadasSerie  },
                  { name: "Reprovadas",  color: "#EF4444", data: reprovadasSerie },
                ]}
              />
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="col-span-4 flex flex-col gap-3"
        >
          <div
            className="rounded-[20px] p-4"
            style={{
              background: "#fff",
              border: "1px solid rgba(6,59,59,0.05)",
              boxShadow:
                "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.06)",
            }}
          >
            <p
              className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "#00B388" }}
            >
              Taxa de aprovação
            </p>
            <div className="mt-1 h-[150px]">
              {data && (
                <GaugeRate
                  value={data.taxas.aprovacaoPct}
                  label="aprovação"
                  color="#00B388"
                />
              )}
            </div>
          </div>
          <div
            className="rounded-[20px] p-4"
            style={{
              background: "#fff",
              border: "1px solid rgba(6,59,59,0.05)",
              boxShadow:
                "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.06)",
            }}
          >
            <p
              className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "#C2410C" }}
            >
              Taxa de revisita
            </p>
            <div className="mt-1 h-[150px]">
              {data && (
                <GaugeRate
                  value={data.taxas.revisitaPct}
                  label="revisita"
                  color="#F59E0B"
                />
              )}
            </div>
          </div>
        </motion.div>
      </section>

      {/* GRID: donut + médias */}
      <section className="grid grid-cols-12 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="col-span-4 overflow-hidden rounded-[20px] p-5"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.05)",
            boxShadow:
              "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.06)",
          }}
        >
          <p
            className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#00B388" }}
          >
            Volume por status
          </p>
          <h3
            className="mt-0.5 text-[16px] font-semibold tracking-[-0.2px]"
            style={{ color: "#063B3B" }}
          >
            Distribuição
          </h3>
          <div className="mt-2 h-[200px]">
            {data && (
              <DonutChart
                centerLabel="Total"
                centerValue={data.totais.vistoriasFinalizadas + data.totais.reprovadas}
                segments={[
                  { label: "Aprovadas", value: data.totais.aprovadas, color: "#00B388" },
                  { label: "Em análise", value: Math.max(0, data.totais.vistoriasFinalizadas - data.totais.aprovadas), color: "#0EA5E9" },
                  { label: "Reprovadas", value: data.totais.reprovadas, color: "#EF4444" },
                  { label: "Revisitas", value: data.totais.revisitasFinalizadas, color: "#F59E0B" },
                ]}
              />
            )}
          </div>
          {data && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <Legend color="#00B388" label={`Aprovadas · ${data.totais.aprovadas}`} />
              <Legend color="#0EA5E9" label={`Em análise · ${Math.max(0, data.totais.vistoriasFinalizadas - data.totais.aprovadas)}`} />
              <Legend color="#EF4444" label={`Reprovadas · ${data.totais.reprovadas}`} />
              <Legend color="#F59E0B" label={`Revisitas · ${data.totais.revisitasFinalizadas}`} />
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="col-span-4 flex flex-col justify-between overflow-hidden rounded-[20px] p-5"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,179,136,0.10), rgba(0,179,136,0.02))",
            border: "1px solid rgba(0,179,136,0.22)",
            boxShadow:
              "0 1px 3px rgba(0,179,136,0.04), 0 8px 24px rgba(0,179,136,0.08)",
          }}
        >
          <div>
            <p
              className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "#00875F" }}
            >
              Cadência diária
            </p>
            <h3
              className="mt-0.5 text-[16px] font-semibold tracking-[-0.2px]"
              style={{ color: "#063B3B" }}
            >
              Média operacional
            </h3>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p
                className="text-[40px] font-semibold leading-none tracking-[-0.8px] tabular-nums"
                style={{ color: "#00875F" }}
              >
                {data?.medias.diariaVistorias ?? "—"}
              </p>
              <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#566773" }}>
                Vistorias / dia
              </p>
            </div>
            <div>
              <p
                className="text-[40px] font-semibold leading-none tracking-[-0.8px] tabular-nums"
                style={{ color: "#063B3B" }}
              >
                {data?.medias.semanalVistorias ?? "—"}
              </p>
              <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#566773" }}>
                Vistorias / semana
              </p>
            </div>
          </div>
          {data && data.serieDiaria.length > 0 && (
            <div className="mt-3 h-[60px]">
              <AreaChart data={finalizadasSerie} color="#00B388" height={60} />
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="col-span-4 overflow-hidden rounded-[20px] p-5"
          style={{
            background: "#fff",
            border: "1px solid rgba(6,59,59,0.05)",
            boxShadow:
              "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.06)",
          }}
        >
          <p
            className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#0369A1" }}
          >
            <Building2 className="mr-1 inline h-3 w-3" /> Municípios
          </p>
          <h3
            className="mt-0.5 text-[16px] font-semibold tracking-[-0.2px]"
            style={{ color: "#063B3B" }}
          >
            Top {data?.topMunicipios.length ?? 0}
          </h3>
          <div className="mt-3">
            {data && (
              <BarRanking
                items={data.topMunicipios.map((m) => ({
                  label: m.municipio,
                  value: m.total,
                  color: "#0EA5E9",
                }))}
                height={240}
              />
            )}
          </div>
        </motion.div>
      </section>

      {/* RANKING TÉCNICOS */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[20px] p-5"
        style={{
          background: "#fff",
          border: "1px solid rgba(6,59,59,0.05)",
          boxShadow:
            "0 1px 3px rgba(6,59,59,0.04), 0 8px 24px rgba(6,59,59,0.06)",
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p
              className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "#00B388" }}
            >
              <Award className="mr-1 inline h-3 w-3" /> Ranking
            </p>
            <h3
              className="mt-0.5 text-[16px] font-semibold tracking-[-0.2px]"
              style={{ color: "#063B3B" }}
            >
              Produtividade dos técnicos
            </h3>
          </div>
          <span className="text-[10.5px]" style={{ color: "#A0ACBA" }}>
            {data?.rankingTecnicos.length ?? 0} no top
          </span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "#7A8896" }}>
                <th className="px-2 py-1.5 text-left text-[9.5px] font-bold uppercase tracking-[0.14em]">#</th>
                <th className="px-2 py-1.5 text-left text-[9.5px] font-bold uppercase tracking-[0.14em]">Técnico</th>
                <th className="px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.14em]">Total</th>
                <th className="px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.14em]">Aprovadas</th>
                <th className="px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.14em]">Revisitas</th>
                <th className="px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.14em]">Km</th>
                <th className="px-2 py-1.5 text-left text-[9.5px] font-bold uppercase tracking-[0.14em]">Produtividade</th>
              </tr>
            </thead>
            <tbody>
              {data?.rankingTecnicos.map((t, i) => {
                const max = Math.max(...(data?.rankingTecnicos.map((x) => x.total) ?? [1]), 1);
                const pct = (t.total / max) * 100;
                return (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.03 * i + 0.05 }}
                    style={{ borderTop: "1px solid rgba(6,59,59,0.05)" }}
                  >
                    <td className="px-2 py-2.5">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold tabular-nums"
                        style={{
                          background:
                            i < 3 ? "rgba(0,179,136,0.18)" : "rgba(6,59,59,0.05)",
                          color: i < 3 ? "#00875F" : "#7A8896",
                        }}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                          style={{
                            background:
                              "linear-gradient(145deg, #00B388, #00875F)",
                          }}
                        >
                          {t.nome
                            .split(/[\s._-]+/)
                            .slice(0, 2)
                            .map((s) => s[0])
                            .join("")
                            .toUpperCase()}
                        </span>
                        <span className="font-semibold" style={{ color: "#063B3B" }}>
                          {t.nome}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums font-semibold" style={{ color: "#063B3B" }}>
                      {t.total}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: "#00875F" }}>
                      {t.aprovadas}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: "#C2410C" }}>
                      {t.revisitas}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: "#0369A1" }}>
                      {t.kmPercorrido != null ? `${t.kmPercorrido}` : "—"}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(6,59,59,0.05)" }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background:
                              "linear-gradient(90deg, #00B388, #00875F)",
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: 0.04 * i }}
                        />
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
              {data?.rankingTecnicos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-[12px]" style={{ color: "#A0ACBA" }}>
                    Sem produção registrada no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.section>

      <p
        className="mt-2 flex items-center justify-center gap-1.5 text-[10.5px] font-medium"
        style={{ color: "#A0ACBA" }}
      >
        <Sparkles className="h-3 w-3" style={{ color: "#00B388" }} />
        Km operacional via Haversine sobre pings GPS · Filtros: saltos &gt;5km descartados como drift.
      </p>
    </div>
  );
}

/* ── sub-componentes ────────────────────────────────────────────── */

function KpiCard({
  icon: Icon,
  label,
  value,
  suffix,
  hex,
  pill,
  loading,
}: {
  icon: typeof Activity;
  label: string;
  value?: number | null;
  suffix?: string;
  hex: string;
  pill: string;
  loading?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[18px] p-3.5"
      style={{
        background: "#fff",
        border: "1px solid rgba(6,59,59,0.05)",
        boxShadow:
          "0 1px 3px rgba(6,59,59,0.04), 0 8px 22px rgba(6,59,59,0.07)",
      }}
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-[24px]"
        style={{ background: pill, opacity: 0.9 }}
      />
      <div
        className="relative flex h-8 w-8 items-center justify-center rounded-[10px]"
        style={{ background: pill, color: hex }}
      >
        <Icon className="h-[14px] w-[14px]" strokeWidth={2.2} />
      </div>
      <p
        className="relative mt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "#A0ACBA" }}
      >
        {label}
      </p>
      <div
        className="relative mt-0.5 text-[22px] font-semibold leading-none tracking-[-0.4px] tabular-nums"
        style={{ color: "#063B3B" }}
      >
        {loading ? "—" : (value ?? 0)}
        {suffix && !loading && (
          <span className="text-[12px] font-medium ml-0.5" style={{ color: "#7A8896" }}>
            {suffix}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: "#566773" }}>
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}aa` }}
      />
      {label}
    </span>
  );
}
