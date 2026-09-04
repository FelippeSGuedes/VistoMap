import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { buildSessionForUser } from "@/lib/auth/issueSession";
import { fetchActiveBindingByUser } from "@/lib/glpi/deviceBinding";
import { logError } from "@/lib/observability";
import { checkLoginRateLimit, resetLoginRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface GlpiUser {
  id: number;
  name: string;
  password: string;
}

// Versão mínima do APK (versionCode) aceita. 0 = gate desligado (default).
// Ative em produção definindo APP_MIN_BUILD no .env.local DEPOIS de distribuir
// o APK novo — senão trava todos os técnicos em campo de uma vez.
const APP_MIN_BUILD = Number(process.env.APP_MIN_BUILD ?? "0");
const APP_OUTDATED_MSG =
  "App desatualizado. Atualize para a versão mais recente ou entre em " +
  "contato com a equipe de Engenharia de Desenvolvimento.";

// Vínculo de aparelho (/liberar-acesso) — desligado por padrão. O APK
// instalado hoje em campo NÃO tem o plugin @capacitor/device compilado
// (só foi adicionado ao projeto, nenhum APK novo foi gerado/distribuído
// ainda) — se isso for exigido agora, todo técnico cuja sessão de 30 dias
// expirar fica trancado pra fora, sem conseguir nem ativar (a própria
// /liberar-acesso depende do mesmo plugin ausente). Ativar em
// .env.local (DEVICE_BINDING_ENFORCED=true) SÓ depois de confirmar que o
// APK novo (com @capacitor/device) já está instalado em campo.
const DEVICE_BINDING_ENFORCED = process.env.DEVICE_BINDING_ENFORCED === "true";

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

    const { login, senha, deviceId } = (await req.json()) as {
      login: string;
      senha: string;
      /** Identificador do aparelho (@capacitor/device) — ausente em builds
       * antigas, ainda sem o vínculo. Ver /liberar-acesso. */
      deviceId?: string;
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
        SELECT u.id, u.name, u.password
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

    // Gate de vínculo de aparelho (ver /liberar-acesso) — só entra em vigor
    // com DEVICE_BINDING_ENFORCED=true (ver comentário acima). Sem deviceId
    // no corpo (build antiga do app, antes desta feature) trata como "não
    // vinculado" — mesma mensagem, mesmo caminho de ativação.
    if (DEVICE_BINDING_ENFORCED) {
      const binding = await fetchActiveBindingByUser(user.id);
      if (!binding) {
        return NextResponse.json(
          {
            message: "Este login ainda não foi liberado neste aparelho. Ative em /liberar-acesso.",
            code: "DEVICE_NOT_BOUND",
          },
          { status: 403 }
        );
      }
      if (!deviceId || binding.device_id !== deviceId) {
        return NextResponse.json(
          {
            message: "Este login está vinculado a outro aparelho. Fale com o administrador.",
            code: "DEVICE_MISMATCH",
          },
          { status: 403 }
        );
      }
    }

    // Gate de grupo + montagem da sessão — mesma lógica usada logo após a
    // ativação em /liberar-acesso (login automático, sem pedir senha de novo).
    const result = await buildSessionForUser(user.id);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 403 });
    }

    resetLoginRateLimit(rateLimitKey);
    return NextResponse.json(result.session);
  } catch (error) {
    console.error("[api/auth/login] POST error", error);
    void logError("app", "auth/login", error);
    return NextResponse.json(
      { message: "Erro interno ao autenticar" },
      { status: 500 }
    );
  }
}
