import "server-only";
import { NextResponse } from "next/server";
import { verifySessionJwt, type SessionClaims, type SessionRole } from "@/lib/jwt";

export type PainelRole = "leitura" | "moderador" | "admin";

/**
 * Ordem de acesso do /painel: leitura < moderador < admin. tecnico fica
 * abaixo de leitura de propósito — o app técnico nunca deve enxergar
 * rotas do painel, mesmo as só-leitura.
 */
const ROLE_RANK: Record<SessionRole, number> = {
  tecnico: -1,
  leitura: 0,
  moderador: 1,
  admin: 2,
};

export type PainelAuthResult =
  | { ok: true; claims: SessionClaims }
  | { ok: false; response: NextResponse };

/**
 * Extrai e valida o Bearer token de uma rota /api/painel/*, exigindo pelo
 * menos o papel `min`. Substitui o bloco de ~10 linhas antes duplicado em
 * cada rota (extrair header → verifySessionJwt → checar claims.role).
 */
export async function requirePainelRole(
  req: Request,
  min: PainelRole
): Promise<PainelAuthResult> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Não autenticado" }, { status: 401 }),
    };
  }
  try {
    const claims = await verifySessionJwt(token);
    const rank = claims.role ? ROLE_RANK[claims.role] : undefined;
    if (rank === undefined || rank < ROLE_RANK[min]) {
      return {
        ok: false,
        response: NextResponse.json({ message: "Acesso negado" }, { status: 403 }),
      };
    }
    return { ok: true, claims };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ message: "Token inválido" }, { status: 401 }),
    };
  }
}
