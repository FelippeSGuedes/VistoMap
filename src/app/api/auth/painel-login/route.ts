import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { getJwtExpiresAtMs, signSessionJwt } from "@/lib/jwt";
import { checkLoginRateLimit, resetLoginRateLimit, getClientIp } from "@/lib/rate-limit";
import type { AuthSession, SessionRole, Tecnico } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface GlpiUser {
  id: number;
  name: string;
  firstname: string | null;
  realname: string | null;
  email: string | null;
  password: string;
}

/** Suporta bcrypt (GLPI 10, hash começa com $2y$/$2b$) e SHA1 (GLPI 9 legado). */
async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$2y$") || stored.startsWith("$2b$")) {
    // GLPI usa $2y$ (PHP), bcryptjs aceita após trocar o prefixo
    const normalized = stored.replace(/^\$2y\$/, "$2b$");
    return bcrypt.compare(plain, normalized);
  }
  // SHA1 legado (40 hex chars)
  const sha1 = crypto.createHash("sha1").update(plain).digest("hex");
  return sha1 === stored;
}

export async function POST(req: NextRequest) {
  try {
    const { login, senha } = (await req.json()) as {
      login: string;
      senha: string;
    };

    if (!login?.trim() || !senha) {
      return NextResponse.json(
        { message: "Usuário e senha são obrigatórios" },
        { status: 400 }
      );
    }

    const rateLimitKey = `${getClientIp(req)}:${login.trim().toLowerCase()}`;
    const rateLimit = checkLoginRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { message: "Muitas tentativas. Tente novamente em alguns instantes." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } }
      );
    }

    // Busca por username (name) OU e-mail
    const rows = await query<GlpiUser>(
      `
        SELECT u.id, u.name, u.firstname, u.realname, u.password,
               ue.email
          FROM glpi_users u
          LEFT JOIN glpi_useremails ue ON ue.users_id = u.id AND ue.is_default = 1
         WHERE (u.name = ? OR ue.email = ?)
           AND u.is_deleted = 0
           AND u.is_active = 1
         LIMIT 1
      `,
      [login.trim(), login.trim()]
    );

    const user = rows[0];
    if (!user) {
      return NextResponse.json(
        { message: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(senha, user.password);
    if (!valid) {
      return NextResponse.json(
        { message: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    // Papel resolvido pelos grupos GLPI, em ordem de prioridade — um usuário
    // pode estar em mais de um grupo (ex.: migração), o mais privilegiado vence.
    const groupRows = await query<{ name: string }>(
      `
        SELECT g.name
          FROM glpi_groups_users gu
          INNER JOIN glpi_groups g ON g.id = gu.groups_id
         WHERE gu.users_id = ?
           AND g.name IN ('VistoMap-Administradores', 'VistoMap-Moderador', 'VistoMap - Leitura')
      `,
      [user.id]
    );
    const groupNames = new Set(groupRows.map((r) => r.name));
    const role: SessionRole | null = groupNames.has("VistoMap-Administradores")
      ? "admin"
      : groupNames.has("VistoMap-Moderador")
      ? "moderador"
      : groupNames.has("VistoMap - Leitura")
      ? "leitura"
      : null;

    if (!role) {
      return NextResponse.json(
        { message: "Acesso negado. Esta conta não pertence a nenhum grupo de acesso do painel." },
        { status: 403 }
      );
    }

    const email = user.email ?? `${user.name}@gioc.local`;
    const tecnico: Tecnico = {
      id: String(user.id),
      nome: `${user.firstname ?? ""} ${user.realname ?? ""}`.trim() || user.name,
      email,
    };

    const token = await signSessionJwt({
      sub: tecnico.id,
      email,
      tecnicoId: tecnico.id,
      role,
    });

    const session: AuthSession = {
      token,
      tecnico,
      expiresAt: getJwtExpiresAtMs(),
      role,
    };

    resetLoginRateLimit(rateLimitKey);
    return NextResponse.json(session);
  } catch (error) {
    console.error("[api/auth/painel-login] POST error", error);
    return NextResponse.json(
      { message: "Erro interno ao autenticar" },
      { status: 500 }
    );
  }
}
