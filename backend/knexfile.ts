import type { Knex } from "knex";

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
    directory: "./migrations",
    tableName: "knex_migrations",
    extension: "ts",
  },
};

export default config;
