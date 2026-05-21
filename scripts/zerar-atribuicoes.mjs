/**
 * Zera users_id_vistoriadorafield em massa.
 *
 * Virada de chave: a partir da execução deste script, técnico só vê
 * vistorias que forem (re)atribuídas via /painel/vistorias.
 *
 * Uso:
 *   node scripts/zerar-atribuicoes.mjs           # dry-run (só conta)
 *   node scripts/zerar-atribuicoes.mjs --apply   # executa UPDATE + audit
 */

import pkg from "@next/env";
import mysql from "mysql2/promise";

const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");

const TABLE_FIELDS = "glpi_plugin_fields_networkequipmentdispositivosderedes";
const TABLE_AUDIT = "glpi_plugin_vistomap_audit";

const conn = await mysql.createConnection({
  host: process.env.GLPI_DB_HOST ?? "127.0.0.1",
  port: Number(process.env.GLPI_DB_PORT ?? 3306),
  user: process.env.GLPI_DB_USER ?? "glpi",
  password: process.env.GLPI_DB_PASSWORD ?? "",
  database: process.env.GLPI_DB_NAME ?? "glpi",
  multipleStatements: false,
});

try {
  const [countRows] = await conn.execute(
    `SELECT COUNT(*) AS total FROM \`${TABLE_FIELDS}\` WHERE users_id_vistoriadorafield > 0`
  );
  const total = Number(countRows[0]?.total ?? 0);
  console.log(`Atribuições atuais: ${total}`);

  const [byTec] = await conn.execute(
    `SELECT users_id_vistoriadorafield AS uid, COUNT(*) AS n
       FROM \`${TABLE_FIELDS}\`
      WHERE users_id_vistoriadorafield > 0
      GROUP BY users_id_vistoriadorafield
      ORDER BY n DESC`
  );
  console.log("Por técnico (uid → qtd):");
  for (const r of byTec) console.log(`  uid ${r.uid} → ${r.n}`);

  if (!APPLY) {
    console.log("\n[DRY-RUN] nada alterado. Rode com --apply para executar.");
    process.exit(0);
  }

  console.log("\n>>> APLICANDO UPDATE em massa...");
  const [result] = await conn.execute(
    `UPDATE \`${TABLE_FIELDS}\`
        SET users_id_vistoriadorafield = 0
      WHERE users_id_vistoriadorafield > 0`
  );
  const affected = result.affectedRows ?? 0;
  console.log(`UPDATE concluído. Linhas afetadas: ${affected}`);

  await conn.execute(
    `CREATE TABLE IF NOT EXISTS \`${TABLE_AUDIT}\` (
       id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       ator_id INT NOT NULL,
       ator_nome VARCHAR(255) NOT NULL,
       ator_role VARCHAR(16) NOT NULL,
       acao VARCHAR(64) NOT NULL,
       alvo_tipo VARCHAR(24) NULL,
       alvo_id VARCHAR(64) NULL,
       alvo_label VARCHAR(255) NULL,
       descricao TEXT NULL,
       diff_json JSON NULL,
       PRIMARY KEY (id),
       KEY idx_ts (ts),
       KEY idx_acao (acao)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await conn.execute(
    `INSERT INTO \`${TABLE_AUDIT}\`
       (ator_id, ator_nome, ator_role, acao, alvo_tipo, alvo_id, alvo_label, descricao, diff_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      0,
      "sistema (script)",
      "admin",
      "reset_atribuicoes",
      "sistema",
      "global",
      "Virada de chave",
      `Zerado users_id_vistoriadorafield em ${affected} registros. Distribuição prévia: ${JSON.stringify(byTec)}`,
      JSON.stringify(byTec.map((r) => ({ campo: `uid_${r.uid}`, antes: String(r.n), depois: "0" }))),
    ]
  );
  console.log("Audit registrada.");
} catch (err) {
  console.error("ERRO:", err);
  process.exit(1);
} finally {
  await conn.end();
}
