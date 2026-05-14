import "server-only";
import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var __glpiPool: Pool | undefined;
}

const config: PoolOptions = {
  host: process.env.GLPI_DB_HOST ?? "127.0.0.1",
  port: Number(process.env.GLPI_DB_PORT ?? 3306),
  user: process.env.GLPI_DB_USER ?? "glpi",
  password: process.env.GLPI_DB_PASSWORD ?? "",
  database: process.env.GLPI_DB_NAME ?? "glpi",
  connectionLimit: Number(process.env.GLPI_DB_POOL_LIMIT ?? 8),
  waitForConnections: true,
  enableKeepAlive: true,
  decimalNumbers: true,
  dateStrings: true,
  timezone: "Z",
};

export function getPool(): Pool {
  if (!global.__glpiPool) {
    global.__glpiPool = mysql.createPool(config);
  }
  return global.__glpiPool;
}

export async function query<T = unknown>(
  sql: string,
  params: ReadonlyArray<unknown> = []
): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params as unknown[]);
  return rows as T[];
}

export async function execute(
  sql: string,
  params: ReadonlyArray<unknown> = []
): Promise<{ affectedRows: number; insertId: number }> {
  const [result] = await getPool().execute(sql, params as unknown[]);
  const r = result as { affectedRows: number; insertId: number };
  return { affectedRows: r.affectedRows ?? 0, insertId: r.insertId ?? 0 };
}
