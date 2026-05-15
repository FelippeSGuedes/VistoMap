import knex, { type Knex } from "knex";
import { env } from "../config.js";

const config: Knex.Config = {
  client: "pg",
  connection: {
    host: env.PG_HOST,
    port: env.PG_PORT,
    user: env.PG_USER,
    password: env.PG_PASSWORD,
    database: env.PG_DATABASE,
    application_name: "vistomap-postes-api",
  },
  pool: {
    min: env.PG_POOL_MIN,
    max: env.PG_POOL_MAX,
    // Mantém conexões quentes para minimizar latência em consultas geoespaciais.
    idleTimeoutMillis: 30_000,
    acquireTimeoutMillis: 10_000,
  },
  asyncStackTraces: env.NODE_ENV !== "production",
};

// Singleton em módulo: hot-reload no dev usa global cache.
declare global {
  // eslint-disable-next-line no-var
  var __vmPostesDb: Knex | undefined;
}

export const db: Knex =
  globalThis.__vmPostesDb ?? (globalThis.__vmPostesDb = knex(config));

export async function healthcheck(): Promise<{
  ok: boolean;
  version: string;
  postgis: string;
}> {
  const [row] = await db.raw<{
    rows: Array<{ pg_version: string; postgis_version: string }>;
  }>(
    `SELECT version() AS pg_version, postgis_full_version() AS postgis_version`
  ).then((r: { rows: Array<{ pg_version: string; postgis_version: string }> }) => r.rows ?? [r]);
  return {
    ok: true,
    version: row?.pg_version ?? "?",
    postgis: row?.postgis_version ?? "?",
  };
}
