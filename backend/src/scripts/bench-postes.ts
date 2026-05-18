/**
 * Benchmark + sanity-check dos índices PostGIS.
 *
 * Roda 3 cenários reais:
 *   A) radius query  (ST_DWithin geog) — fluxo principal /postes/proximos
 *   B) bbox query    (geom &&)          — fluxo /postes/bbox (Mapbox moveend)
 *   C) prefix search (trgm ILIKE)       — autocomplete por PSPOSTE
 *
 * Para cada cenário:
 *   • mede tempo médio em 20 amostras
 *   • mostra EXPLAIN (ANALYZE, BUFFERS) da última amostra
 *
 * Verifique no plano se aparece:
 *   - "Index Scan using postes_geog_gist"   (radius)
 *   - "Index Scan using postes_geom_gist"   (bbox)
 *   - "Bitmap Index Scan on postes_psposte_trgm" (prefix)
 */
import pg from "pg";
import { env } from "../config.js";

interface Sample {
  lat: number;
  lng: number;
}

// pontos espalhados em diferentes regiões — pegue uns 5 reais aleatórios do banco
async function pickSamples(client: pg.PoolClient, n: number): Promise<Sample[]> {
  const { rows } = await client.query<{ lat: number; lng: number }>(
    `SELECT latitudefield::float AS lat, longitudefield::float AS lng
       FROM postes TABLESAMPLE SYSTEM (0.5)
       LIMIT $1`,
    [n]
  );
  return rows;
}

async function timeQuery<T>(
  fn: () => Promise<T>,
  iterations: number
): Promise<{ avgMs: number; minMs: number; maxMs: number }> {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    await fn();
    const dt = Number(process.hrtime.bigint() - t0) / 1_000_000;
    samples.push(dt);
  }
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    avgMs: sum / samples.length,
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
  };
}

async function main() {
  const pool = new pg.Pool({
    host: env.PG_HOST,
    port: env.PG_PORT,
    user: env.PG_USER,
    password: env.PG_PASSWORD,
    database: env.PG_DATABASE,
    max: 4,
    application_name: "vistomap-postes-bench",
  });
  const client = await pool.connect();

  try {
    const samples = await pickSamples(client, 20);
    if (samples.length === 0) {
      console.error("[bench] tabela vazia — rode import:csv primeiro");
      process.exit(1);
    }

    console.log(`[bench] ${samples.length} pontos de referência\n`);

    /* ────── A. radius (geography) ────── */
    const radiusSql = `
      SELECT id, pspostefield, municipiofield,
             ST_Distance(geom::geography, ST_MakePoint($1, $2)::geography) AS m
        FROM postes
       WHERE ST_DWithin(geom::geography, ST_MakePoint($1, $2)::geography, $3)
       ORDER BY m
       LIMIT 30
    `;
    const radiusBench = await timeQuery(async () => {
      const s = samples[Math.floor(Math.random() * samples.length)];
      if (!s) return;
      await client.query(radiusSql, [s.lng, s.lat, env.POSTE_TROCA_RAIO_M * 10]);
    }, 20);

    console.log(`A) radius ST_DWithin (${env.POSTE_TROCA_RAIO_M * 10}m):`);
    console.log(
      `   avg=${radiusBench.avgMs.toFixed(1)}ms  min=${radiusBench.minMs.toFixed(1)}ms  max=${radiusBench.maxMs.toFixed(1)}ms`
    );

    /* ────── B. bbox (geometry) ────── */
    const bboxSql = `
      SELECT id, pspostefield, municipiofield, ST_X(geom) AS lng, ST_Y(geom) AS lat
        FROM postes
       WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
       LIMIT 500
    `;
    const bboxBench = await timeQuery(async () => {
      const s = samples[Math.floor(Math.random() * samples.length)];
      if (!s) return;
      const d = 0.01; // ~1km
      await client.query(bboxSql, [s.lng - d, s.lat - d, s.lng + d, s.lat + d]);
    }, 20);

    console.log(`\nB) bbox ST_MakeEnvelope (~1km²):`);
    console.log(
      `   avg=${bboxBench.avgMs.toFixed(1)}ms  min=${bboxBench.minMs.toFixed(1)}ms  max=${bboxBench.maxMs.toFixed(1)}ms`
    );

    /* ────── C. trgm prefix ────── */
    const { rows: trgmSeed } = await client.query<{ pspostefield: string }>(
      `SELECT pspostefield FROM postes ORDER BY random() LIMIT 20`
    );
    const trgmSql = `
      SELECT id, pspostefield, municipiofield
        FROM postes
       WHERE pspostefield ILIKE $1
       LIMIT 30
    `;
    const trgmBench = await timeQuery(async () => {
      const seed = trgmSeed[Math.floor(Math.random() * trgmSeed.length)];
      const prefix = seed?.pspostefield.slice(0, 4);
      await client.query(trgmSql, [`%${prefix}%`]);
    }, 20);

    console.log(`\nC) trgm ILIKE '%PSP%':`);
    console.log(
      `   avg=${trgmBench.avgMs.toFixed(1)}ms  min=${trgmBench.minMs.toFixed(1)}ms  max=${trgmBench.maxMs.toFixed(1)}ms`
    );

    /* ────── EXPLAIN ANALYZE de cada um ────── */
    const exampleSample = samples[0]!;
    console.log(`\n=================== EXPLAIN ANALYZE ===================\n`);

    console.log(`-- A. radius`);
    const { rows: ea } = await client.query<{ "QUERY PLAN": string }>(
      `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${radiusSql}`,
      [exampleSample.lng, exampleSample.lat, env.POSTE_TROCA_RAIO_M * 10]
    );
    ea.forEach((r) => console.log(`  ${r["QUERY PLAN"]}`));

    console.log(`\n-- B. bbox`);
    const d = 0.01;
    const { rows: eb } = await client.query<{ "QUERY PLAN": string }>(
      `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${bboxSql}`,
      [
        exampleSample.lng - d,
        exampleSample.lat - d,
        exampleSample.lng + d,
        exampleSample.lat + d,
      ]
    );
    eb.forEach((r) => console.log(`  ${r["QUERY PLAN"]}`));

    const trgmSeed0 = trgmSeed[0]!;
    console.log(`\n-- C. trgm prefix '${trgmSeed0.pspostefield.slice(0, 4)}'`);
    const { rows: ec } = await client.query<{ "QUERY PLAN": string }>(
      `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${trgmSql}`,
      [`%${trgmSeed0.pspostefield.slice(0, 4)}%`]
    );
    ec.forEach((r) => console.log(`  ${r["QUERY PLAN"]}`));

    console.log(`\n======================================================`);
    console.log(
      `Expectativa de bons planos:\n` +
        `  A) Index Scan using postes_geog_gist (radius geography)\n` +
        `  B) Index Scan using postes_geom_gist (bbox geometry)\n` +
        `  C) Bitmap Index Scan on postes_psposte_trgm (gin_trgm)\n` +
        `Se aparecer "Seq Scan", o índice não está sendo usado — me chama.`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
