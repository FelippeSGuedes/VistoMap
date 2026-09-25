import "server-only";
import { execute, query } from "@/lib/db";

/**
 * Observações manuais de analista sobre um técnico, por dia — usado pela
 * Análise Operacional dos Técnicos (/painel). Tabela própria do VistoMap
 * (não é GLPI Fields), mesmo padrão defensivo de devolucoes.ts.
 */

const TABLE = "glpi_plugin_vistomap_tecnico_observacoes";

let ensured = false;

export async function ensureTecnicoObservacoesTable(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
      id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tecnico_id INT             NOT NULL,
      autor_id   INT             NOT NULL,
      autor_nome VARCHAR(255)    NOT NULL,
      texto      TEXT            NOT NULL,
      criado_em  timestamp       NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_tecnico (tecnico_id),
      KEY idx_criado  (criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

export interface TecnicoObservacao {
  id: number;
  tecnicoId: number;
  autorId: number;
  autorNome: string;
  texto: string;
  criadoEm: string;
}

interface TecnicoObservacaoRow {
  id: number;
  tecnico_id: number;
  autor_id: number;
  autor_nome: string;
  texto: string;
  criado_em: string;
}

function mapRow(r: TecnicoObservacaoRow): TecnicoObservacao {
  return {
    id: r.id,
    tecnicoId: r.tecnico_id,
    autorId: r.autor_id,
    autorNome: r.autor_nome,
    texto: r.texto,
    criadoEm: r.criado_em,
  };
}

/** Observações de um técnico, mais recentes primeiro. */
export async function fetchTecnicoObservacoes(tecnicoId: number): Promise<TecnicoObservacao[]> {
  await ensureTecnicoObservacoesTable();
  const rows = await query<TecnicoObservacaoRow>(
    `SELECT * FROM \`${TABLE}\` WHERE tecnico_id = ? ORDER BY criado_em DESC LIMIT 200`,
    [tecnicoId]
  );
  return rows.map(mapRow);
}

export async function criarTecnicoObservacao(input: {
  tecnicoId: number;
  autorId: number;
  autorNome: string;
  texto: string;
}): Promise<TecnicoObservacao> {
  await ensureTecnicoObservacoesTable();
  const texto = input.texto.trim();
  const { insertId } = await execute(
    `INSERT INTO \`${TABLE}\` (tecnico_id, autor_id, autor_nome, texto) VALUES (?, ?, ?, ?)`,
    [input.tecnicoId, input.autorId, input.autorNome, texto]
  );
  return {
    id: insertId,
    tecnicoId: input.tecnicoId,
    autorId: input.autorId,
    autorNome: input.autorNome,
    texto,
    criadoEm: new Date().toISOString(),
  };
}

export async function excluirTecnicoObservacao(id: number): Promise<void> {
  await ensureTecnicoObservacoesTable();
  await execute(`DELETE FROM \`${TABLE}\` WHERE id = ?`, [id]);
}
