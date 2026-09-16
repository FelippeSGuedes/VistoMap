/**
 * Backfill dos indicadores booleanos (Tem_Rede_Secundaria/Primaria/
 * Transformador/Religador) — diferente de import-csv.ts, este script NÃO
 * cria nem atualiza poste nenhum: só faz UPDATE das 4 colunas novas em
 * postes que JÁ existem, casando por (município normalizado + PSPOSTE),
 * a mesma chave única da tabela.
 *
 * Arquivos de entrada vêm de fora do fluxo normal de import (não são
 * "atualização de cadastro" — são um enriquecimento pontual), por isso os
 * caminhos são passados na linha de comando em vez de escanear um diretório
 * fixo:
 *
 *   node dist/scripts/import-flags-csv.js arquivo1.csv arquivo2.csv ...
 *
 * Detecta a codificação de cada arquivo sozinho (BOM UTF-8, ou decodifica
 * estrito em UTF-8 e cai pra latin1 se falhar) — as 3 planilhas reais que
 * motivaram este script vieram em codificações diferentes entre si.
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
  id: "pspostefield",
  psposte: "pspostefield",
  pspostefield: "pspostefield",
  name: "municipiofield",
  municipio: "municipiofield",
  municipiofield: "municipiofield",
  tem_rede_secundaria: "tem_rede_secundaria",
  tem_rede_primaria: "tem_rede_primaria",
  tem_transformador: "tem_transformador",
  tem_religador: "tem_religador",
};

const FLAG_COLS = [
  "tem_rede_secundaria",
  "tem_rede_primaria",
  "tem_transformador",
  "tem_religador",
] as const;

const TARGET_COLS = ["pspostefield", "municipiofield", ...FLAG_COLS] as const;

/* ─── utilitários ───────────────────────────────────────────────────────── */

function normalizeHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** "Sim"/"Não" (com ou sem acento/caixa) → "1"/"0"/"" (desconhecido). */
function normalizeBool(v: string | undefined): string {
  if (!v) return "";
  const s = v
    .trim()
    .toUpperCase()
    .normalize("NFD")
    // remove diacríticos combinantes (NFD separa "Ã" em "A" + combining tilde U+0303)
    .replace(/[̀-ͯ]/g, "");
  if (s === "SIM") return "1";
  if (s === "NAO") return "0";
  return "";
}

function csvEscape(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function sniffDelimiter(buf: Buffer): "," | ";" {
  const sample = buf.subarray(0, 4096).toString("latin1");
  const commas = (sample.match(/,/g) ?? []).length;
  const semis = (sample.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

/** BOM UTF-8 → utf8; senão tenta decodificar estrito em UTF-8; se falhar, latin1. */
function decodeFile(filePath: string): { text: string; encoding: string } {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString("utf8"), encoding: "utf-8 (BOM)" };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { text, encoding: "utf-8" };
  } catch {
    return { text: buf.toString("latin1"), encoding: "latin1" };
  }
}

/* ─── importação de 1 arquivo ───────────────────────────────────────────── */

interface FileResult {
  rowsRead: number;
  rowsSkipped: number;
  rowsAtualizados: number;
  rowsSemCorrespondencia: number;
}

async function importFile(
  client: pg.PoolClient,
  filePath: string
): Promise<FileResult> {
  const base = path.basename(filePath);
  const { text, encoding } = decodeFile(filePath);
  const delimiter = sniffDelimiter(Buffer.from(text, "utf8"));
  console.log(`  [${base}] codificação: ${encoding} · delimitador: ${delimiter === "," ? "vírgula" : "ponto-e-vírgula"}`);

  await client.query(`
    CREATE TEMP TABLE IF NOT EXISTS staging_postes_flags (
      pspostefield        text,
      municipiofield       text,
      tem_rede_secundaria  text,
      tem_rede_primaria    text,
      tem_transformador    text,
      tem_religador        text
    ) ON COMMIT DROP
  `);
  await client.query(`TRUNCATE staging_postes_flags`);

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

      if (!aliasMap) {
        aliasMap = {};
        for (const key of Object.keys(record)) {
          const target = COLUMN_ALIASES[key];
          if (target) aliasMap[key] = target;
        }
        if (!Object.values(aliasMap).includes("pspostefield")) {
          return cb(new Error(`coluna PSPOSTE/ID não encontrada nos headers de ${base}`));
        }
        if (!Object.values(aliasMap).includes("municipiofield")) {
          return cb(new Error(`coluna município/NAME não encontrada nos headers de ${base}`));
        }
      }

      const out: Partial<Record<string, string>> = {};
      for (const [k, v] of Object.entries(record)) {
        if (v == null) continue;
        const target = aliasMap![k];
        if (!target) continue;
        out[target] = FLAG_COLS.includes(target as (typeof FLAG_COLS)[number])
          ? normalizeBool(v)
          : String(v).trim();
      }

      if (!out.pspostefield || !out.municipiofield) {
        rowsSkipped++;
        return cb();
      }

      const line =
        TARGET_COLS.map((col) => csvEscape(out[col] ?? "")).join(",") + "\n";
      cb(null, line);
    },
  });

  const copySql = `COPY staging_postes_flags (${TARGET_COLS.join(", ")}) FROM STDIN WITH (FORMAT csv)`;
  const copyStream = client.query(copyFrom(copySql)) as unknown as NodeJS.WritableStream;

  const { Readable } = await import("node:stream");
  await pipeline(Readable.from([text]), parser, toCsv, copyStream);

  // UPDATE só das 4 colunas novas — nunca toca lat/long/material/altura.
  // Casa pela MESMA chave única de `postes` (município normalizado + PSPOSTE).
  const updateSql = `
    UPDATE postes p
       SET tem_rede_secundaria = CASE s.tem_rede_secundaria WHEN '1' THEN true WHEN '0' THEN false ELSE p.tem_rede_secundaria END,
           tem_rede_primaria   = CASE s.tem_rede_primaria   WHEN '1' THEN true WHEN '0' THEN false ELSE p.tem_rede_primaria   END,
           tem_transformador   = CASE s.tem_transformador   WHEN '1' THEN true WHEN '0' THEN false ELSE p.tem_transformador   END,
           tem_religador       = CASE s.tem_religador       WHEN '1' THEN true WHEN '0' THEN false ELSE p.tem_religador       END,
           updated_at = now()
      FROM staging_postes_flags s
     WHERE p.municipiofield_norm = upper(f_unaccent_immutable(s.municipiofield))
       AND p.pspostefield = s.pspostefield
    RETURNING p.id
  `;
  const { rowCount: rowsAtualizados } = await client.query(updateSql);

  const { rows: semCorrespondenciaRows } = await client.query<{ total: string }>(`
    SELECT COUNT(*)::bigint AS total
      FROM staging_postes_flags s
     WHERE NOT EXISTS (
       SELECT 1 FROM postes p
        WHERE p.municipiofield_norm = upper(f_unaccent_immutable(s.municipiofield))
          AND p.pspostefield = s.pspostefield
     )
  `);

  return {
    rowsRead,
    rowsSkipped,
    rowsAtualizados: rowsAtualizados ?? 0,
    rowsSemCorrespondencia: Number(semCorrespondenciaRows[0]?.total ?? 0),
  };
}

