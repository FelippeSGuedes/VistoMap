import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { registrarSnapshotDiario } from "@/lib/glpi/dashboardSnapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Disparado 1x/dia por cron externo (crontab do host), mesmo padrão e
 * MESMO secret de api/painel/cron/tecnico-parado (X-Cron-Secret /
 * CRON_LEMBRETE_SECRET) — segredo já provisionado no host pra gatilhos por
 * tempo, não vale criar um segundo nome só pra este.
 *
 * Grava o snapshot diário dos 5 KPIs do dashboard do técnico (ver
 * dashboardSnapshot.ts) — sem isso, a "tendência 7 dias" do dashboard
 * continuaria mock pra sempre.
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
    const result = await registrarSnapshotDiario();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/dashboard-snapshot] error", error);
    return NextResponse.json(
      { message: "Falha ao registrar snapshot", error: String(error) },
      { status: 500 }
    );
  }
}
