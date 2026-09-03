import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyActivationTicket } from "@/lib/jwt";
import { buildSessionForUser } from "@/lib/auth/issueSession";
import {
  createBinding,
  fetchActiveBindingByDevice,
  fetchActiveBindingByUser,
} from "@/lib/glpi/deviceBinding";
import { auditInsert } from "@/lib/glpi/audit";
import { logError } from "@/lib/observability";

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
 * Passo 2 — chamado depois do termo de responsabilidade aceito (scroll
 * completo, ver ScrollGate). Grava o vínculo e já loga o técnico
 * automaticamente (não pede a senha de novo, já provada em .../validar).
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
    const deviceId = claims.deviceId;

    // Proteção contra corrida: alguém pode ter ativado nos ~10min do ticket.
    const [bindingUser, bindingDevice] = await Promise.all([
      fetchActiveBindingByUser(usersId),
      fetchActiveBindingByDevice(deviceId),
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
      deviceId,
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
