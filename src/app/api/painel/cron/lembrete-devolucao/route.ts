import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { sendPushTo } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lembrete rápido (push FCM) pro técnico que tem devolução autoagendada
 * pra HOJE (ver agendamentosTecnico.ts) — disparado 2x ao dia (08:00 e
 * 16:00) por crontab externo do host, mesmo segredo/padrão dos outros
 * crons (ver tecnico-parado/route.ts). Sem tabela de dedupe: cada disparo
 * do crontab É uma notificação intencional, não um alerta condicional.
 */
function autorizado(req: Request): boolean {
  const secretEsperado = process.env.CRON_LEMBRETE_SECRET;
  if (!secretEsperado) return false;
  const recebido = req.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(recebido);
  const b = Buffer.from(secretEsperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }

  try {
    const rows = await query<{ tecnico_id: number; quantidade: number }>(
      `SELECT tecnico_id, COUNT(*) AS quantidade
         FROM glpi_plugin_vistomap_agendamentos
        WHERE status = 'AGENDADA' AND origem = 'TECNICO' AND data_agendada = CURDATE()
        GROUP BY tecnico_id`
    );

    for (const r of rows) {
      void sendPushTo({
        usersIds: [r.tecnico_id],
        title: "Lembrete",
        body:
          r.quantidade === 1
            ? "Você tem 1 devolução agendada pra hoje."
            : `Você tem ${r.quantidade} devoluções agendadas pra hoje.`,
        data: { url: "/dashboard", type: "lembrete-devolucao" },
      });
    }

    return NextResponse.json({ ok: true, tecnicos_notificados: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/painel/cron/lembrete-devolucao]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
