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

/**
 * Papéis operacionais — derivados dos grupos GLPI no momento do login.
 * admin = VistoMap-Administradores. moderador = VistoMap-Moderador (tudo
 * igual ao admin, exceto Cancelar vistoria e a tela de Status). leitura =
 * "VistoMap - Leitura" (só visualização, zero ação, escopo restrito de
 * telas). tecnico = VistoMap-Tecnicos (app técnico, módulo Vistoria).
 * instalador = VistoMap-Instalação (app técnico, módulo Instalação).
 */
export type SessionRole = "admin" | "moderador" | "leitura" | "tecnico" | "instalador";

/** Módulos do app de campo — um usuário pode ter acesso aos dois. */
export type Modulo = "vistoria" | "instalacao";

export interface SessionClaims extends JWTPayload {
  sub: string;
  email?: string;
  tecnicoId?: string;
  role?: SessionRole;
  /** Módulos que o usuário tem acesso, pelos grupos GLPI (app técnico). */
  modulos?: Modulo[];
}

export async function signSessionJwt(
  claims: {
    sub: string;
    email?: string;
    tecnicoId?: string;
    role?: SessionRole;
    modulos?: Modulo[];
  },
  expiresIn: string = EXPIRES_IN
): Promise<string> {
  return new SignJWT({
    email: claims.email,
    tecnicoId: claims.tecnicoId,
    role: claims.role ?? "tecnico",
    modulos: claims.modulos,
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

/**
 * Ticket curto do fluxo de vínculo de aparelho (/liberar-acesso) — prova
 * que `POST .../validar` já conferiu identidade+senha+grupo, sem precisar
 * repetir tudo isso em `.../confirmar`. Claims própria (não reaproveita
 * SessionClaims) e `purpose` fixo de propósito: garante que um token de
 * sessão normal nunca é aceito aqui, e vice-versa, mesmo assinados com o
 * mesmo segredo.
 */
export interface ActivationTicketClaims extends JWTPayload {
  purpose: "device-activation";
  usersId: string;
  deviceId: string;
}

export async function signActivationTicket(
  claims: { usersId: string; deviceId: string }
): Promise<string> {
  return new SignJWT({
    purpose: "device-activation",
    usersId: claims.usersId,
    deviceId: claims.deviceId,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSecret());
}

export async function verifyActivationTicket(
  token: string
): Promise<ActivationTicketClaims> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
  if (payload.purpose !== "device-activation" || !payload.usersId || !payload.deviceId) {
    throw new Error("Ticket de ativação inválido");
  }
  return payload as ActivationTicketClaims;
}
