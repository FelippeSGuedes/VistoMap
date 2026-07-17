import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * JWT compartilhado com o backend Fastify (`postes-api`).
 *
 * - Algoritmo: HS256 (segredo simétrico via env JWT_SECRET).
 * - Payload obrigatório: { sub: string, email?: string }.
 * - Expiração: 8h por padrão (usado pelo painel — web, computador
 *   potencialmente compartilhado). O app do técnico pede uma duração maior
 *   explicitamente (ver /api/auth/login) — 8h era menor que o próprio turno
 *   (07:30–18:00 = 10h30), obrigando login de novo no meio do dia.
 */

const ALG = "HS256";
const EXPIRES_IN = "8h";

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error(
      "JWT_SECRET ausente ou curto demais. Defina em /etc/vistomap/.env.local"
    );
  }
  return new TextEncoder().encode(raw);
}

/** Papéis operacionais — derivados dos grupos GLPI no momento do login. */
export type SessionRole = "admin" | "tecnico";

export interface SessionClaims extends JWTPayload {
  sub: string;
  email?: string;
  tecnicoId?: string;
  /** admin = grupo VistoMap-Administradores. tecnico = VistoMap-Tecnicos. */
  role?: SessionRole;
}

export async function signSessionJwt(
  claims: {
    sub: string;
    email?: string;
    tecnicoId?: string;
    role?: SessionRole;
  },
  expiresIn: string = EXPIRES_IN
): Promise<string> {
  return new SignJWT({
    email: claims.email,
    tecnicoId: claims.tecnicoId,
    role: claims.role ?? "tecnico",
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

export async function verifySessionJwt(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
  if (!payload.sub) throw new Error("JWT sem sub");
  return payload as SessionClaims;
}

/** @param hours Duração em horas (padrão 8h, igual ao token do painel). */
export function getJwtExpiresAtMs(hours = 8): number {
  return Date.now() + 1000 * 60 * 60 * hours;
}
