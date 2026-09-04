import { NextRequest, NextResponse } from "next/server";
import { verifyActivationTicket } from "@/lib/jwt";
import { fetchActiveBindingByUser } from "@/lib/glpi/deviceBinding";
import { gerarCodigoAtivacao } from "@/lib/glpi/activationCode";
import { logError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/liberar-acesso/gerar-codigo
 *
 * Passo 2 — chamado pelo NAVEGADOR depois do termo de responsabilidade
 * aceito (scroll completo, ver ScrollGate). Gera o código de 6 dígitos
 * que a pessoa vai digitar dentro do app, depois de baixar e instalar.
 */
export async function POST(req: NextRequest) {
  try {
    const { ticket } = (await req.json()) as { ticket?: string };
    if (!ticket) {
      return NextResponse.json({ message: "Ticket ausente" }, { status: 400 });
    }

    let claims;
    try {
      claims = await verifyActivationTicket(ticket);
    } catch {
      return NextResponse.json(
        { message: "Sessão de ativação expirada. Comece de novo." },
        { status: 401 }
      );
    }

    const usersId = Number(claims.usersId);

    // Proteção contra corrida: alguém pode ter ativado nos minutos entre
    // validar e aceitar o termo.
    const bindingExistente = await fetchActiveBindingByUser(usersId);
    if (bindingExistente) {
      return NextResponse.json(
        { message: "Este usuário já tem um aparelho vinculado." },
        { status: 409 }
      );
    }

    const { codigo, expiraEm } = await gerarCodigoAtivacao(usersId);
    return NextResponse.json({ codigo, expiraEm: expiraEm.toISOString() });
  } catch (error) {
    console.error("[api/liberar-acesso/gerar-codigo] POST error", error);
    void logError("app", "liberar-acesso/gerar-codigo", error);
    return NextResponse.json(
      { message: "Erro interno ao gerar código" },
      { status: 500 }
    );
  }
}
