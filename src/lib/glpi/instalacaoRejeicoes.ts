import "server-only";
import { execute, query } from "@/lib/db";

/**
 * Rejeições de instalação — tabela PRÓPRIA, separada de
 * `glpi_plugin_vistomap_recusas` (recusas de vistoria). Motivo: a fila de
 * pendências dessa tabela (glpi_plugin_vistomap_recusas com status
 * PENDENTE) já alimenta /api/painel/notificacoes (aprovação de recusa de
 * vistoria) — misturar rejeições de instalação lá dentro contaminaria essa
 * fila com motivos/rótulos que não são os da vistoria. Aqui, toda rejeição
 * cai numa aba própria do painel ("Instalações › Rejeitadas") e o analista
 * decide se escala pra vistoria ou devolve pra instalação — decisão
 * exclusiva desse módulo, sem tocar no fluxo de aprovação de recusas da
 * vistoria.
 */
const TABLE = "glpi_plugin_vistomap_instalacao_rejeicoes";

export type InstalacaoRejeicaoStatus = "PENDENTE" | "ESCALADO" | "DESCARTADO";

let ensured = false;

export async function ensureInstalacaoRejeicoesTable(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
      id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      items_id        INT UNSIGNED    NOT NULL,
      equipamento     VARCHAR(255)    NOT NULL,
      instalador_id   INT UNSIGNED    NOT NULL,
      instalador_nome VARCHAR(255)    NOT NULL,
      motivo          VARCHAR(128)    NOT NULL,
      justificativa   TEXT            NOT NULL,
      foto1_path      VARCHAR(255)    NULL,
      foto2_path      VARCHAR(255)    NULL,
      foto3_path      VARCHAR(255)    NULL,
      status          ENUM('PENDENTE','ESCALADO','DESCARTADO') NOT NULL DEFAULT 'PENDENTE',
      decidido_por_id   INT UNSIGNED  NULL,
      decidido_por_nome VARCHAR(255)  NULL,
      criado_em       timestamp       NOT NULL DEFAULT CURRENT_TIMESTAMP,
      decidido_em     timestamp       NULL DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_items  (items_id),
      KEY idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

export interface CriarInstalacaoRejeicaoInput {
  itemsId: number;
  equipamento: string;
  instaladorId: number;
  instaladorNome: string;
  motivo: string;
  justificativa: string;
  foto1Path?: string | null;
  foto2Path?: string | null;
  foto3Path?: string | null;
}

export async function criarInstalacaoRejeicao(input: CriarInstalacaoRejeicaoInput): Promise<number> {
  await ensureInstalacaoRejeicoesTable();
  const { insertId } = await execute(
    `INSERT INTO \`${TABLE}\`
       (items_id, equipamento, instalador_id, instalador_nome, motivo, justificativa, foto1_path, foto2_path, foto3_path, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE')`,
    [
      input.itemsId,
      input.equipamento,
      input.instaladorId,
      input.instaladorNome,
      input.motivo,
      input.justificativa,
      input.foto1Path ?? null,
      input.foto2Path ?? null,
      input.foto3Path ?? null,
    ]
  );
  return insertId;
}

export interface InstalacaoRejeicaoRow {
  id: number;
  items_id: number;
  equipamento: string;
  instalador_id: number;
  instalador_nome: string;
  motivo: string;
  justificativa: string;
  foto1_path: string | null;
  foto2_path: string | null;
  foto3_path: string | null;
  status: InstalacaoRejeicaoStatus;
  decidido_por_id: number | null;
  decidido_por_nome: string | null;
  criado_em: string;
  decidido_em: string | null;
}

export async function listInstalacaoRejeicoes(
  status: InstalacaoRejeicaoStatus = "PENDENTE",
  limit = 200
): Promise<InstalacaoRejeicaoRow[]> {
  await ensureInstalacaoRejeicoesTable();
  return query<InstalacaoRejeicaoRow>(
    `SELECT * FROM \`${TABLE}\` WHERE status = ? ORDER BY criado_em DESC LIMIT ${Math.min(Math.max(limit, 1), 500)}`,
    [status]
  );
}

export async function fetchInstalacaoRejeicaoPendentePorItem(itemsId: number): Promise<InstalacaoRejeicaoRow | null> {
  await ensureInstalacaoRejeicoesTable();
  const rows = await query<InstalacaoRejeicaoRow>(
    `SELECT * FROM \`${TABLE}\` WHERE items_id = ? AND status = 'PENDENTE' ORDER BY criado_em DESC LIMIT 1`,
    [itemsId]
  );
  return rows[0] ?? null;
}

export async function fetchInstalacaoRejeicaoPorId(id: number): Promise<InstalacaoRejeicaoRow | null> {
  await ensureInstalacaoRejeicoesTable();
  const rows = await query<InstalacaoRejeicaoRow>(`SELECT * FROM \`${TABLE}\` WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function decidirInstalacaoRejeicao(
  id: number,
  status: "ESCALADO" | "DESCARTADO",
  decididoPor: { id: number; nome: string }
): Promise<void> {
  await ensureInstalacaoRejeicoesTable();
  await execute(
    `UPDATE \`${TABLE}\`
        SET status = ?, decidido_por_id = ?, decidido_por_nome = ?, decidido_em = NOW()
      WHERE id = ?`,
    [status, decididoPor.id, decididoPor.nome, id]
  );
}
