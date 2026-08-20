import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { setCategoriaPref } from "@/lib/glpi/pushPrefs";
import { NOTIF_CATEGORIAS, CATEGORIA_META, type NotifCategoria } from "@/lib/notifCategorias";
import { auditInsert } from "@/lib/glpi/audit";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PUT /api/painel/usuarios/[id]/notificar  (admin)
 * Body: { categoria: NotifCategoria; ativo: boolean }
 * Liga/desliga UMA categoria de notificação pra um analista. Só o admin decide.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(req, "admin");
  if (!auth.ok) return auth.response;

  const userId = Number(params.id);
  if (!userId || !Number.isFinite(userId)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let body: { categoria?: string; ativo?: boolean };
  try {
    body = (await req.json()) as { categoria?: string; ativo?: boolean };
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }
  const categoria = body.categoria as NotifCategoria;
  if (!NOTIF_CATEGORIAS.includes(categoria)) {
    return NextResponse.json({ message: "categoria inválida" }, { status: 400 });
  }
  const enabled = !!body.ativo;

  await setCategoriaPref(userId, categoria, enabled);

  // Auditoria — quem ligou/desligou o quê pra quem.
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
    descricao: `Notificações de "${CATEGORIA_META[categoria].label}" ${enabled ? "ativadas" : "desativadas"} para ${alvoNome}.`,
  });

  return NextResponse.json({ ok: true, userId, categoria, ativo: enabled });
}
