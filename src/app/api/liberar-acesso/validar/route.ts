import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { signActivationTicket } from "@/lib/jwt";
import {
  fetchActiveBindingByDevice,
  fetchActiveBindingByUser,
} from "@/lib/glpi/deviceBinding";
import { logError } from "@/lib/observability";
import { checkLoginRateLimit, resetLoginRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface GlpiUserIdentity {
  id: number;
  name: string;
  firstname: string | null;
  realname: string | null;
  registration_number: string | null;
  password: string;
}

function normalizar(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * POST /api/liberar-acesso/validar
 *
 * Passo 1 do fluxo de vínculo de aparelho — confere identidade (nome +
 * e-mail + matrícula + a MESMA senha do login) contra o GLPI. Senha é
 * obrigatória aqui: nome/e-mail/matrícula não são segredo (alguém pode
 * conhecer os dados de outro técnico), sem a senha um terceiro poderia
 * vincular o aparelho ERRADO e trancar o técnico real pra fora.
 *
 * Não grava nada — só devolve um ticket curto (10min) que
 * .../confirmar usa depois do termo de responsabilidade aceito.
 */
export async function POST(req: NextRequest) {
  try {
    const { nome, email, matricula, senha, deviceId, deviceModel } = (await req.json()) as {
      nome?: string;
      email?: string;
      matricula?: string;
      senha?: string;
      deviceId?: string;
      deviceModel?: string;
    };

    if (!nome?.trim() || !email?.trim() || !matricula?.trim() || !senha) {
      return NextResponse.json(
        { message: "Preencha nome, e-mail, matrícula e senha." },
        { status: 400 }
      );
    }
    if (!deviceId?.trim()) {
      return NextResponse.json(
        { message: "Não foi possível identificar o aparelho. Abra este link pelo aplicativo instalado." },
        { status: 400 }
      );
    }

    const rateLimitKey = `ativacao:${getClientIp(req)}:${normalizar(email)}`;
    const rateLimit = checkLoginRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { message: "Muitas tentativas. Tente novamente em alguns instantes." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } }
      );
    }

    const rows = await query<GlpiUserIdentity>(
      `
        SELECT u.id, u.name, u.firstname, u.realname, u.registration_number, u.password
          FROM glpi_users u
          INNER JOIN glpi_useremails ue ON ue.users_id = u.id AND ue.is_default = 1
         WHERE ue.email = ?
           AND u.is_deleted = 0
           AND u.is_active = 1
         LIMIT 1
      `,
      [email.trim()]
    );
    const user = rows[0];

    // Mensagem genérica de propósito (não diz QUAL campo errou) — evita
    // vazar se um e-mail/matrícula existe no GLPI pra quem só está testando.
    const ERRO_GENERICO = "Dados não conferem. Confira nome, e-mail, matrícula e senha.";

    if (!user) {
      return NextResponse.json({ message: ERRO_GENERICO }, { status: 401 });
    }

    const nomeGlpi = `${user.firstname ?? ""} ${user.realname ?? ""}`.trim() || user.name;
    const nomeBate = normalizar(nomeGlpi) === normalizar(nome);
    const matriculaBate =
      normalizar(user.registration_number ?? "") === normalizar(matricula) &&
      (user.registration_number ?? "").trim() !== "";
    const senhaBate = await verifyPassword(senha, user.password);

    if (!nomeBate || !matriculaBate || !senhaBate) {
      return NextResponse.json({ message: ERRO_GENERICO }, { status: 401 });
    }

    // Só conta corporativa de campo (vistoria/instalação) pode ativar
    // aparelho — mesmo grupo exigido no login normal.
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
    if (groupRows.length === 0) {
      return NextResponse.json(
        { message: "Esta conta não pertence a nenhum grupo do VistoMap (Vistoria ou Instalação)." },
        { status: 403 }
      );
    }

    const bindingExistente = await fetchActiveBindingByUser(user.id);
    if (bindingExistente) {
      return NextResponse.json(
        {
          message:
            "Este usuário já tem um aparelho vinculado. Peça para o administrador liberar um novo aparelho.",
        },
        { status: 409 }
      );
    }

    const deviceJaVinculado = await fetchActiveBindingByDevice(deviceId.trim());
    if (deviceJaVinculado && deviceJaVinculado.users_id !== user.id) {
      return NextResponse.json(
        { message: "Este aparelho já está vinculado a outro usuário." },
        { status: 409 }
      );
    }

    const ticket = await signActivationTicket({
      usersId: String(user.id),
      deviceId: deviceId.trim(),
    });

    resetLoginRateLimit(rateLimitKey);
    return NextResponse.json({
      ticket,
      nome: nomeGlpi,
      deviceModel: deviceModel ?? null,
    });
  } catch (error) {
    console.error("[api/liberar-acesso/validar] POST error", error);
    void logError("app", "liberar-acesso/validar", error);
    return NextResponse.json(
      { message: "Erro interno ao validar identidade" },
      { status: 500 }
    );
  }
}
