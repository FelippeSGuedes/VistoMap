"use client";

/**
 * /painel/status — Centro de observabilidade do VistoMap.
 *
 * Visão geral de saúde (painel, app técnico, GLPI, banco, OTA, worker) +
 * log de erros recentes das rotas da API — pra não depender de SSH/docker
 * logs toda vez que algo quebra. Auto-refresh a cada 30s.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RadioTower,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { painelService, type ErrorLogEntry, type PainelStatus } from "@/services/painel";

function formatRelativo(iso: string | null): string {
  if (!iso) return "sem dados";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
}

function formatHora(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const SOURCE_LABEL: Record<ErrorLogEntry["source"], string> = {
  app: "App técnico",
  painel: "Painel",
  worker: "Worker",
  glpi: "GLPI",
};

/** Extrai o id do equipamento/vistoria do contexto (JSON livre), se houver. */
function equipamentoIdDoContexto(contexto: string | null): string | null {
  if (!contexto) return null;
  try {
    const obj = JSON.parse(contexto) as Record<string, unknown>;
    const id = obj.id ?? obj.vistoriaId ?? obj.vistoria_id;
    return id != null ? String(id) : null;
  } catch {
    return null;
  }
}

export default function StatusPage() {
  const { session } = useAuthStore();
  const [status, setStatus] = useState<PainelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!session?.token) return;
    try {
      const data = await painelService.fetchStatus();
      setStatus(data);
      setErro(null);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Falha ao carregar status.";
      setErro(msg);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  useEffect(() => {
    carregar();
    const id = window.setInterval(carregar, 30_000);
    return () => window.clearInterval(id);
  }, [carregar]);

  const saudavel = status?.saudeGeral === "saudavel";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--vm-accent-tint)", color: "#00875F" }}
          >
            <Activity className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[20px] font-bold text-gray-900">Status do sistema</h1>
            <p className="text-[13px] text-gray-500">
              {status ? `Verificado ${formatRelativo(status.checadoEm)}` : "Carregando…"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); carregar(); }}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--vm-fill)] px-3 py-2 text-[12.5px] font-semibold text-gray-600 transition hover:bg-gray-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {erro && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {erro}
        </div>
      )}

      {loading && !status ? (
        <div className="flex items-center gap-2 py-10 text-[13px] text-gray-400">
          <RefreshCw className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : status ? (
        <>
          {/* Banner geral */}
          <div
            className="flex items-center gap-3 rounded-2xl px-5 py-4"
            style={{
              background: saudavel ? "#E9F9F1" : "#FFF4E5",
              border: `1px solid ${saudavel ? "#B7EBD1" : "#FFE0B2"}`,
            }}
          >
            {saudavel ? (
              <CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: "#00875F" }} />
            ) : (
              <AlertTriangle className="h-6 w-6 shrink-0" style={{ color: "#B26A00" }} />
            )}
            <div>
              <p className="text-[14.5px] font-bold" style={{ color: saudavel ? "#00875F" : "#B26A00" }}>
                {saudavel ? "Tudo funcionando normalmente" : "Atenção — um ou mais serviços com problema"}
              </p>
              <p className="text-[12px] text-gray-600">
                {status.erros.ultimaHora} erro(s) na última hora · {status.erros.ultimas24h} nas últimas 24h
              </p>
            </div>
          </div>

          {/* Grid de serviços */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {status.servicos.map((s) => (
              <div
                key={s.nome}
                className="rounded-2xl bg-white p-4"
                style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-bold text-gray-900">{s.nome}</p>
                  {s.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#00875F" }} />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                  )}
                </div>
                <p className="mt-1 truncate text-[12px] text-gray-500" title={s.detalhe}>
                  {s.detalhe}
                </p>
                {s.tempo_ms != null && s.tempo_ms > 0 && (
                  <p className="mt-1 text-[10.5px] text-gray-400">{s.tempo_ms} ms</p>
                )}
              </div>
            ))}
          </div>

          {/* Última atualização */}
          <div
            className="rounded-2xl bg-white p-4"
            style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
          >
            <div className="mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4" style={{ color: "#00B388" }} />
              <h2 className="text-[14px] font-bold text-gray-900">Última atualização</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12.5px] text-gray-600 sm:grid-cols-3">
              <div>
                <p className="text-gray-400">Bundle OTA (app)</p>
                <p className="font-semibold text-gray-800">{status.otaVersao ?? "—"}</p>
              </div>
              <div>
                <p className="text-gray-400">Worker — última atividade</p>
                <p className="font-semibold text-gray-800">{formatRelativo(status.workerUltimaAtividade)}</p>
              </div>
            </div>
          </div>

          {/* Log de erros recentes */}
          <div
            className="rounded-2xl bg-white p-4"
            style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
          >
            <h2 className="mb-3 text-[14px] font-bold text-gray-900">
              Erros recentes ({status.erros.recentes.length})
            </h2>
            {status.erros.recentes.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-gray-400">
                Nenhum erro registrado ainda.
              </p>
            ) : (
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
                {status.erros.recentes.map((e) => {
                  const equipId = equipamentoIdDoContexto(e.contexto);
                  return (
                    <div
                      key={e.id}
                      className="rounded-xl bg-[var(--vm-fill)] px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 text-[11px] text-gray-500">
                        <span className="rounded-md bg-white px-1.5 py-0.5 font-semibold text-gray-600">
                          {SOURCE_LABEL[e.source]}
                        </span>
                        {e.rota && <span className="truncate font-mono">{e.rota}</span>}
                        {equipId && (
                          <span className="flex shrink-0 items-center gap-1 rounded-md bg-white px-1.5 py-0.5 font-mono text-gray-600">
                            <RadioTower className="h-2.5 w-2.5" />
                            #{equipId}
                          </span>
                        )}
                        <span className="ml-auto shrink-0">{formatHora(e.ts)}</span>
                      </div>
                      <p className="mt-1 truncate text-[12.5px] text-gray-800" title={e.mensagem}>
                        {e.mensagem}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
