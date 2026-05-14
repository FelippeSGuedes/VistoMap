import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { AuthSession, Tecnico } from "@/types";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface GlpiUser {
  id: number;
  name: string;
  firstname: string;
  realname: string;
  email: string;
  password: string;
}

export async function POST(req: NextRequest) {
  try {
    const { email, senha } = await req.json() as { email: string; senha: string };

    if (!email || !senha) {
      return NextResponse.json({ message: "Email e senha são obrigatórios" }, { status: 400 });
    }

    // Busca usuário pelo e-mail na tabela glpi_users + glpi_useremails
    const rows = await query<GlpiUser>(`
      SELECT u.id, u.name, u.firstname, u.realname, u.password
      FROM glpi_users u
      INNER JOIN glpi_useremails ue ON ue.users_id = u.id
      WHERE ue.email = ?
        AND u.is_deleted = 0
        AND u.is_active = 1
      LIMIT 1
    `, [email]);

    if (rows.length === 0) {
      return NextResponse.json({ message: "Credenciais inválidas" }, { status: 401 });
    }

    const user = rows[0];

    // GLPI armazena senhas como SHA1 sem salt (legado) ou bcrypt
    // Tenta SHA1 primeiro, depois compara direto
    const sha1 = crypto.createHash("sha1").update(senha).digest("hex");
    const validSha1 = user.password === sha1;

    if (!validSha1) {
      return NextResponse.json({ message: "Credenciais inválidas" }, { status: 401 });
    }

    const tecnico: Tecnico = {
      id: String(user.id),
      nome: `${user.firstname ?? ""} ${user.realname ?? ""}`.trim() || user.name,
      email,
    };

    const session: AuthSession = {
      token: crypto.randomBytes(32).toString("hex"),
      tecnico,
      expiresAt: Date.now() + 1000 * 60 * 60 * 8,
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
