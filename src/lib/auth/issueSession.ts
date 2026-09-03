import "server-only";
import { query } from "@/lib/db";
import { getJwtExpiresAtMs, signSessionJwt } from "@/lib/jwt";
import type { AuthSession, Modulo, Tecnico } from "@/types";

interface GlpiUserBasic {
  id: number;
  name: string;
  firstname: string | null;
  realname: string | null;
  email: string | null;
}

export type BuildSessionResult =
  | { ok: true; session: AuthSession }
  | { ok: false; message: string };

/**
 * Monta a `AuthSession` (JWT + módulos/role) pra um usuário já autenticado
 * por OUTRO meio (senha conferida no caller). Extraído de
 * auth/login/route.ts pra reusar em liberar-acesso/confirmar (login
 * automático logo após a ativação do aparelho, sem pedir senha de novo).
 *
 * Mesmo gate de grupo do login normal — reprovar aqui é o único jeito de
 * alguém sem grupo VistoMap terminar a ativação e não conseguir entrar.
 */
export async function buildSessionForUser(userId: number): Promise<BuildSessionResult> {
  const rows = await query<GlpiUserBasic>(
    `
      SELECT u.id, u.name, u.firstname, u.realname, ue.email
        FROM glpi_users u
        LEFT JOIN glpi_useremails ue ON ue.users_id = u.id AND ue.is_default = 1
       WHERE u.id = ? AND u.is_deleted = 0 AND u.is_active = 1
       LIMIT 1
    `,
    [userId]
  );
  const user = rows[0];
  if (!user) return { ok: false, message: "Usuário não encontrado" };

  const groupRows = await query<{ name: string }>(
    `
      SELECT g.name
        FROM glpi_groups_users gu
        INNER JOIN glpi_groups g ON g.id = gu.groups_id
       WHERE gu.users_id = ?
         AND g.name IN ('VistoMap-Tecnicos', 'VistoMap-Técnicos', 'VistoMap-Instalação')
    `,
    [user.id]
  );
  const groupNames = new Set(groupRows.map((r) => r.name));
  const modulos: Modulo[] = [];
  if (groupNames.has("VistoMap-Tecnicos") || groupNames.has("VistoMap-Técnicos")) {
    modulos.push("vistoria");
  }
  if (groupNames.has("VistoMap-Instalação")) {
    modulos.push("instalacao");
  }
  if (modulos.length === 0) {
    return {
      ok: false,
      message: "Acesso negado. Esta conta não pertence a nenhum grupo do VistoMap (Vistoria ou Instalação).",
    };
  }

  const email = user.email ?? `${user.name}@gioc.local`;
  const tecnico: Tecnico = {
    id: String(user.id),
    nome: `${user.firstname ?? ""} ${user.realname ?? ""}`.trim() || user.name,
    email,
  };
  const role = modulos.includes("vistoria") ? "tecnico" : "instalador";

  const token = await signSessionJwt(
    { sub: tecnico.id, email: tecnico.email, tecnicoId: tecnico.id, role, modulos },
    "30d"
  );

  return {
    ok: true,
    session: {
      token,
      tecnico,
      expiresAt: getJwtExpiresAtMs(24 * 30),
      role,
      modulos,
    },
  };
}
