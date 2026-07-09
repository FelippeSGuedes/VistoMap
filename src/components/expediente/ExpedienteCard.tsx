"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, ShieldCheck, CalendarOff, MoonStar } from "lucide-react";
import { useExpedienteStore } from "@/store/expediente";

/**
 * Card do dashboard do técnico — 100% passivo, sem botões.
 *
 * O expediente é automático: abre sozinho quando o técnico usa o app dentro
 * da janela configurada pelo admin (padrão 07:30–18:00, dias úteis) e fecha
 * sozinho fora dela. Contínuo — sem pausa de almoço. Este card só reflete o
 * estado atual; a única interação possível é o aceite de consentimento LGPD
 * (obrigatório 1x, aparece sozinho quando pendente).
 */
export function ExpedienteCard() {
  const { expediente, lgpdAceito, janela, refresh, aceitarLGPD, loading } =
    useExpedienteStore();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // refresh inicial + a cada 30s
  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const handleAceitar = async () => {
    setBusy(true);
    const r = await aceitarLGPD();
    setBusy(false);
    if (!r.ok) alert(r.message ?? "Falha ao registrar aceite");
  };

  if (loading && !expediente && !janela) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">Carregando expediente…</p>
      </div>
    );
  }

  // Consentimento LGPD pendente — bloqueia o rastreio/vistorias até aceitar
  // (o gate real é no servidor). Aparece sozinho, sem precisar de um botão
  // "iniciar" antes; "Agora não" só fecha o modal, não desbloqueia nada.
  if (!lgpdAceito) {
    if (dismissed) {
      return (
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="flex w-full items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-amber-800">Consentimento pendente</p>
            <p className="text-[11.5px] text-amber-600">Toque para revisar e liberar o rastreio.</p>
          </div>
        </button>
      );
    }
    return (
      <LGPDModal onAceitar={handleAceitar} onFechar={() => setDismissed(true)} busy={busy} />
    );
  }

  // ─── Em expediente (dentro da janela + turno aberto) ───
  if (expediente?.emAndamento) {
    // MySQL retorna "2026-07-08 18:25:00" sem timezone — o browser assume
    // horário local se não forçarmos UTC (mesmo bug já corrigido em
    // notificacoes/page.tsx: sem o "Z", o horário aparece ~3h adiantado).
    const desde = new Date(expediente.inicio_at.replace(" ", "T") + "Z").toLocaleTimeString(
      "pt-BR",
      { hour: "2-digit", minute: "2-digit" }
    );
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      >
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ background: "linear-gradient(135deg, #00B38818, #00B38806)" }}
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: "#00B3881f", color: "#00B388" }}
          >
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#00B388" }}>
              Em expediente
            </p>
            <p className="text-[13px] font-medium text-slate-600">Ativo desde {desde}</p>
          </div>
          <span
            className="flex h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: "#00B388", boxShadow: "0 0 10px #00B388" }}
          />
        </div>
      </motion.div>
    );
  }

  // ─── Fora da janela: fim de semana, antes ou depois do horário ───
  const motivo = janela?.motivo;
  const Icone = motivo === "fds" ? CalendarOff : MoonStar;
  const titulo =
    motivo === "fds"
      ? "Fim de semana"
      : motivo === "antes"
        ? "Expediente ainda não começou"
        : "Expediente encerrado";
  const desc =
    motivo === "fds"
      ? "Sem rastreio aos fins de semana, salvo acordo prévio com o Gestor. Vistorias ficam disponíveis nos dias úteis."
      : janela
        ? `Rastreio ativo das ${janela.inicio} às ${janela.fim}, dias úteis.`
        : "Fora do horário de expediente.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Icone className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Status do dia
          </p>
          <h3 className="text-base font-semibold text-slate-800">{titulo}</h3>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{desc}</p>
    </motion.div>
  );
}

function LGPDModal({
  onAceitar,
  onFechar,
  busy,
}: {
  onAceitar: () => void;
  onFechar: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:items-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h3 className="text-base font-semibold text-slate-800">
              Termo de Consentimento — Tratamento de Dados de Geolocalização
            </h3>
          </div>
          <p className="mb-2 text-[13px] leading-relaxed text-slate-600">
            Em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de
            Dados Pessoais — LGPD), o presente termo tem por finalidade obter
            o consentimento livre, informado e inequívoco do titular para a
            coleta e o tratamento de dados de geolocalização (GPS) durante o
            exercício das atividades laborais.
          </p>
          <ul className="mb-4 list-disc space-y-1.5 pl-5 text-[12.5px] leading-snug text-slate-600">
            <li>
              A coleta de dados de localização ocorre exclusivamente durante o
              período de expediente definido conforme jornada de trabalho
              vigente.
            </li>
            <li>
              É vedada a coleta de dados fora do horário de expediente, no
              período noturno ou em finais de semana,{" "}
              <strong>salvo mediante acordo prévio e expresso com o
              Gestor imediato</strong>, nas hipóteses de necessidade
              operacional devidamente justificada.
            </li>
            <li>
              Os dados coletados serão utilizados exclusivamente para fins de
              coordenação operacional, controle de jornada e auditoria
              interna.
            </li>
            <li>
              Prazo de retenção: até 12 (doze) meses, findo o qual os dados
              serão eliminados ou anonimizados.
            </li>
            <li>
              Fundamento legal: art. 7º, inciso V, da LGPD (execução de
              contrato ou de procedimentos preliminares a ele relacionados,
              dos quais seja parte o titular).
            </li>
          </ul>
          <p className="text-[12px] leading-relaxed text-slate-500">
            O titular poderá revogar o presente consentimento a qualquer
            tempo, mediante comunicação ao Administrador do Sistema ou ao
            Gestor imediato, sem prejuízo dos tratamentos realizados
            anteriormente à revogação. A ausência ou a revogação do
            consentimento impede o início de vistorias por meio da
            plataforma.
          </p>
        </div>
        <div className="flex shrink-0 gap-2 border-t border-slate-100 bg-white p-4">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-500 transition active:scale-[0.98]"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={onAceitar}
            disabled={busy}
            className="flex-1 rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-white shadow-md transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Registrando…" : "Aceitar termo"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
