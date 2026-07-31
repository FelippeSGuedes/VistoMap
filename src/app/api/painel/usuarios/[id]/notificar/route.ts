import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { setNotificar } from "@/lib/glpi/pushPrefs";
import { auditInsert } from "@/lib/glpi/audit";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PUT /api/painel/usuarios/[id]/notificar  (admin)
 * Body: { notificar: boolean }
 * Liga/desliga o web push para um analista. Só o admin decide.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(req, "admin");
  if (!auth.ok) return auth.response;

  const userId = Number(params.id);
  if (!userId || !Number.isFinite(userId)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let body: { notificar?: boolean };
  try {
    body = (await req.json()) as { notificar?: boolean };
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }
  const enabled = !!body.notificar;

  await setNotificar(userId, enabled);

  // Auditoria — quem ligou/desligou pra quem.
  const [alvo] = await query<{ name: string; firstname: string | null; realname: string | null }>(
    `SELECT name, firstname, realname FROM glpi_users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const alvoNome = alvo
    ? `${alvo.firstname ?? ""} ${alvo.realname ?? ""}`.trim() || alvo.name
    : `Usuário #${userId}`;
  void auditInsert({
    ator: { id: Number(auth.claims.sub) || 0, nome: auth.claims.email ?? "Administrador", role: "admin" },
    acao: "dados-editados",
    alvo: { tipo: "sistema", id: `notificar-${userId}`, label: alvoNome },
    descricao: `Notificações do painel ${enabled ? "ativadas" : "desativadas"} para ${alvoNome}.`,
  });

  return NextResponse.json({ ok: true, userId, notificar: enabled });
}
