import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { query } from "@/lib/db";
import { getJwtExpiresAtMs, signSessionJwt } from "@/lib/jwt";
import type { AuthSession, Tecnico } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    // Busca usuário pelo e-mail em glpi_users + glpi_useremails (default email).
    const rows = await query<GlpiUser>(
      `
        SELECT u.id, u.name, u.firstname, u.realname, u.password
          FROM glpi_users u
          INNER JOIN glpi_useremails ue ON ue.users_id = u.id
         WHERE ue.email = ?
           AND u.is_deleted = 0
           AND u.is_active = 1
         LIMIT 1
      `,
      [email]
    );

    const user = rows[0];
    if (!user) {
      return NextResponse.json(
        { message: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    // GLPI armazena senhas com SHA1 (legado) ou bcrypt. Aqui SHA1 só.
    // Quando precisar bcrypt, adicionamos bcryptjs como dep.
    const sha1 = crypto.createHash("sha1").update(senha).digest("hex");
    if (user.password !== sha1) {
      return NextResponse.json(
        { message: "Credenciais inválidas" },
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
