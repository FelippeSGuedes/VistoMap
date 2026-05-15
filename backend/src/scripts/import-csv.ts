/**
 * Importador de CSVs do VistoMap.
 *
 * - Lê todos os `*.csv` em CSV_PATH (default /csv).
 * - Detecta delimitador (`,` ou `;`) lendo os primeiros 4KB.
 * - Mapeia headers tolerantemente (case-insensitive, sem acentos, snake_case).
 * - Para cada arquivo abre uma transação:
 *     1. CREATE TEMP TABLE staging_postes
 *     2. COPY FROM STDIN (streaming via pg-copy-streams)
 *     3. INSERT INTO postes ... ON CONFLICT DO UPDATE ... RETURNING (xmax=0) AS inserted
 *     4. COMMIT
 * - Falhas em 1 arquivo não invalidam os anteriores.
 * - Ao final: ANALYZE postes + relatório completo.
 *
 * Uso (dentro do container):
 *   node dist/scripts/import-csv.js
 * No dev:
 *   tsx src/scripts/import-csv.ts
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { parse } from "csv-parse";
import pg from "pg";
import copyStreams from "pg-copy-streams";
import { env } from "../config.js";

const { from: copyFrom } = copyStreams;

/* ─── mapeamento de colunas ─────────────────────────────────────────────── */

const COLUMN_ALIASES: Record<string, string> = {
  psposte: "pspostefield",
  pspostefield: "pspostefield",
  ps_poste: "pspostefield",
  poste: "pspostefield",
  material: "materialfield",
  materialfield: "materialfield",
  tipo_material: "materialfield",
  altura: "alturadaantenafield",
  alturadaantena: "alturadaantenafield",
  alturadaantenafield: "alturadaantenafield",
  altura_antena: "alturadaantenafield",
  municipio: "municipiofield",
  municipiofield: "municipiofield",
  cidade: "municipiofield",
  latitude: "latitudefield",
  lat: "latitudefield",
  latitudefield: "latitudefield",
  longitude: "longitudefield",
  long: "longitudefield",
  lng: "longitudefield",
  longitudefield: "longitudefield",
};

const TARGET_COLS = [
  "pspostefield",
  "materialfield",
  "alturadaantenafield",
  "municipiofield",
  "latitudefield",
  "longitudefield",
  "raw",
] as const;

/* ─── utilitários ───────────────────────────────────────────────────────── */

