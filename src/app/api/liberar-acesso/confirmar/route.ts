import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { resgatarCodigoAtivacao } from "@/lib/glpi/activationCode";
import { buildSessionForUser } from "@/lib/auth/issueSession";
import {
  createBinding,
  fetchActiveBindingByDevice,
  fetchActiveBindingByUser,
} from "@/lib/glpi/deviceBinding";
import { auditInsert } from "@/lib/glpi/audit";
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
  email: string | null;
}

/**
 * POST /api/liberar-acesso/confirmar
 *
 * Passo 3 — chamado DE DENTRO DO APP, já instalado, logo na primeira
 * abertura (sem sessão ainda). A pessoa digita o código de 6 dígitos que
 * recebeu no navegador (passo 2) — aqui é onde o aparelho de verdade
 * entra em cena (deviceId só existe com o app rodando nativo). Grava o
 * vínculo e já loga automaticamente.
 */
export async function POST(req: NextRequest) {
  try {
    const { codigo, deviceId, deviceModel } = (await req.json()) as {
      codigo?: string;
      deviceId?: string;
      deviceModel?: string;
    };

    if (!codigo?.trim()) {
      return NextResponse.json({ message: "Informe o código de ativação." }, { status: 400 });
    }
    if (!deviceId?.trim()) {
      return NextResponse.json(
        { message: "Não foi possível identificar o aparelho. Feche e abra o aplicativo de novo." },
        { status: 400 }
      );
    }

    // Código de 6 dígitos é adivinhável por força bruta sem isso — mesmo
    // limitador do login, chave por IP (não por código, senão um
    // atacante trocando de código a cada tentativa furaria o limite).
    const rateLimitKey = `codigo-ativacao:${getClientIp(req)}`;
    const rateLimit = checkLoginRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { message: "Muitas tentativas. Tente novamente em alguns instantes." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } }
      );
    }

    const resgate = await resgatarCodigoAtivacao(codigo.trim());
    if (!resgate) {
      return NextResponse.json(
        { message: "Código inválido ou expirado. Peça um novo em /liberar-acesso." },
        { status: 401 }
      );
    }
    const usersId = resgate.usersId;

    // Proteção contra corrida: alguém pode ter ativado nos minutos entre
    // gerar o código e digitar no app.
    const [bindingUser, bindingDevice] = await Promise.all([
      fetchActiveBindingByUser(usersId),
      fetchActiveBindingByDevice(deviceId.trim()),
    ]);
    if (bindingUser) {
      return NextResponse.json(
        { message: "Este usuário já tem um aparelho vinculado." },
        { status: 409 }
      );
    }
    if (bindingDevice && bindingDevice.users_id !== usersId) {
      return NextResponse.json(
        { message: "Este aparelho já está vinculado a outro usuário." },
        { status: 409 }
      );
    }

    // Busca os dados de novo (não confia no que veio do cliente) — a fonte
    // da verdade dos campos gravados é o GLPI, pelo usersId já validado.
    const rows = await query<GlpiUserIdentity>(
      `
        SELECT u.id, u.name, u.firstname, u.realname, u.registration_number, ue.email
          FROM glpi_users u
          LEFT JOIN glpi_useremails ue ON ue.users_id = u.id AND ue.is_default = 1
         WHERE u.id = ? AND u.is_deleted = 0 AND u.is_active = 1
         LIMIT 1
      `,
      [usersId]
    );
    const user = rows[0];
    if (!user) {
      return NextResponse.json({ message: "Usuário não encontrado" }, { status: 404 });
    }

    await createBinding({
      usersId: user.id,
      deviceId: deviceId.trim(),
      deviceModel: deviceModel ?? null,
      nomeConfirmado: `${user.firstname ?? ""} ${user.realname ?? ""}`.trim() || user.name,
      emailConfirmado: user.email ?? "",
      matriculaConfirmada: user.registration_number,
    });

    void auditInsert({
      ator: { id: user.id, nome: user.name, role: "tecnico" },
      acao: "dados-editados",
      alvo: { tipo: "tecnico", id: String(user.id), label: user.name },
      descricao: "Aparelho vinculado via /liberar-acesso (termo de responsabilidade aceito).",
    });

    const result = await buildSessionForUser(user.id);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 403 });
    }
    resetLoginRateLimit(rateLimitKey);
    return NextResponse.json(result.session);
  } catch (error) {
    console.error("[api/liberar-acesso/confirmar] POST error", error);
    void logError("app", "liberar-acesso/confirmar", error);
    return NextResponse.json(
      { message: "Erro interno ao confirmar ativação" },
      { status: 500 }
    );
  }
}
