import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const idx = line.indexOf("=");
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
      ) {
        value = value.slice(1, -1);
      }
      return [key, value];
    })
);

const [search] = process.argv.slice(2);
const like = search ? `%${search}%` : "%CAM%";

const conn = await mysql.createConnection({
  host: env.GLPI_DB_HOST,
  port: Number(env.GLPI_DB_PORT ?? 3306),
  user: env.GLPI_DB_USER,
  password: env.GLPI_DB_PASSWORD,
  database: env.GLPI_DB_NAME,
  connectTimeout: 15000,
});

try {
  const [rows] = await conn.execute(
    "SELECT id, name, is_deleted FROM glpi_networkequipments WHERE name LIKE ? ORDER BY name LIMIT 50",
    [like]
  );
  console.log(`[${rows.length}] resultados para LIKE '${like}':`);
  for (const r of rows) {
    console.log(`  id=${r.id}  is_deleted=${r.is_deleted}  name='${r.name}'`);
  }
} finally {
  await conn.end();
}
