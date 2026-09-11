import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { auditInsert } from "@/lib/glpi/audit";
import { query } from "@/lib/db";
import { corIdentidadeValida, setCorIdentidade } from "@/lib/glpi/tecnicoIdentidade";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/painel/usuarios/[id]/cor  (admin) — body { cor: "#RRGGBB" }
 *
 * Troca manual da cor de identidade de um técnico/instalador (a automática
 * já vem de getCoresIdentidade). Só aceita cores da paleta curada: a
 * paleta é neutra de propósito pra não competir com as cores de status.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(req, "admin");
  if (!auth.ok) return auth.response;

  const usersId = Number(params.id);
  if (!Number.isFinite(usersId) || usersId <= 0) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let body: { cor?: string } = {};
  try {
    body = (await req.json()) as { cor?: string };
  } catch {
    /* validado abaixo */
  }
  const cor = String(body.cor ?? "").trim().toUpperCase();
  if (!corIdentidadeValida(cor)) {
    return NextResponse.json({ message: "Cor fora da paleta de identidade" }, { status: 400 });
  }

  const [u] = await query<{ id: number; firstname: string | null; realname: string | null; name: string }>(
    `SELECT id, firstname, realname, name FROM glpi_users WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [usersId]
  );
  if (!u) return NextResponse.json({ message: "Usuário não encontrado" }, { status: 404 });

  await setCorIdentidade(usersId, cor);

  const nome = `${u.firstname ?? ""} ${u.realname ?? ""}`.trim() || u.name;
  void auditInsert({
    ator: { id: Number(auth.claims.sub) || 0, nome: auth.claims.email ?? "Administrador", role: "admin" },
    acao: "dados-editados",
    alvo: { tipo: "tecnico", id: String(usersId), label: nome },
    descricao: `Cor de identidade no mapa alterada para ${cor}.`,
  });

  return NextResponse.json({ ok: true, cor });
}
