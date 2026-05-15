import type { FastifyPluginAsync } from "fastify";
import { healthcheck } from "../lib/db.js";
import { env } from "../config.js";

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async () => {
    let pg: Awaited<ReturnType<typeof healthcheck>> | { ok: false; error: string };
    try {
      pg = await healthcheck();
    } catch (err) {
      pg = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    return {
      service: "vistomap-postes-api",
      ts: new Date().toISOString(),
      env: env.NODE_ENV,
      raio_troca_m: env.POSTE_TROCA_RAIO_M,
      csv_path: env.CSV_PATH,
      pg,
    };
  });
};

export default healthRoutes;
