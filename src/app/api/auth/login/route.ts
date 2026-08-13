import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { getJwtExpiresAtMs, signSessionJwt } from "@/lib/jwt";
import { logError } from "@/lib/observability";
import { checkLoginRateLimit, resetLoginRateLimit, getClientIp } from "@/lib/rate-limit";
import type { AuthSession, Modulo, Tecnico } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$2y$") || stored.startsWith("$2b$")) {
    return bcrypt.compare(plain, stored.replace(/^\$2y\$/, "$2b$"));
  }
  return crypto.createHash("sha1").update(plain).digest("hex") === stored;
}

interface GlpiUser {
  id: number;
  name: string;
  firstname: string | null;
  realname: string | null;
  email: string;
  password: string;
}

// Versão mínima do APK (versionCode) aceita. 0 = gate desligado (default).
// Ative em produção definindo APP_MIN_BUILD no .env.local DEPOIS de distribuir
// o APK novo — senão trava todos os técnicos em campo de uma vez.
const APP_MIN_BUILD = Number(process.env.APP_MIN_BUILD ?? "0");
const APP_OUTDATED_MSG =
  "App desatualizado. Atualize para a versão mais recente ou entre em " +
  "contato com a equipe de Engenharia de Desenvolvimento.";

export async function POST(req: NextRequest) {
  try {
    // Gate de versão: bloqueia APKs legados (sem header ou abaixo do mínimo).
    if (APP_MIN_BUILD > 0) {
      const build = Number(req.headers.get("x-app-build") ?? "0");
      if (!Number.isFinite(build) || build < APP_MIN_BUILD) {
        return NextResponse.json(
          { message: APP_OUTDATED_MSG, code: "APP_OUTDATED" },
          { status: 426 } // Upgrade Required
        );
      }
    }

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

    // Gate de grupo: só quem está num dos grupos GLPI do app de campo entra.
    // Faltava essa checagem — qualquer usuário GLPI ativo com senha válida
    // conseguia logar no app, independente de grupo. Um usuário pode estar
    // nos dois grupos (vistoria + instalação) — o cliente decide o que fazer
    // com a lista de módulos (abre direto ou pergunta qual).
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
      return NextResponse.json(
        { message: "Acesso negado. Esta conta não pertence a nenhum grupo do VistoMap (Vistoria ou Instalação)." },
        { status: 403 }
      );
    }

    const email = user.email ?? `${user.name}@gioc.local`;
    const tecnico: Tecnico = {
      id: String(user.id),
      nome: `${user.firstname ?? ""} ${user.realname ?? ""}`.trim() || user.name,
      email,
    };

    // role: quando só tem um módulo, reflete ele direto (tecnico/instalador).
    // Com os dois, o cliente pergunta qual abrir — role fica como o primeiro
    // só pra auditoria/log ter um valor sensato; quem manda é `modulos`.
    const role = modulos.includes("vistoria") ? "tecnico" : "instalador";

    // JWT real (HS256) com o mesmo JWT_SECRET do Fastify postes-api.
    // Sessão de 30 dias — app de campo num aparelho pessoal do técnico, não
    // faz sentido pedir login de novo no meio do turno (8h < turno de 10h30).
    // Continua revalidando o token em cada chamada; deslogar continua
    // disponível manualmente em Perfil.
    const token = await signSessionJwt(
      { sub: tecnico.id, email: tecnico.email, tecnicoId: tecnico.id, role, modulos },
      "30d"
    );

    const session: AuthSession = {
      token,
      tecnico,
      expiresAt: getJwtExpiresAtMs(24 * 30),
      role,
      modulos,
    };

    resetLoginRateLimit(rateLimitKey);
    return NextResponse.json(session);
  } catch (error) {
    console.error("[api/auth/login] POST error", error);
    void logError("app", "auth/login", error);
    return NextResponse.json(
      { message: "Erro interno ao autenticar" },
      { status: 500 }
    );
  }
}
