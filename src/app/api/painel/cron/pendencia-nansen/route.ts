import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { ensurePendenciaAlertsTable } from "@/lib/ensurePendenciaAlertsTable";
import { fetchPendenciasNansenAtivas } from "@/lib/glpi/cpfl";
import { auditInsert } from "@/lib/glpi/audit";
import { sendPainelWebPush } from "@/lib/webpush";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dispara o alerta de "nova Pendência Nansen" (statusvistoria = "Aprovado
 * com Pendências", ver STATUS_VISTORIA_APROVADO_COM_PENDENCIAS) pro grupo de
 * Exceção. Disparado por cron externo (crontab do host), NÃO por sessão de
 * painel — mesmo padrão e MESMO secret de api/painel/cron/tecnico-parado e
 * api/painel/cpfl/lembrete (X-Cron-Secret / CRON_LEMBRETE_SECRET).
 *
 * Esse status é gravado pela CPFL direto no GLPI (ver cabeçalho de
 * lib/glpi/cpfl.ts) — nenhuma rota nossa passa por ali, então não existe
 * evento pra pendurar um push. O poll periódico é o único jeito de notar a
 * chegada de uma pendência nova.
 *
 * Idempotente por design, mesmo esquema de glpi_plugin_vistomap_idle_alerts
 * (ver cron/tecnico-parado): cada pendência que aparece ganha UMA linha em
 * glpi_plugin_vistomap_pendencia_alerts (resolvido_em NULL = alerta aberto);
 * enquanto ela seguir aberta, novos ciclos do cron não repetem o push. A
 * linha fecha sozinha quando o equipamento sai da fila (resolvida ou
 * reprovada de novo) — o próximo apontamento da CPFL abre uma linha nova e
 * alerta de novo.
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
    await ensurePendenciaAlertsTable();

    const ativas = await fetchPendenciasNansenAtivas();
    const idsAtivosAgora = new Set(ativas.map((v) => v.id));

    const abertos = await query<{ id: number; items_id: number }>(
      `SELECT id, items_id FROM glpi_plugin_vistomap_pendencia_alerts WHERE resolvido_em IS NULL`
    );
    const idsComAlertaAberto = new Set(abertos.map((a) => a.items_id));

    // Novas: pendência ativa agora, sem alerta aberto ainda.
    let novas = 0;
    for (const v of ativas) {
      if (idsComAlertaAberto.has(v.id)) continue;
      await execute(
        `INSERT INTO glpi_plugin_vistomap_pendencia_alerts (items_id) VALUES (?)`,
        [v.id]
      );
      novas++;
      void auditInsert({
        ator: { id: 0, nome: "Sistema", role: "admin" },
        acao: "pendencia-nansen-detectada",
        alvo: { tipo: "vistoria", id: String(v.id), label: v.equipamento },
        descricao: `${v.equipamento} entrou em "Aprovado com Pendências" (${v.municipio}).`,
      });
      void sendPainelWebPush({
        acao: "pendencia-nansen-detectada",
        equipamento: v.equipamento,
        tecnico: v.municipio,
        vistoriaId: v.id,
      });
    }

    // Resolvidas: tinham alerta aberto, mas não estão mais na fila.
    let resolvidas = 0;
    for (const itemsId of idsComAlertaAberto) {
      if (idsAtivosAgora.has(itemsId)) continue;
      await execute(
        `UPDATE glpi_plugin_vistomap_pendencia_alerts
            SET resolvido_em = NOW()
          WHERE items_id = ? AND resolvido_em IS NULL`,
        [itemsId]
      );
      resolvidas++;
    }

    return NextResponse.json({
      ok: true,
      pendencias_ativas: ativas.length,
      alertas_novos: novas,
      alertas_resolvidos: resolvidas,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/painel/cron/pendencia-nansen]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
