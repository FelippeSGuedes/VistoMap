import "server-only";
import { execute, query } from "@/lib/db";

/**
 * Código de 6 dígitos que conecta o passo do NAVEGADOR (formulário + termo,
 * antes do app existir no aparelho) ao passo DENTRO DO APP (onde o
 * aparelho de verdade é identificado, depois de instalado) — ver
 * /liberar-acesso. Curto (15min) e uso único.
 *
 * Persistido em tabela (não em memória, ao contrário de rate-limit.ts):
 * um restart do container durante a janela de 15min não pode invalidar um
 * código que a pessoa já está prestes a digitar.
 */

const TABLE_CODES = "glpi_plugin_vistomap_activation_codes";
const TTL_MINUTOS = 15;

let ensured = false;

export async function ensureActivationCodeTable(): Promise<void> {
  if (ensured) return;
  await execute(
    `
      CREATE TABLE IF NOT EXISTS \`${TABLE_CODES}\` (
        id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        codigo     VARCHAR(6)      NOT NULL,
        users_id   INT             NOT NULL,
        criado_em  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expira_em  TIMESTAMP       NOT NULL,
        usado_em   TIMESTAMP       NULL,
        PRIMARY KEY (id),
        KEY idx_codigo (codigo),
        KEY idx_users  (users_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
  ensured = true;
}

function gerarCodigoAleatorio(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Gera e grava um código novo pra este usuário — retries se colidir com um código ativo. */
export async function gerarCodigoAtivacao(usersId: number): Promise<{ codigo: string; expiraEm: Date }> {
  await ensureActivationCodeTable();
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigoAleatorio();
    const [colisao] = await query<{ id: number }>(
      `SELECT id FROM \`${TABLE_CODES}\`
        WHERE codigo = ? AND usado_em IS NULL AND expira_em > NOW()
        LIMIT 1`,
      [codigo]
    );
    if (colisao) continue;

    const expiraEm = new Date(Date.now() + TTL_MINUTOS * 60_000);
    await execute(
      `INSERT INTO \`${TABLE_CODES}\` (codigo, users_id, expira_em) VALUES (?, ?, ?)`,
      [codigo, usersId, expiraEm]
    );
    return { codigo, expiraEm };
  }
  throw new Error("Não foi possível gerar um código único — tente de novo.");
}

/** Consome o código (uso único) — null se inválido/expirado/já usado. */
export async function resgatarCodigoAtivacao(codigo: string): Promise<{ usersId: number } | null> {
  await ensureActivationCodeTable();
  const rows = await query<{ id: number; users_id: number }>(
    `SELECT id, users_id FROM \`${TABLE_CODES}\`
      WHERE codigo = ? AND usado_em IS NULL AND expira_em > NOW()
      ORDER BY id DESC LIMIT 1`,
    [codigo]
  );
  const row = rows[0];
  if (!row) return null;

  await execute(`UPDATE \`${TABLE_CODES}\` SET usado_em = NOW() WHERE id = ?`, [row.id]);
  return { usersId: row.users_id };
}
