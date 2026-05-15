import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3001),

  PG_HOST: z.string().default("postgis"),
  PG_PORT: z.coerce.number().int().positive().default(5432),
  PG_USER: z.string().default("vistomap"),
  PG_PASSWORD: z.string(),
  PG_DATABASE: z.string().default("vistomap"),
  PG_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  PG_POOL_MAX: z.coerce.number().int().positive().default(20),

  /** Segredo compartilhado com o Next pra validar JWT da sessão. */
  JWT_SECRET: z.string().min(16),

  /** Diretório lido pelo importador de CSV (somente leitura). */
  CSV_PATH: z.string().default("/csv"),

  /** Raio máximo (m) para uma mudança de poste ser permitida. */
  POSTE_TROCA_RAIO_M: z.coerce.number().int().positive().default(50),

  /** CIDRs internos que podem chamar endpoints administrativos sem JWT. */
  INTERNAL_ALLOWLIST: z
    .string()
    .default("127.0.0.1,::1,172.16.0.0/12,10.0.0.0/8"),

  /** Origem permitida (CORS) — proxy reverso costuma deixar mesma-origem. */
  CORS_ORIGIN: z.string().default("*"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export const env = Env.parse(process.env);
export type Env = typeof env;
