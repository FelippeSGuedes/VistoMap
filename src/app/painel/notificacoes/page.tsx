"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Check, Clock, MapPin, User, X } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import type { OverrideRequest } from "@/app/api/painel/notificacoes/route";

function timeAgo(dateStr: string): string {
  // MySQL retorna "2026-06-26 17:22:32" sem timezone — tratar como UTC
  const utc = new Date(dateStr.replace(" ", "T") + "Z");
  const diff = Math.floor((Date.now() - utc.getTime()) / 1000);
  if (diff < 0)    return "agora mesmo";
  if (diff < 60)   return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function StatusBadge({ status }: { status: OverrideRequest["status"] }) {
  const cfg = {
    PENDENTE:  { label: "Aguardando", bg: "#FFF7ED", color: "#C2410C", border: "#FDBA74" },
    APROVADO:  { label: "Aprovado",   bg: "#F0FDF4", color: "#15803D", border: "#86EFAC" },
    REPROVADO: { label: "Recusado",   bg: "#FEF2F2", color: "#B91C1C", border: "#FCA5A5" },
  }[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  );
}

interface CardProps {
  req: OverrideRequest;
  onReply: (id: number, acao: "aprovar" | "reprovar", motivo?: string) => Promise<void>;
}

function RequestCard({ req, onReply }: CardProps) {
  const [motivo, setMotivo] = useState("");
  const [reprovarOpen, setReprovarOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handle = async (acao: "aprovar" | "reprovar") => {
    if (acao === "reprovar" && !reprovarOpen) { setReprovarOpen(true); return; }
    if (acao === "reprovar" && !motivo.trim()) return;
    setLoading(true);
    try {
      await onReply(req.id, acao, motivo.trim() || undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-2xl border p-4 transition"
      style={{
        background: req.status === "PENDENTE" ? "#FFFBEB" : "#FAFAFA",
        borderColor: req.status === "PENDENTE" ? "#FDE68A" : "#E5E7EB",
        boxShadow: req.status === "PENDENTE" ? "0 2px 12px rgba(245,158,11,0.10)" : "none",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <StatusBadge status={req.status} />
            <span className="text-[10px] text-gray-400">{timeAgo(req.created_at)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-800">
            <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {req.tecnico_nome || "Técnico"}
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-gray-600">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {req.equipamento}
            {req.distancia_m != null && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                {req.distancia_m} m
              </span>
            )}
          </div>
          <p className="mt-1 rounded-xl bg-white px-3 py-2 text-[12px] leading-relaxed text-gray-700 ring-1 ring-gray-200">
            <span className="font-semibold text-gray-500">Justificativa: </span>
            {req.justificativa}
          </p>
          {req.motivo_reprovacao && (
            <p className="text-[11px] text-red-600">
              <span className="font-semibold">Motivo da recusa: </span>{req.motivo_reprovacao}
            </p>
          )}
        </div>
      </div>

      {req.status === "PENDENTE" && (
        <div className="mt-3 space-y-2">
          {reprovarOpen && (
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Informe o motivo da recusa…"
              rows={2}
              className="w-full resize-none rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-gray-800 outline-none ring-0 focus:border-red-400"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => handle("aprovar")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
            >
              <Check className="h-4 w-4" />
              Aprovar
            </button>
            <button
              type="button"
              disabled={loading || (reprovarOpen && !motivo.trim())}
              onClick={() => handle("reprovar")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#DC2626,#B91C1C)" }}
            >
              <X className="h-4 w-4" />
              {reprovarOpen ? "Confirmar recusa" : "Reprovar"}
            </button>
          </div>
          {reprovarOpen && (
            <button
              type="button"
              onClick={() => { setReprovarOpen(false); setMotivo(""); }}
              className="w-full text-center text-[11px] text-gray-400 hover:text-gray-600"
            >
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function NotificacoesPage() {
  const { session } = useAuthStore();
  const [requests, setRequests] = useState<OverrideRequest[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">("default");
  const prevPendentesRef = useRef(0);

  const fetch = useCallback(async () => {
    if (!session?.token) return;
    try {
      const r = await api.get<{ requests: OverrideRequest[]; pendentes: number }>(
        "/painel/notificacoes",
        { headers: { Authorization: `Bearer ${session.token}` } }
      );
      const newPend = r.data.pendentes;
      if (newPend > prevPendentesRef.current && prevPendentesRef.current >= 0 && notifPerm === "granted") {
        new Notification("VistoMap — Nova solicitação", {
          body: `${newPend} solicitação(ões) aguardando aprovação.`,
          icon: "/logo-vistomap.png",
        });
      }
      prevPendentesRef.current = newPend;
      setRequests(r.data.requests);
      setPendentes(newPend);
    } catch { /* ignora */ }
    finally { setLoading(false); }
  }, [session?.token, notifPerm]);

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifPerm(Notification.permission);
    else setNotifPerm("unsupported");
  }, []);

  useEffect(() => {
    fetch();
    const id = window.setInterval(fetch, 5000);
    return () => window.clearInterval(id);
  }, [fetch]);

  const requestNotifPerm = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setNotifPerm(result);
  };

  const handleReply = async (id: number, acao: "aprovar" | "reprovar", motivo?: string) => {
    await api.post(
      `/painel/notificacoes/${id}/responder`,
      { acao, motivo },
      { headers: { Authorization: `Bearer ${session?.token}` } }
    );
    await fetch();
  };

  const pendentesLista = requests.filter((r) => r.status === "PENDENTE");
  const historico = requests.filter((r) => r.status !== "PENDENTE");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900">Notificações</h1>
          <p className="text-[13px] text-gray-500">
            Solicitações de início fora do local que precisam de aprovação.
          </p>
        </div>
        {pendentes > 0 && (
          <span className="flex h-8 min-w-[32px] items-center justify-center rounded-full bg-amber-500 px-2 text-[13px] font-bold text-white">
            {pendentes}
          </span>
        )}
      </div>

      {/* Banner notificações do browser */}
      {notifPerm !== "granted" && notifPerm !== "unsupported" && (
        <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <Bell className="h-5 w-5 shrink-0 text-blue-500" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-blue-800">Ative as notificações do site</p>
            <p className="text-[12px] text-blue-600">
              Receba alertas imediatos quando um técnico solicitar aprovação.
            </p>
          </div>
          {notifPerm === "denied" ? (
            <div className="flex items-center gap-1 text-[11px] text-blue-400">
              <BellOff className="h-4 w-4" />
              Bloqueado nas configurações
            </div>
          ) : (
            <button
              type="button"
              onClick={requestNotifPerm}
              className="shrink-0 rounded-xl bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-blue-700"
            >
              Permitir
            </button>
          )}
        </div>
      )}

      {notifPerm === "granted" && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-[12px] text-green-700">
          <Bell className="h-4 w-4" />
          Notificações do site ativadas
        </div>
      )}

      {/* Pendentes */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-gray-400">
          <Clock className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      ) : pendentesLista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center">
          <Check className="mx-auto h-8 w-8 text-green-400" />
          <p className="mt-2 text-[14px] font-medium text-gray-500">Nenhuma solicitação pendente</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
            Aguardando resposta · {pendentesLista.length}
          </p>
          {pendentesLista.map((r) => (
            <RequestCard key={r.id} req={r} onReply={handleReply} />
          ))}
        </div>
      )}

      {/* Histórico */}
      {historico.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Histórico recente · {historico.length}
          </p>
          {historico.map((r) => (
            <RequestCard key={r.id} req={r} onReply={handleReply} />
          ))}
        </div>
      )}
    </div>
  );
}