function normalizeHeader(s: string): string {
  // NFD separa acentos em diacríticos combinantes (U+0300–U+036F),
  // que caem fora de [a-z0-9] e somem no replace seguinte.
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function csvEscape(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function sniffDelimiter(filePath: string): "," | ";" {
  const buf = Buffer.alloc(4096);
  const fd = fs.openSync(filePath, "r");
  try {
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const sample = buf.subarray(0, n).toString("utf8");
    const commas = (sample.match(/,/g) ?? []).length;
    const semis = (sample.match(/;/g) ?? []).length;
    return semis > commas ? ";" : ",";
  } finally {
    fs.closeSync(fd);
  }
}

/* ─── importação de 1 arquivo ───────────────────────────────────────────── */

interface FileResult {
  rowsRead: number;
  rowsSkipped: number;
  rowsInserted: number;
  rowsUpdated: number;
}

async function importFile(
  client: pg.PoolClient,
  filePath: string
): Promise<FileResult> {
  const base = path.basename(filePath);
  const delimiter = sniffDelimiter(filePath);
  console.log(
    `  [${base}] delimitador detectado: ${delimiter === "," ? "vírgula" : "ponto-e-vírgula"}`
  );

  // staging temp table (sempre TEXT — validação acontece no INSERT final)
  await client.query(`
    CREATE TEMP TABLE IF NOT EXISTS staging_postes (
      pspostefield        text,
      materialfield       text,
      alturadaantenafield text,
      municipiofield      text,
      latitudefield       text,
      longitudefield      text,
      raw                 text
    ) ON COMMIT DROP
  `);
  await client.query(`TRUNCATE staging_postes`);

  let aliasMap: Record<string, string> | null = null;
  let rowsRead = 0;
  let rowsSkipped = 0;

  const parser = parse({
    delimiter,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    columns: (headers: string[]) => headers.map(normalizeHeader),
  });

  const toCsv = new Transform({
    writableObjectMode: true,
    readableObjectMode: false,
    transform(
      record: Record<string, string | undefined>,
      _enc,
      cb: (err?: Error | null, line?: string) => void
    ) {
      rowsRead++;

      // primeira linha: descobre quais headers normalizados batem em qual coluna-alvo
      if (!aliasMap) {
        aliasMap = {};
        for (const key of Object.keys(record)) {
          const target = COLUMN_ALIASES[key];
          if (target) aliasMap[key] = target;
        }
        if (!Object.values(aliasMap).includes("pspostefield")) {
          return cb(new Error(`coluna PSPOSTE não encontrada nos headers de ${base}`));
        }
        if (!Object.values(aliasMap).includes("latitudefield")) {
          return cb(new Error(`coluna latitude não encontrada nos headers de ${base}`));
        }
      }

      const out: Partial<Record<string, string | null>> = {};
      const extras: Record<string, string> = {};
      for (const [k, v] of Object.entries(record)) {
        if (v == null) continue;
        const target = aliasMap![k];
        const value = String(v).trim();
        if (target) {
          out[target] = value || null;
        } else if (value) {
          extras[k] = value;
        }
      }

      // pula linhas sem identificador ou coordenadas
      if (
        !out.pspostefield ||
        !out.municipiofield ||
        !out.latitudefield ||
        !out.longitudefield
      ) {
        rowsSkipped++;
        return cb();
      }

      const line =
        [
          out.pspostefield,
          out.materialfield ?? null,
          out.alturadaantenafield ?? null,
          out.municipiofield,
          out.latitudefield,
          out.longitudefield,
          Object.keys(extras).length ? JSON.stringify(extras) : null,
        ]
          .map(csvEscape)
          .join(",") + "\n";

      cb(null, line);
    },
  });

  const copySql = `COPY staging_postes (${TARGET_COLS.join(", ")}) FROM STDIN WITH (FORMAT csv)`;
  const copyStream = client.query(copyFrom(copySql)) as unknown as NodeJS.WritableStream;

  await pipeline(fs.createReadStream(filePath), parser, toCsv, copyStream);

  // UPSERT do staging para postes — só atualiza se mudou (economiza WAL).
  const upsertSql = `
    WITH ins AS (
      INSERT INTO postes (
        pspostefield, materialfield, alturadaantenafield,
        municipiofield, latitudefield, longitudefield, raw
      )
      SELECT
        pspostefield,
        NULLIF(materialfield, ''),
        NULLIF(alturadaantenafield, ''),
        municipiofield,
        REPLACE(latitudefield, ',', '.')::numeric,
        REPLACE(longitudefield, ',', '.')::numeric,
        COALESCE(NULLIF(raw, '')::jsonb, '{}'::jsonb)
      FROM staging_postes
      WHERE TRIM(latitudefield)  <> ''
        AND TRIM(longitudefield) <> ''
        AND TRIM(pspostefield)   <> ''
        AND TRIM(municipiofield) <> ''
      ON CONFLICT (municipiofield_norm, pspostefield) DO UPDATE
      SET
        materialfield       = EXCLUDED.materialfield,
        alturadaantenafield = EXCLUDED.alturadaantenafield,
        latitudefield       = EXCLUDED.latitudefield,
        longitudefield      = EXCLUDED.longitudefield,
        raw                 = postes.raw || EXCLUDED.raw,
        updated_at          = now()
      WHERE
            postes.latitudefield       IS DISTINCT FROM EXCLUDED.latitudefield
        OR  postes.longitudefield      IS DISTINCT FROM EXCLUDED.longitudefield
        OR  postes.materialfield       IS DISTINCT FROM EXCLUDED.materialfield
        OR  postes.alturadaantenafield IS DISTINCT FROM EXCLUDED.alturadaantenafield
      RETURNING (xmax = 0) AS inserted
    )
    SELECT
      COALESCE(SUM(CASE WHEN inserted     THEN 1 ELSE 0 END), 0)::bigint AS inseridos,
      COALESCE(SUM(CASE WHEN NOT inserted THEN 1 ELSE 0 END), 0)::bigint AS atualizados
    FROM ins
  `;

  const { rows } = await client.query<{ inseridos: string; atualizados: string }>(
    upsertSql
  );
  const r = rows[0];
  const rowsInserted = Number(r?.inseridos ?? 0);
  const rowsUpdated = Number(r?.atualizados ?? 0);

  return { rowsRead, rowsSkipped, rowsInserted, rowsUpdated };
}

/* ─── orquestrador ──────────────────────────────────────────────────────── */

async function main() {
  const csvDir = env.CSV_PATH;
  let files: string[];
  try {
    files = (await fs.promises.readdir(csvDir))
      .filter((f) => f.toLowerCase().endsWith(".csv"))
      .sort();
  } catch (err) {
    console.error(`[import-csv] não consegui ler ${csvDir}:`, err);
    process.exit(1);
  }

  if (files.length === 0) {
    console.warn(`[import-csv] nenhum .csv em ${csvDir}`);
    return;
  }

  console.log(`[import-csv] ${files.length} arquivo(s) em ${csvDir}\n`);

  const pool = new pg.Pool({
    host: env.PG_HOST,
    port: env.PG_PORT,
    user: env.PG_USER,
    password: env.PG_PASSWORD,
    database: env.PG_DATABASE,
    max: 4,
    application_name: "vistomap-postes-import",
  });

  const t0 = Date.now();
  const summary: Array<{ file: string; result: FileResult; elapsedMs: number }> = [];

  const client = await pool.connect();
  try {
    for (const f of files) {
      const filePath = path.join(csvDir, f);
      console.log(`[import-csv] >> ${f}`);
      const tFile = Date.now();
      await client.query("BEGIN");
      try {
        const result = await importFile(client, filePath);
        await client.query("COMMIT");
        const elapsedMs = Date.now() - tFile;
        console.log(
          `  ✓ lidos=${result.rowsRead} pulados=${result.rowsSkipped} ` +
            `inseridos=${result.rowsInserted} atualizados=${result.rowsUpdated} ` +
            `(${(elapsedMs / 1000).toFixed(1)}s)\n`
        );
        summary.push({ file: f, result, elapsedMs });
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  ✗ falhou:`, err instanceof Error ? err.message : err);
        // segue pro próximo
      }
    }
  } finally {
    client.release();
  }

  // stats frescas pro planner
  try {
    console.log(`[import-csv] rodando ANALYZE postes...`);
    await pool.query(`ANALYZE postes`);
  } catch (err) {
    console.warn(`[import-csv] ANALYZE falhou:`, err);
  }

  const { rows: totals } = await pool.query<{
    total: string;
    com_geom: string;
  }>(`
    SELECT
      COUNT(*)::bigint                          AS total,
      COUNT(*) FILTER (WHERE geom IS NOT NULL)::bigint AS com_geom
    FROM postes
  `);

  await pool.end();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=================== RELATÓRIO ===================`);
  for (const s of summary) {
    console.log(
      `  ${s.file.padEnd(40)} ` +
        `+${String(s.result.rowsInserted).padStart(7)}  ` +
        `~${String(s.result.rowsUpdated).padStart(7)}  ` +
        `−${String(s.result.rowsSkipped).padStart(6)}  ` +
        `(${(s.elapsedMs / 1000).toFixed(1)}s)`
    );
  }
  console.log(`  -----------------------------------------------`);
  console.log(`  total na tabela:  ${totals[0]?.total}`);
  console.log(`  com geometria:    ${totals[0]?.com_geom}`);
  console.log(`  tempo total:      ${elapsed}s`);
  console.log(`==================================================`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
