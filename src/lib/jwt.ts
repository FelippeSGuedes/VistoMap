import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * JWT compartilhado com o backend Fastify (`postes-api`).
 *
 * - Algoritmo: HS256 (segredo simétrico via env JWT_SECRET).
 * - Payload obrigatório: { sub: string, email?: string }.
 * - Expiração: 8h (alinhada com a sessão atual do app).
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

export interface SessionClaims extends JWTPayload {
  sub: string;
  email?: string;
  tecnicoId?: string;
}

export async function signSessionJwt(claims: {
  sub: string;
  email?: string;
  tecnicoId?: string;
}): Promise<string> {
  return new SignJWT({
    email: claims.email,
    tecnicoId: claims.tecnicoId,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(getSecret());
}

export async function verifySessionJwt(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
  if (!payload.sub) throw new Error("JWT sem sub");
  return payload as SessionClaims;
}

export function getJwtExpiresAtMs(): number {
  // 8h em ms — usado para AuthSession.expiresAt no client.
  return Date.now() + 1000 * 60 * 60 * 8;
}
