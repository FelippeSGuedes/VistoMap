import "server-only";
import { verifySessionJwt, type SessionRole } from "@/lib/jwt";
import { query } from "@/lib/db";

/**
 * Extrai o ator (usuário GLPI logado) do Authorization header da request.
 * Usado em endpoints do /painel para registrar auditoria.
 *
 * Retorna null silenciosamente quando token ausente/inválido — caller
 * decide se aborta a operação ou usa ator "sistema".
 */
export interface ActorContext {
  id: number;
  nome: string;
  role: SessionRole;
}

export async function getActorFromRequest(
  req: Request
): Promise<ActorContext | null> {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const claims = await verifySessionJwt(m[1]);
    const userId = Number(claims.sub);
    if (!Number.isFinite(userId)) return null;
    // Busca nome real do GLPI (firstname + realname || username).
    const rows = await query<{
      name: string;
      firstname: string | null;
      realname: string | null;
    }>(
      `SELECT name, firstname, realname FROM glpi_users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const u = rows[0];
    const nome = u
      ? `${u.firstname ?? ""} ${u.realname ?? ""}`.trim() || u.name
      : "Usuário " + userId;
    return {
      id: userId,
      nome,
      role: claims.role ?? "tecnico",
    };
  } catch {
    return null;
  }
}
