import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Knex } from "knex";

// Resolve paths relativos ao próprio knexfile, evita problemas de cwd.
// dev   : backend/knexfile.ts          → migrations em backend/migrations/*.ts
// prod  : backend/dist/knexfile.js     → migrations em backend/dist/migrations/*.js
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isCompiled = __filename.endsWith(".js");

const config: Knex.Config = {
  client: "pg",
  connection: {
    host: process.env.PG_HOST ?? "127.0.0.1",
    port: Number(process.env.PG_PORT ?? 5432),
    user: process.env.PG_USER ?? "vistomap",
    password: process.env.PG_PASSWORD ?? "",
    database: process.env.PG_DATABASE ?? "vistomap",
  },
  pool: { min: 1, max: 4 },
  migrations: {
    directory: resolve(__dirname, "migrations"),
    tableName: "knex_migrations",
    extension: isCompiled ? "js" : "ts",
    loadExtensions: isCompiled ? [".js"] : [".ts"],
  },
};

export default config;
