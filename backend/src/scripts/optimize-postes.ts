/**
 * Otimiza a tabela `postes` para padrão mostly-read + cargas raras de upsert.
 *
 *  1. ALTER TABLE: ajusta autovacuum por-tabela (não compete com outras).
 *  2. CLUSTER postes USING postes_geom_gist
 *     - Reordena fisicamente as linhas seguindo o índice GIST.
 *     - Postes geograficamente próximos ficam em páginas adjacentes no disco.
 *     - Radius queries leem menos páginas → 2-5x mais rápido.
 *     - LOCK exclusivo durante execução (~1-3min p/ 1.5M rows). Use após import.
 *  3. VACUUM (ANALYZE, VERBOSE) postes
 *     - Recupera dead tuples + reescreve stats do planner.
 *
 * Uso:
 *   docker exec -it vistomap-postes-api npm run optimize:postes
 */
import pg from "pg";
import { env } from "../config.js";

async function main() {
  const pool = new pg.Pool({
    host: env.PG_HOST,
    port: env.PG_PORT,
    user: env.PG_USER,
    password: env.PG_PASSWORD,
    database: env.PG_DATABASE,
    max: 1,
    application_name: "vistomap-postes-optimize",
  });

  const t0 = Date.now();

  try {
    console.log("[optimize] 1/4 ajustando autovacuum por-tabela...");
    // postes é mostly-read: deixamos autovacuum mais agressivo p/ stats
    // mas com scale_factor moderado pra não competir com queries.
    await pool.query(`
      ALTER TABLE postes SET (
        autovacuum_vacuum_scale_factor = 0.05,
        autovacuum_analyze_scale_factor = 0.02,
        autovacuum_vacuum_cost_delay = 10,
        fillfactor = 90
      )
    `);
    console.log("  ✓ aplicado");

    console.log("[optimize] 2/4 CLUSTER postes USING postes_geom_gist (LOCK exclusivo)...");
    const tCluster = Date.now();
    await pool.query(`CLUSTER postes USING postes_geom_gist`);
    console.log(
      `  ✓ reordenado fisicamente em ${((Date.now() - tCluster) / 1000).toFixed(1)}s`
    );

    console.log("[optimize] 3/4 VACUUM (ANALYZE, VERBOSE) postes...");
    // VACUUM ANALYZE precisa rodar fora de transação — pg.Pool.query já roda em conexão dedicada.
    await pool.query(`VACUUM (ANALYZE) postes`);
    console.log("  ✓ ok");

    console.log("[optimize] 4/4 coletando stats...");
    const { rows } = await pool.query<{
      total: string;
      tabela: string;
      indices: string;
      relpages: string;
    }>(`
      SELECT
        pg_size_pretty(pg_total_relation_size('postes'))   AS total,
        pg_size_pretty(pg_relation_size('postes'))         AS tabela,
        pg_size_pretty(pg_indexes_size('postes'))          AS indices,
        relpages::text                                     AS relpages
      FROM pg_class WHERE relname = 'postes'
    `);
    const r = rows[0];

    const { rows: counts } = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM postes`
    );

    console.log(`\n=================== RELATÓRIO ===================`);
    console.log(`  linhas:       ${counts[0]?.total}`);
    console.log(`  tamanho total:${r?.total}`);
    console.log(`    └ tabela:   ${r?.tabela}`);
    console.log(`    └ índices:  ${r?.indices}`);
    console.log(`  páginas:      ${r?.relpages}`);
    console.log(`  tempo total:  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`==================================================`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
