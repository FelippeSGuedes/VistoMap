"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Save } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { ConfigHeader } from "../_shared";

interface ExpedienteConfig {
  inicio: string;
  fim: string;
  fimDeSemana: boolean;
}

export default function ExpedientePage() {
  const { session } = useAuthStore();
  const [config, setConfig] = useState<ExpedienteConfig | null>(null);
  const [inicio, setInicio] = useState("07:30");
  const [fim, setFim] = useState("18:00");
  const [fimDeSemana, setFimDeSemana] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${session?.token}` };

  const fetchConfig = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const r = await api.get<{ config: ExpedienteConfig }>("/painel/expediente/config", { headers });
      setConfig(r.data.config);
      setInicio(r.data.config.inicio);
      setFim(r.data.config.fim);
      setFimDeSemana(r.data.config.fimDeSemana);
    } catch {
      /* mantém defaults */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const alterado =
    !!config &&
    (config.inicio !== inicio || config.fim !== fim || config.fimDeSemana !== fimDeSemana);

  async function handleSave() {
    if (inicio >= fim) {
      setErro("O horário de início deve ser antes do horário de fim.");
      return;
    }
    setErro(null);
    setSaving(true);
    setSaved(false);
    try {
      const r = await api.put<{ config: ExpedienteConfig }>(
        "/painel/expediente/config",
        { inicio, fim, fimDeSemana },
        { headers }
      );
      setConfig(r.data.config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Falha ao salvar.";
      setErro(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ConfigHeader icon={Clock} title="Expediente" subtitle="Janela de rastreio automático do app técnico." />

      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
      >
        <p className="mb-5 text-[12.5px] leading-relaxed text-gray-500">
          O app não tem mais botão de iniciar/pausar/finalizar — o rastreio de
          localização abre sozinho quando o técnico usa o app dentro da janela
          abaixo, e fecha sozinho fora dela. É contínuo (sem pausa de almoço).
          Fora da janela e nos fins de semana (salvo se ativado abaixo), o app
          não coleta GPS e não permite iniciar vistorias.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-gray-400">
            <RefreshCw className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Início</label>
                <input
                  type="time"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] font-semibold text-gray-800 outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Fim</label>
                <input
                  type="time"
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] font-semibold text-gray-800 outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
                />
              </div>
            </div>

            <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl bg-[var(--vm-fill)] px-3.5 py-3">
              <div>
                <p className="text-[13px] font-semibold text-gray-800">Rastrear em fins de semana</p>
                <p className="text-[11.5px] text-gray-500">Desligado por padrão (sábado e domingo sem rastreio).</p>
              </div>
              <input
                type="checkbox"
                checked={fimDeSemana}
                onChange={(e) => setFimDeSemana(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-[#00B388]"
              />
            </label>

            {erro && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {erro}
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={!alterado || saving}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00B388] py-3 text-[13px] font-bold text-white transition hover:bg-[#00875F] disabled:opacity-40"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saved ? "Salvo" : "Salvar alterações"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
