import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { getJwtExpiresAtMs, signSessionJwt, type SessionRole } from "@/lib/jwt";
import { auditInsert } from "@/lib/glpi/audit";
import type { AuthSession, Tecnico } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Grupos GLPI que dão acesso ao VistoMap.
 * - VistoMap-Tecnicos    → role "tecnico" → acessa /app (raiz)
 * - VistoMap-Administradores → role "admin" → acessa /painel
 * Admin TAMBÉM pode acessar o app (super-conjunto).
 */
const ALLOWED_GROUP =
  process.env.GLPI_VISTOMAP_GROUP ?? "VistoMap-Tecnicos";
const ADMIN_GROUP =
  process.env.GLPI_VISTOMAP_ADMIN_GROUP ?? "VistoMap-Administradores";
// Variante sem acento — GLPI às vezes cadastra sem acentuação.
const ADMIN_GROUP_ALT =
  ADMIN_GROUP === "VistoMap-Administradores"
    ? "VistoMap-Administradores"
    : ADMIN_GROUP;

interface GlpiUser {
  id: number;
  name: string;
  firstname: string | null;
  realname: string | null;
  email: string;
  password: string;
}

interface GroupRow {
  name: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { login?: string; email?: string; senha?: string };
    const login = (body.login ?? body.email ?? "").trim();
    const senha = body.senha ?? "";

    if (!login || !senha) {
      return NextResponse.json(
        { message: "Usuário/e-mail e senha são obrigatórios" },
        { status: 400 }
      );
    }

    // Detecta se digitou e-mail ou username GLPI (u.name).
    const isEmail = /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(login);

    let rows: GlpiUser[];
    if (isEmail) {
      rows = await query<GlpiUser>(
        `
          SELECT u.id, u.name, u.firstname, u.realname, u.password,
                 ue.email
            FROM glpi_users u
            INNER JOIN glpi_useremails ue ON ue.users_id = u.id
           WHERE ue.email = ?
             AND u.is_deleted = 0
             AND u.is_active = 1
           LIMIT 1
        `,
        [login]
      );
    } else {
      rows = await query<GlpiUser>(
        `
          SELECT u.id, u.name, u.firstname, u.realname, u.password,
                 COALESCE(ue.email, '') AS email
            FROM glpi_users u
            LEFT JOIN glpi_useremails ue ON ue.users_id = u.id
           WHERE u.name = ?
             AND u.is_deleted = 0
             AND u.is_active = 1
           LIMIT 1
        `,
        [login]
      );
    }

    const user = rows[0];
    if (!user) {
      return NextResponse.json(
        { message: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    // SHA1 (GLPI 9.x) ou bcrypt ($2y$...) — GLPI 10.x.
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
        { message: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    // Resolve grupos do usuário → determina role.
    const groupRows = await query<GroupRow>(
      `
        SELECT g.name
          FROM glpi_groups_users gu
          INNER JOIN glpi_groups g ON g.id = gu.groups_id
         WHERE gu.users_id = ?
      `,
      [user.id]
    );
    const groupNames = groupRows.map((g) => g.name);
    const isAdmin = ADMIN_GROUP
      ? groupNames.some(
          (n) => n === ADMIN_GROUP || n === ADMIN_GROUP_ALT
        )
      : false;
    const ALLOWED_GROUP_ALT =
      ALLOWED_GROUP === "VistoMap-Tecnicos" ? "VistoMap-Técnicos" : ALLOWED_GROUP;
    const isTecnico = ALLOWED_GROUP
      ? groupNames.some(
          (n) => n === ALLOWED_GROUP || n === ALLOWED_GROUP_ALT
        )
      : true;

    if (!isAdmin && !isTecnico) {
      return NextResponse.json(
        {
          message:
            "Usuário não autorizado. Solicite acesso ao grupo VistoMap-Tecnicos ou VistoMap-Administradores no GLPI.",
        },
        { status: 403 }
      );
    }

    const role: SessionRole = isAdmin ? "admin" : "tecnico";

    const tecnico: Tecnico = {
      id: String(user.id),
      nome:
        `${user.firstname ?? ""} ${user.realname ?? ""}`.trim() || user.name,
      email: user.email || user.name,
    };

    const token = await signSessionJwt({
      sub: tecnico.id,
      email: tecnico.email,
      tecnicoId: tecnico.id,
      role,
    });

    const session: AuthSession = {
      token,
      tecnico,
      expiresAt: getJwtExpiresAtMs(),
      role,
    };

    // Audit: registra login (fire-and-forget — não bloqueia resposta).
    void auditInsert({
      ator: { id: user.id, nome: tecnico.nome, role },
      acao: role === "admin" ? "login-admin" : "login-tecnico",
      descricao: `Login efetuado · ${tecnico.email || user.name}`,
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error("[api/auth/login] POST error", error);
    return NextResponse.json(
      { message: "Erro interno ao autenticar" },
      { status: 500 }
    );
  }
}
