import "server-only";
import { execute, query } from "./db";

let ensured = false;

/**
 * Agendamento de vistoria pra data futura (analista, painel) — separado da
 * atribuição em si (users_id_vistoriadorafield continua sendo a fonte da
 * verdade de "de quem é a vistoria"). Esta tabela só guarda a DATA marcada,
 * a ordem de visita sugerida pelo roteirizador e o horário previsto — usada
 * por listVistorias() (equipments.ts) pra esconder a vistoria da fila do
 * técnico até a data chegar, e pela tela /painel/agendamentos pra gestão.
 *
 * status='CANCELADA' só remove o agendamento (a vistoria some da grade e
 * volta a aparecer na fila normalmente) — nunca desatribui o técnico.
 */
export async function ensureAgendamentosTable(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`glpi_plugin_vistomap_agendamentos\` (
      \`id\`                          int(11)      NOT NULL AUTO_INCREMENT,
      \`items_id\`                    int(11)      NOT NULL,
      \`equipamento\`                 varchar(255) NOT NULL DEFAULT '',
      \`tecnico_id\`                  int(11)      NOT NULL,
      \`data_agendada\`               date         NOT NULL,
      \`ordem_visita\`                int(11)      NOT NULL DEFAULT 0,
      \`horario_previsto_chegada\`    datetime     DEFAULT NULL,
      \`horario_previsto_saida\`      datetime     DEFAULT NULL,
      \`distancia_desde_anterior_m\`  int(11)      DEFAULT NULL,
      \`risco_chuva_pct\`             int(11)      DEFAULT NULL,
      \`risco_chuva_alerta\`          tinyint(1)   NOT NULL DEFAULT 0,
      \`status\`                      enum('AGENDADA','CANCELADA') NOT NULL DEFAULT 'AGENDADA',
      \`criado_por\`                  int(11)      NOT NULL DEFAULT 0,
      \`criado_em\`                   timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_tecnico_data\` (\`tecnico_id\`, \`data_agendada\`),
      KEY \`idx_items_status\` (\`items_id\`, \`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Migração defensiva: distingue agendamento criado pelo analista (painel,
  // com ordem/horário do roteirizador) do autoagendamento do técnico
  // (devoluções — ver agendamentosTecnico.ts). Sem isso, uma linha do
  // técnico (ordem_visita=0, sem horário) aparecia misturada na tela
  // /painel/agendamentos como se fosse a primeira parada de uma rota real.
  const cols = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM information_schema.columns
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'glpi_plugin_vistomap_agendamentos'`
  );
  if (!cols.some((c) => c.COLUMN_NAME === "origem")) {
    await execute(
      `ALTER TABLE \`glpi_plugin_vistomap_agendamentos\`
         ADD COLUMN \`origem\` ENUM('PAINEL','TECNICO') NOT NULL DEFAULT 'PAINEL' AFTER \`criado_por\``
    );
  }

  ensured = true;
}
