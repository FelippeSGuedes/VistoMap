import "server-only";
import { execute, query } from "@/lib/db";
import { ensureAgendamentosTable } from "@/lib/ensureAgendamentosTable";

/**
 * Autoagendamento do técnico pra devoluções (distinto do agendamento
 * criado pelo analista no painel — ver ensureAgendamentosTable.ts,
 * coluna `origem`). Reusa a MESMA tabela de agendamentos: uma vez que o
 * técnico escolhe um dia pra resolver, a vistoria some da fila normal
 * até essa data chegar (listVistorias() em equipments.ts já faz isso,
 * sem nenhuma mudança necessária ali).
 */

export interface AgendamentoAtivo {
  id: number;
  dataAgendada: string;
}

/**
 * Agendamento ainda válido (hoje ou futuro) pra um item — usado tanto
 * pro bypass do bloqueio de `iniciar` quanto pro endpoint de resumo
 * (pra não duplicar essa checagem nos 2 lugares).
 */
export async function fetchAgendamentoAtivo(
  itemsId: number,
  tecnicoId: number
): Promise<AgendamentoAtivo | null> {
  await ensureAgendamentosTable();
  const rows = await query<{ id: number; data_agendada: string }>(
    `SELECT id, data_agendada FROM glpi_plugin_vistomap_agendamentos
      WHERE items_id = ? AND tecnico_id = ? AND status = 'AGENDADA'
        AND data_agendada >= CURDATE()
      ORDER BY data_agendada ASC
      LIMIT 1`,
    [itemsId, tecnicoId]
  );
  return rows[0] ? { id: rows[0].id, dataAgendada: rows[0].data_agendada } : null;
}

export interface ItemParaAgendar {
  itemsId: number;
  equipamento: string;
}

/**
 * Agenda (ou reagenda) um lote de itens pro mesmo dia, pelo próprio
 * técnico. Cancela qualquer autoagendamento anterior do mesmo item antes
 * de inserir o novo — evita linha duplicada se o endpoint for chamado
 * mais de uma vez, e já deixa a porta aberta pra um futuro "mudar o dia".
 */
export async function agendarDevolucoesTecnico(
  tecnicoId: number,
  itens: ItemParaAgendar[],
  dia: string
): Promise<void> {
  await ensureAgendamentosTable();
  for (const item of itens) {
    await execute(
      `UPDATE glpi_plugin_vistomap_agendamentos
          SET status = 'CANCELADA'
        WHERE items_id = ? AND tecnico_id = ? AND status = 'AGENDADA' AND origem = 'TECNICO'`,
      [item.itemsId, tecnicoId]
    );
    await execute(
      `INSERT INTO glpi_plugin_vistomap_agendamentos
         (items_id, equipamento, tecnico_id, data_agendada, ordem_visita, criado_por, origem, status)
       VALUES (?, ?, ?, ?, 0, ?, 'TECNICO', 'AGENDADA')`,
      [item.itemsId, item.equipamento, tecnicoId, dia, tecnicoId]
    );
  }
}
