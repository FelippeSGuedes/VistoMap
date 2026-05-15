import Fastify from "fastify";
import sensible from "@fastify/sensible";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config.js";
import authPlugin from "./plugins/auth.js";
import healthRoutes from "./routes/health.js";

async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss Z" } }
          : undefined,
    },
    trustProxy: true,
    bodyLimit: 16 * 1024 * 1024, // 16MB (suficiente p/ payloads — vídeos vão pro Next)
    disableRequestLogging: false,
  });

  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: env.INTERNAL_ALLOWLIST.split(",").map((s) => s.trim()),
  });

  await app.register(authPlugin);

  // Healthcheck (público — necessário para Docker/proxy)
  await app.register(healthRoutes);

  // TODO ETAPA 6: app.register(postesRoutes, { prefix: "/postes" });

  app.setErrorHandler((err, _req, reply) => {
    app.log.error({ err }, "request failed");
    const status = err.statusCode ?? 500;
    reply.code(status).send({
      message: err.message || "Erro interno",
      ...(env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
    });
  });

  return app;
}

async function main() {
  const app = await buildServer();
  try {
    await app.listen({ host: env.HOST, port: env.PORT });
    app.log.info(`vistomap-postes-api ready on :${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