/* ─── orquestrador ──────────────────────────────────────────────────────── */

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Uso: node dist/scripts/import-flags-csv.js arquivo1.csv [arquivo2.csv ...]");
    process.exit(1);
  }

  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`[import-flags-csv] arquivo não encontrado: ${f}`);
      process.exit(1);
    }
  }

  console.log(`[import-flags-csv] ${files.length} arquivo(s)\n`);

  const pool = new pg.Pool({
    host: env.PG_HOST,
    port: env.PG_PORT,
    user: env.PG_USER,
    password: env.PG_PASSWORD,
    database: env.PG_DATABASE,
    max: 4,
    application_name: "vistomap-postes-import-flags",
  });

  const t0 = Date.now();
  const summary: Array<{ file: string; result: FileResult; elapsedMs: number }> = [];

  const client = await pool.connect();
  try {
    for (const filePath of files) {
      const base = path.basename(filePath);
      console.log(`[import-flags-csv] >> ${base}`);
      const tFile = Date.now();
      await client.query("BEGIN");
      try {
        const result = await importFile(client, filePath);
        await client.query("COMMIT");
        const elapsedMs = Date.now() - tFile;
        console.log(
          `  ✓ lidos=${result.rowsRead} pulados=${result.rowsSkipped} ` +
            `atualizados=${result.rowsAtualizados} sem_correspondencia=${result.rowsSemCorrespondencia} ` +
            `(${(elapsedMs / 1000).toFixed(1)}s)\n`
        );
        summary.push({ file: base, result, elapsedMs });
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  ✗ falhou:`, err instanceof Error ? err.message : err);
      }
    }
  } finally {
    client.release();
  }

  const { rows: totals } = await pool.query<{
    total: string;
    com_flags: string;
  }>(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE tem_rede_secundaria IS NOT NULL)::bigint AS com_flags
    FROM postes
  `);

  await pool.end();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=================== RELATÓRIO ===================`);
  for (const s of summary) {
    console.log(
      `  ${s.file.padEnd(40)} ` +
        `atualizados=${String(s.result.rowsAtualizados).padStart(8)}  ` +
        `sem_correspondencia=${String(s.result.rowsSemCorrespondencia).padStart(6)}  ` +
        `(${(s.elapsedMs / 1000).toFixed(1)}s)`
    );
  }
  console.log(`  -----------------------------------------------`);
  console.log(`  total em postes:        ${totals[0]?.total}`);
  console.log(`  com flags preenchidas:  ${totals[0]?.com_flags}`);
  console.log(`  tempo total:            ${elapsed}s`);
  console.log(`==================================================`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
