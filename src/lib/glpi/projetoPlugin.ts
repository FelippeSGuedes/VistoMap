import "server-only";

import { execute } from "@/lib/db";
import { auditInsert } from "@/lib/glpi/audit";
import type { SessionRole } from "@/types";
import {
  ITEMTYPE_NE,
  PENDENCIA_CPFL,
  TABLE_FIELDS,
  TABLE_PROJETOS_PLUGIN,
} from "@/lib/glpi/constants";

/**
 * Reabre, no plugin "VistoMap - Projetos" do GLPI, o projeto de uma vistoria
 * que o técnico acabou de REVISITAR.
 *
 * O PROBLEMA (JUN-G-A-292, 2026-10-05): a concessionária reprova -> o
 * plugin grava status "rejected" (+ motivo) e a pendência vira "Nansen". O
 * técnico refaz a vistoria, o PDF é regerado (GERADO, AGUARDANDO) e o
 * projeto continuava "Reprovado" no GLPI, com o motivo antigo, até alguém
 * clicar em "Reabrir Validação". Esse botão é manual (ajax/action.php ->
 * PluginVistomapprojetosProject::reopen) e só funciona com a pendência em
 * "Pendência CPFL" — no 292 estava em Nansen, então nem ele abria.
 *
 * O QUE FAZ: o mesmo que o reopen() do plugin — status "in_review", limpa
 * motivo e data de aprovação — e garante a pendência em CPFL, que é onde a
 * bola fica depois que a Nansen termina a revisita.
 *
 * SÓ MEXE EM "rejected". Um projeto "approved" não é desfeito aqui: a
 * revisita de algo já aprovado é outra situação, e desfazer uma aprovação
 * por conta própria seria ir além do que foi pedido.
 *
 * É melhor esforço: quem chama não deve falhar a finalização do técnico por
 * causa disto (a fila offline do app depende do 200).
 *
 * Devolve true se reabriu de fato.
 */
export async function reabrirValidacaoAposRevisita(input: {
  vistoriaId: number;
  equipamento: string;
  ator: { id: number | string; nome: string; role: SessionRole } | null;
}): Promise<boolean> {
  const { vistoriaId, equipamento, ator } = input;

  const r = await execute(
    `UPDATE \`${TABLE_PROJETOS_PLUGIN}\`
        SET status = 'in_review',
            rejection_reason = NULL,
            date_approval = NULL,
            date_mod = NOW()
      WHERE items_id = ? AND itemtype = '${ITEMTYPE_NE}' AND status = 'rejected'`,
    [vistoriaId]
  );
  // Nada reprovado (já em análise, aprovado, ou sem registro no plugin):
  // não há o que reabrir, e não mexemos na pendência à toa.
  if (r.affectedRows === 0) return false;

  // Idempotente de propósito: o finalizar já grava CPFL, mas já houve caso
  // (JUN-G-A-292) em que a pendência voltou a Nansen depois, e o plugin
  // recusa reabrir manualmente fora de "Pendência CPFL".
  await execute(
    `UPDATE \`${TABLE_FIELDS}\`
        SET plugin_fields_pendnciafielddropdowns_id = ?
      WHERE items_id = ? AND itemtype = '${ITEMTYPE_NE}'`,
    [PENDENCIA_CPFL, vistoriaId]
  );

  // Rastro no histórico do próprio plugin, pra quem abre a aba no GLPI ver
  // que foi reaberto e por quê. Separado: falhar aqui não desfaz a reabertura.
  try {
    await execute(
      `INSERT INTO glpi_plugin_vistomapprojetos_logs
         (users_id, action, itemtype, items_id, asset_name, ip_address, result, extra, date_creation)
       VALUES (?, 'reopen', '${ITEMTYPE_NE}', ?, ?, 'vistomap-app', 'success', ?, NOW())`,
      [
        Number(ator?.id) || 0,
        vistoriaId,
        equipamento,
        "automatico: revisita concluida pelo tecnico",
      ]
    );
  } catch {
    /* tabela de log do plugin indisponível — segue */
  }

  if (ator) {
    void auditInsert({
      ator,
      acao: "projeto-reaberto",
      alvo: { tipo: "vistoria", id: String(vistoriaId), label: equipamento },
      descricao: "Validação reaberta automaticamente: técnico concluiu a revisita",
    });
  }

  return true;
}
