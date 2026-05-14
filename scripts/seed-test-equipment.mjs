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

const NAME = process.argv[2] ?? "CAM-S-A-013";
const LAT = process.argv[3] ?? "-19.95502865491202";
const LNG = process.argv[4] ?? "-44.1474393893272";

const conn = await mysql.createConnection({
  host: env.GLPI_DB_HOST,
  port: Number(env.GLPI_DB_PORT ?? 3306),
  user: env.GLPI_DB_USER,
  password: env.GLPI_DB_PASSWORD,
  database: env.GLPI_DB_NAME,
  connectTimeout: 15000,
});

async function findOrCreateLocation() {
  const [rows] = await conn.execute(
    "SELECT id FROM glpi_locations WHERE name = 'Sete Lagoas' LIMIT 1"
  );
  if (rows.length) return rows[0].id;
  const [ins] = await conn.execute(
    "INSERT INTO glpi_locations (name, completename, entities_id, is_recursive, level, state, town) VALUES ('Sete Lagoas', 'Sete Lagoas', 0, 1, 1, 'MG', 'Sete Lagoas')"
  );
  return ins.insertId;
}

try {
  const [neRows] = await conn.execute(
    "SELECT id FROM glpi_networkequipments WHERE name = ? LIMIT 1",
    [NAME]
  );

  let equipId;
  if (neRows.length) {
    equipId = neRows[0].id;
    await conn.execute(
      "UPDATE glpi_networkequipments SET is_deleted = 0 WHERE id = ?",
      [equipId]
    );
    console.log(`[OK] Equipamento '${NAME}' já existe (id=${equipId}).`);
  } else {
    const locationId = await findOrCreateLocation();
    const [ins] = await conn.execute(
      `INSERT INTO glpi_networkequipments
         (name, entities_id, is_recursive, locations_id, is_deleted, date_creation, date_mod)
       VALUES (?, 0, 1, ?, 0, NOW(), NOW())`,
      [NAME, locationId]
    );
    equipId = ins.insertId;
    console.log(`[OK] Equipamento '${NAME}' criado (id=${equipId}, locations_id=${locationId}).`);
  }

  const [fieldRows] = await conn.execute(
    "SELECT id FROM glpi_plugin_fields_networkequipmentdispositivosderedes WHERE items_id = ? LIMIT 1",
    [equipId]
  );

  if (fieldRows.length) {
    const [upd] = await conn.execute(
      "UPDATE glpi_plugin_fields_networkequipmentdispositivosderedes SET latitudefield = ?, longitudefield = ? WHERE items_id = ?",
      [LAT, LNG, equipId]
    );
    console.log(`[OK] Fields atualizados (${upd.affectedRows} linha).`);
  } else {
    const [ins] = await conn.execute(
      "INSERT INTO glpi_plugin_fields_networkequipmentdispositivosderedes (items_id, latitudefield, longitudefield) VALUES (?, ?, ?)",
      [equipId, LAT, LNG]
    );
    console.log(`[OK] Fields criados (id=${ins.insertId}).`);
  }

  const [check] = await conn.execute(
    `SELECT ne.id, ne.name, l.name AS cidade, f.latitudefield, f.longitudefield
       FROM glpi_networkequipments ne
       LEFT JOIN glpi_plugin_fields_networkequipmentdispositivosderedes f ON f.items_id = ne.id
       LEFT JOIN glpi_locations l ON l.id = ne.locations_id
      WHERE ne.id = ?`,
    [equipId]
  );
  console.log("[OK] Verificação:", check[0]);
} catch (err) {
  console.error("[ERR]", err.message);
  process.exit(1);
} finally {
  await conn.end();
}
