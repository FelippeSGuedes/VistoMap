"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Play, Square, Coffee, ShieldCheck } from "lucide-react";
import { useExpedienteStore } from "@/store/expediente";

function elapsedHms(fromIso: string): string {
  const ms = Date.now() - new Date(fromIso).getTime();
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Card grande do dashboard do tecnico.
 * Estados: fora-de-expediente | em-expediente | em-pausa.
 *
 * Iniciar expediente — primeira vez pede aceite LGPD via modal.
 * Sem expediente aberto: GPS reporter pausa, app bloqueia iniciar vistoria.
 */
export function ExpedienteCard() {
  const { expediente, lgpdAceito, refresh, iniciar, finalizar, togglePausa, loading } =
    useExpedienteStore();
  const [showLGPD, setShowLGPD] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);

  // refresh inicial + a cada 30s
  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  // ticker pra atualizar HH:MM em tempo real
  useEffect(() => {
    if (!expediente?.emAndamento) return;
    const id = window.setInterval(() => force((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [expediente?.emAndamento]);

  const handleIniciar = async () => {
    if (!lgpdAceito) {
      setShowLGPD(true);
      return;
    }
    setBusy(true);
    const r = await iniciar(false);
    setBusy(false);
    if (!r.ok && r.precisaLGPD) setShowLGPD(true);
  };

  const aceitarLGPDeIniciar = async () => {
    setBusy(true);
    const r = await iniciar(true);
    setBusy(false);
    setShowLGPD(false);
    if (!r.ok) {
      alert(r.message ?? "Falha ao iniciar expediente");
    }
  };

  if (loading && !expediente) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">Carregando expediente…</p>
      </div>
    );
  }

  // ─── Fora de expediente ───
  if (!expediente?.emAndamento) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Status do dia
              </p>
              <h3 className="text-base font-semibold text-slate-800">Fora de expediente</h3>
            </div>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            GPS desativado. Inicie o expediente para começar suas vistorias e
            autorizar o rastreio de localização durante o turno.
          </p>
          <button
            type="button"
            onClick={handleIniciar}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-md transition active:scale-[0.98] disabled:opacity-60"
          >
            <Play className="h-4 w-4" />
            Iniciar expediente
          </button>
        </motion.div>

        {showLGPD && (
          <LGPDModal
            onAceitar={aceitarLGPDeIniciar}
            onRecusar={() => setShowLGPD(false)}
            busy={busy}
          />
        )}
      </>
    );
  }

  // ─── Em expediente / em pausa ───
  const elapsed = elapsedHms(expediente.inicio_at);
  const corBase = expediente.emPausa ? "#F59E0B" : "#00B388";
  const labelStatus = expediente.emPausa ? "Pausa-almoço" : "Em expediente";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
    >
      <div
        className="px-5 pt-5 pb-4"
        style={{
          background: `linear-gradient(135deg, ${corBase}15, ${corBase}05)`,
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: corBase }}>
              {labelStatus}
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-800">
              {elapsed}
            </p>
            <p className="text-[11px] text-slate-500">
              desde {new Date(expediente.inicio_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <span
            className="flex h-3 w-3 rounded-full"
            style={{ background: corBase, boxShadow: `0 0 12px ${corBase}` }}
          />
        </div>
      </div>
      <div className="flex gap-2 p-3">
        <button
          type="button"
          onClick={async () => {
            setBusy(true);
            await togglePausa();
            setBusy(false);
          }}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition active:scale-[0.98] disabled:opacity-60"
        >
          <Coffee className="h-3.5 w-3.5" />
          {expediente.emPausa ? "Voltar do almoço" : "Pausa almoço"}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!confirm("Finalizar expediente? GPS será desligado.")) return;
            setBusy(true);
            await finalizar();
            setBusy(false);
          }}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition active:scale-[0.98] disabled:opacity-60"
        >
          <Square className="h-3.5 w-3.5" />
          Finalizar
        </button>
      </div>
    </motion.div>
  );
}

function LGPDModal({
  onAceitar,
  onRecusar,
  busy,
}: {
  onAceitar: () => void;
  onRecusar: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h3 className="text-base font-semibold text-slate-800">
            Consentimento de rastreio (LGPD)
          </h3>
        </div>
        <p className="mb-2 text-[13px] leading-relaxed text-slate-600">
          Ao iniciar o expediente, você autoriza a coleta da sua localização GPS{" "}
          <strong>exclusivamente durante o turno de trabalho declarado</strong>.
        </p>
        <ul className="mb-4 list-disc space-y-1 pl-5 text-[12.5px] text-slate-600">
          <li>Coleta cessa ao finalizar o expediente.</li>
          <li>Dados usados para coordenação operacional e auditoria.</li>
          <li>Retenção máxima: 12 meses.</li>
          <li>Base legal: LGPD art. 7º V (execução de contrato).</li>
        </ul>
        <p className="mb-4 text-[12px] text-slate-500">
          Você pode revogar o consentimento a qualquer momento contatando o RH.
          Sem aceite, o app não permite iniciar vistorias.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRecusar}
            className="flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-700 transition active:scale-[0.98]"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={onAceitar}
            disabled={busy}
            className="flex-1 rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-white shadow-md transition active:scale-[0.98] disabled:opacity-60"
          >
            Aceitar e iniciar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
