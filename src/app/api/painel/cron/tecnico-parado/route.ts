import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { ensureIdleAlertsTable } from "@/lib/ensureIdleAlertsTable";
import { fetchPainelMapa } from "@/lib/glpi/painel";
import { auditInsert } from "@/lib/glpi/audit";
import { sendPainelWebPush } from "@/lib/webpush";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Mesmo limiar do badge vermelho no mapa (techModel3DLayer.ts PARADO_ALERTA_MIN). */
const PARADO_ALERTA_MIN = 30;

/**
 * Dispara o alerta de "técnico parado" pro analista. Disparado por cron
 * externo (crontab do host), NÃO por sessão de painel — mesmo padrão e
 * MESMO secret de api/painel/cpfl/lembrete/route.ts (X-Cron-Secret /
 * CRON_LEMBRETE_SECRET): é um segredo interno já provisionado no host pra
 * gatilhos por tempo, não vale criar um segundo nome só pra este.
 *
 * Idempotente por design: cada técnico que cruza o limiar ganha UMA linha
 * em glpi_plugin_vistomap_idle_alerts (resolvido_em NULL = alerta aberto);
 * enquanto ela seguir aberta, novos ciclos do cron não repetem o push. A
 * linha fecha sozinha quando o técnico deixa de estar parado (voltou a se
 * mover ou entrou em vistoria) — o próximo episódio de parado abre uma
 * linha nova e alerta de novo.
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
    await ensureIdleAlertsTable();

    const { tecnicos } = await fetchPainelMapa();
    const paradosAgora = tecnicos.filter(
      (t) =>
        t.status_operacional === "parado" &&
        t.parado_desde_min != null &&
        t.parado_desde_min >= PARADO_ALERTA_MIN
    );

    const abertos = await query<{ id: number; users_id: number }>(
      `SELECT id, users_id FROM glpi_plugin_vistomap_idle_alerts WHERE resolvido_em IS NULL`
    );
    const idsComAlertaAberto = new Set(abertos.map((a) => a.users_id));
    const idsParadosAgora = new Set(paradosAgora.map((t) => t.users_id));

    // Novos: parado >= limiar agora, sem alerta aberto ainda.
    let novos = 0;
    for (const t of paradosAgora) {
      if (idsComAlertaAberto.has(t.users_id)) continue;
      await execute(
        `INSERT INTO glpi_plugin_vistomap_idle_alerts (users_id) VALUES (?)`,
        [t.users_id]
      );
      novos++;
      void auditInsert({
        ator: { id: 0, nome: "Sistema", role: "admin" },
        acao: "tecnico-parado",
        alvo: { tipo: "tecnico", id: String(t.users_id), label: t.nome },
        descricao: `${t.nome} parado há ${t.parado_desde_min}min sem estar em vistoria.`,
      });
      void sendPainelWebPush({
        acao: "tecnico-parado",
        equipamento: `Parado há ${t.parado_desde_min}min`,
        tecnico: t.nome,
        vistoriaId: t.users_id,
      });
    }

    // Resolvidos: tinham alerta aberto, mas não estão mais parados >= limiar.
    let resolvidos = 0;
    for (const usersId of idsComAlertaAberto) {
      if (idsParadosAgora.has(usersId)) continue;
      await execute(
        `UPDATE glpi_plugin_vistomap_idle_alerts
            SET resolvido_em = NOW()
          WHERE users_id = ? AND resolvido_em IS NULL`,
        [usersId]
      );
      resolvidos++;
    }

    return NextResponse.json({
      ok: true,
      parados_agora: paradosAgora.length,
      alertas_novos: novos,
      alertas_resolvidos: resolvidos,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/painel/cron/tecnico-parado]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
