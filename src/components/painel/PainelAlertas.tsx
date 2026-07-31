"use client";

/**
 * Alertas em tempo real do painel — toast na tela + som quando chega um
 * evento operacional importante (recusa, pedido de exceção, vistoria
 * concluída, devolução corrigida). Faz polling de /api/painel/alertas e
 * dispara só para ids novos (não refaz alarme dos que já existiam ao abrir).
 *
 * Só funciona com o painel aberto — é um alerta in-app, não push.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, CheckCircle2, ShieldAlert, Undo2, X } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import type { AlertaEvento } from "@/app/api/painel/alertas/route";

const POLL_MS = 12_000;
const TOAST_TTL_MS = 8_000;
const MAX_VISIVEIS = 4;

type Cfg = { label: string; color: string; icon: React.ElementType; href: string };

const CONFIG: Record<string, Cfg> = {
  "recusa-solicitada":   { label: "Nova recusa",        color: "#DC2626", icon: Ban,         href: "/painel/notificacoes" },
  "override-solicitado": { label: "Pedido de exceção",  color: "#F59E0B", icon: ShieldAlert, href: "/painel/notificacoes" },
  "vistoria-finalizada": { label: "Vistoria concluída", color: "#10B981", icon: CheckCircle2, href: "/painel/realizadas" },
  "devolucao-resolvida": { label: "Devolução corrigida", color: "#3B82F6", icon: Undo2,      href: "/painel/devolucoes" },
};

interface Toast {
  key: string;
  cfg: Cfg;
  equipamento: string;
  tecnico: string;
}

export default function PainelAlertas() {
  const router = useRouter();
  const { session } = useAuthStore();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastIdRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  // AudioContext só toca depois de um gesto do usuário — destrava no 1º clique.
  useEffect(() => {
    const unlock = () => {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AC && !audioRef.current) audioRef.current = new AC();
        void audioRef.current?.resume();
      } catch { /* ignora */ }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const tocarDing = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx || ctx.state !== "running") return;
    const t0 = ctx.currentTime;
    // ding de dois tons (agradável, curto)
    ([[880, 0], [1174.66, 0.11]] as const).forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + delay;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  }, []);

  const dismiss = useCallback((key: string) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  const enfileirar = useCallback((eventos: AlertaEvento[]) => {
    // ordem cronológica (o feed vem DESC) e limita o burst
    const novos = [...eventos].reverse();
    for (const e of novos) {
      const cfg = CONFIG[e.acao];
      if (!cfg) continue;
      const key = `${e.acao}-${e.id}`;
      setToasts((prev) => [
        ...prev.filter((t) => t.key !== key),
        { key, cfg, equipamento: e.equipamento, tecnico: e.tecnico },
      ].slice(-MAX_VISIVEIS));
      window.setTimeout(() => dismiss(key), TOAST_TTL_MS);
    }
  }, [dismiss]);

  const carregar = useCallback(async () => {
    if (!session?.token) return;
    try {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      const r = await fetch(`${base}/api/painel/alertas`, {
        headers: { Authorization: `Bearer ${session.token}` },
        cache: "no-store",
      });
      if (!r.ok) return;
      const { eventos } = (await r.json()) as { eventos: AlertaEvento[] };
      if (!eventos.length) return;
      const maxId = Math.max(...eventos.map((e) => e.id));

      // 1ª carga: só marca o baseline, sem alarmar o histórico.
      if (lastIdRef.current === null) {
        lastIdRef.current = maxId;
        return;
      }
      const novos = eventos.filter((e) => e.id > (lastIdRef.current ?? 0));
      if (novos.length > 0) {
        lastIdRef.current = maxId;
        enfileirar(novos);
        tocarDing();
      }
    } catch { /* ignora falha de rede */ }
  }, [session?.token, enfileirar, tocarDing]);

  useEffect(() => {
    if (!session?.token) return;
    void carregar();
    const id = window.setInterval(carregar, POLL_MS);
    return () => window.clearInterval(id);
  }, [carregar, session?.token]);

  return (
    <div className="pointer-events-none fixed right-4 top-[68px] z-[60] flex w-[330px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = t.cfg.icon;
          return (
            <motion.button
              key={t.key}
              type="button"
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ duration: 0.28, ease: [0.22, 0.7, 0.2, 1] }}
              onClick={() => { router.push(t.cfg.href); dismiss(t.key); }}
              className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl p-3 text-left shadow-lg"
              style={{
                background: "var(--vm-card, #fff)",
                border: "1px solid var(--vm-border, #e8eaed)",
                boxShadow: "0 8px 28px rgba(0,0,0,0.16)",
              }}
            >
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${t.cfg.color}1A` }}
              >
                <Icon className="h-4 w-4" style={{ color: t.cfg.color }} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-bold" style={{ color: t.cfg.color }}>{t.cfg.label}</p>
                <p className="truncate text-[12px] font-semibold text-[var(--vm-text)]">{t.equipamento}</p>
                <p className="truncate text-[11px] text-[var(--vm-faint)]">{t.tecnico}</p>
              </div>
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); dismiss(t.key); }}
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[var(--vm-faint)] transition hover:bg-black/5"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
