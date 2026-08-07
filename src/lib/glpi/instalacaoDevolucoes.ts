import "server-only";
import { execute } from "@/lib/db";

/**
 * Devoluções de instalação (Central das Instalações → Devolver) — tabela
 * PRÓPRIA, separada de `glpi_plugin_vistomap_devolucoes` (devoluções de
 * vistoria). Só histórico/auditoria por enquanto — sem dashboard próprio
 * ainda (fora de escopo desta rodada, mesmo padrão "fase enxuta" das
 * rodadas anteriores do módulo de Instalação).
 */
const TABLE = "glpi_plugin_vistomap_instalacao_devolucoes";

let ensured = false;

async function ensureTable(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
      id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      items_id             INT UNSIGNED    NOT NULL,
      equipamento          VARCHAR(255)    NOT NULL,
      instalador_id        INT UNSIGNED    NULL,
      instalador_nome      VARCHAR(255)    NULL,
      analista_id          INT UNSIGNED    NOT NULL,
      analista_nome        VARCHAR(255)    NOT NULL,
      itens_checklist_json TEXT            NULL,
      fotos_json           TEXT            NULL,
      motivo               TEXT            NOT NULL,
      status               ENUM('PENDENTE','CORRIGIDA') NOT NULL DEFAULT 'PENDENTE',
      criado_em            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_items (items_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

export interface CriarInstalacaoDevolucaoInput {
  itemsId: number;
  equipamento: string;
  instaladorId: number | null;
  instaladorNome: string | null;
  analistaId: number;
  analistaNome: string;
  itensChecklist: string[];
  fotos: number[];
  motivo: string;
}

export async function criarInstalacaoDevolucao(input: CriarInstalacaoDevolucaoInput): Promise<number> {
  await ensureTable();
  const { insertId } = await execute(
    `INSERT INTO \`${TABLE}\`
       (items_id, equipamento, instalador_id, instalador_nome, analista_id, analista_nome,
        itens_checklist_json, fotos_json, motivo, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE')`,
    [
      input.itemsId,
      input.equipamento,
      input.instaladorId,
      input.instaladorNome,
      input.analistaId,
      input.analistaNome,
      JSON.stringify(input.itensChecklist),
      JSON.stringify(input.fotos),
      input.motivo,
    ]
  );
  return insertId;
}
