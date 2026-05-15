import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config.js";

/**
 * Plugin de autenticação JWT compartilhado com o Next.
 *
 * Decorators expostos:
 *   - request.user                : payload do JWT após verificação
 *   - reply.unauthorized(message?) : helper para 401
 *
 * Hooks:
 *   - fastify.authenticate         : exige JWT válido
 *   - fastify.internalOnly         : exige cliente vir de CIDR allow-list
 */
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email?: string; tecnicoId?: string };
    user: { sub: string; email?: string; tecnicoId?: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    internalOnly: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function ipMatchesCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!range || !Number.isFinite(bits)) return false;

  // IPv4 simples (forma "a.b.c.d/n"). IPv6 entra como literal exato.
  const toLong = (s: string) =>
    s.split(".").reduce((acc, p) => (acc << 8) | Number(p), 0) >>> 0;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(range) || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    return ip === range;
  }
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toLong(ip) & mask) === (toLong(range) & mask);
}

const allowlist = env.INTERNAL_ALLOWLIST.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  fastify.decorate(
    "authenticate",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
      } catch {
        return reply
          .code(401)
          .send({ message: "Sessão expirada ou inválida" });
      }
    }
  );

  fastify.decorate(
    "internalOnly",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip;
      const allowed = allowlist.some((cidr) => ipMatchesCidr(ip, cidr));
      if (!allowed) {
        return reply.code(403).send({ message: "Acesso restrito" });
      }
    }
  );
};

export default fp(authPlugin, { name: "auth" });
