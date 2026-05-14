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

const [name, lat, lng] = process.argv.slice(2);
if (!name || !lat || !lng) {
  console.error("Uso: node scripts/set-test-coords.mjs <name> <lat> <lng>");
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: env.GLPI_DB_HOST,
  port: Number(env.GLPI_DB_PORT ?? 3306),
  user: env.GLPI_DB_USER,
  password: env.GLPI_DB_PASSWORD,
  database: env.GLPI_DB_NAME,
  connectTimeout: 15000,
});

try {
  const [neRows] = await conn.execute(
    "SELECT id FROM glpi_networkequipments WHERE name = ? AND is_deleted = 0 LIMIT 1",
    [name]
  );
  if (neRows.length === 0) {
    console.error(`[!] Equipamento '${name}' não encontrado em glpi_networkequipments.`);
    process.exit(2);
  }
  const equipId = neRows[0].id;

  const [fieldRows] = await conn.execute(
    "SELECT id FROM glpi_plugin_fields_networkequipmentdispositivosderedes WHERE items_id = ? LIMIT 1",
    [equipId]
  );

  if (fieldRows.length > 0) {
    const [upd] = await conn.execute(
      "UPDATE glpi_plugin_fields_networkequipmentdispositivosderedes SET latitudefield = ?, longitudefield = ? WHERE items_id = ?",
      [lat, lng, equipId]
    );
    console.log(
      `[OK] UPDATE em items_id=${equipId} (${name}): ${upd.affectedRows} linha(s).`
    );
  } else {
    const [ins] = await conn.execute(
      "INSERT INTO glpi_plugin_fields_networkequipmentdispositivosderedes (items_id, latitudefield, longitudefield) VALUES (?, ?, ?)",
      [equipId, lat, lng]
    );
    console.log(
      `[OK] INSERT items_id=${equipId} (${name}) → id=${ins.insertId}.`
    );
  }

  const [verify] = await conn.execute(
    "SELECT latitudefield, longitudefield FROM glpi_plugin_fields_networkequipmentdispositivosderedes WHERE items_id = ?",
    [equipId]
  );
  console.log("[OK] Valores atuais:", verify[0]);
} finally {
  await conn.end();
}
