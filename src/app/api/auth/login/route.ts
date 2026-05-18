import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { getJwtExpiresAtMs, signSessionJwt } from "@/lib/jwt";
import type { AuthSession, Tecnico } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Nome do grupo no GLPI cujos membros têm acesso ao VistoMap.
 * Configurável via env GLPI_VISTOMAP_GROUP (default: "VistoMap-Tecnicos").
 * Se a variável estiver vazia (""), o filtro por grupo é desativado
 * e qualquer usuário GLPI ativo pode logar — útil só em dev.
 */
const ALLOWED_GROUP =
  process.env.GLPI_VISTOMAP_GROUP ?? "VistoMap-Tecnicos";

interface GlpiUser {
  id: number;
  name: string;
  firstname: string | null;
  realname: string | null;
  email: string;
  password: string;
}

export async function POST(req: NextRequest) {
  try {
    const { email, senha } = (await req.json()) as {
      email: string;
      senha: string;
    };

    if (!email || !senha) {
      return NextResponse.json(
        { message: "Email e senha são obrigatórios" },
        { status: 400 }
      );
    }

    // Busca usuário pelo e-mail em glpi_users + glpi_useremails.
    // Se ALLOWED_GROUP estiver definido, exige que o usuário pertença ao grupo.
    const groupJoin = ALLOWED_GROUP
      ? `INNER JOIN glpi_groups_users gu ON gu.users_id = u.id
         INNER JOIN glpi_groups g ON g.id = gu.groups_id AND g.name = ?`
      : "";

    const rows = await query<GlpiUser>(
      `
        SELECT u.id, u.name, u.firstname, u.realname, u.password
          FROM glpi_users u
          INNER JOIN glpi_useremails ue ON ue.users_id = u.id
          ${groupJoin}
         WHERE ue.email = ?
           AND u.is_deleted = 0
           AND u.is_active = 1
         LIMIT 1
      `,
      ALLOWED_GROUP ? [ALLOWED_GROUP, email] : [email]
    );

    const user = rows[0];
    if (!user) {
      return NextResponse.json(
        { message: "Credenciais inválidas ou sem acesso ao VistoMap" },
        { status: 401 }
      );
    }

    // GLPI 9.x → SHA1 puro. GLPI 10.x → bcrypt ($2y$...).
    // Tenta bcrypt primeiro; se o hash não tiver prefixo $2, cai no SHA1.
    const hash = user.password;
    let senhaOk = false;
    if (hash.startsWith("$2")) {
      senhaOk = await bcrypt.compare(senha, hash);
    } else {
      const sha1 = crypto.createHash("sha1").update(senha).digest("hex");
      senhaOk = sha1 === hash;
    }
    if (!senhaOk) {
      return NextResponse.json(
        { message: "Credenciais inválidas ou sem acesso ao VistoMap" },
        { status: 401 }
      );
    }

    const tecnico: Tecnico = {
      id: String(user.id),
      nome:
        `${user.firstname ?? ""} ${user.realname ?? ""}`.trim() || user.name,
      email,
    };

    // JWT real (HS256) com o mesmo JWT_SECRET do Fastify postes-api.
    const token = await signSessionJwt({
      sub: tecnico.id,
      email: tecnico.email,
      tecnicoId: tecnico.id,
    });

    const session: AuthSession = {
      token,
      tecnico,
      expiresAt: getJwtExpiresAtMs(),
    };

    return NextResponse.json(session);
  } catch (error) {
    console.error("[api/auth/login] POST error", error);
    return NextResponse.json(
      { message: "Erro interno ao autenticar" },
      { status: 500 }
    );
  }
}
