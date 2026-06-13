import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { execute } from "@/lib/db";
import { TABLE_FIELDS, SITUACAO_COLUMN } from "@/lib/glpi/constants";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const n = Number(raw.replace(/^NE-/, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }

  let actorId: number;
  let actorNome: string;
  try {
    const claims = await verifySessionJwt(token);
    actorId = Number(claims.sub);
    actorNome = claims.email ?? "Tecnico";
    if (!(actorId > 0)) throw new Error("sub inválido");
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  const body = (await request.json()) as { situacao_id: number };
  const { situacao_id } = body;
  if (!Number.isInteger(situacao_id) || situacao_id < 1) {
    return NextResponse.json({ message: "situacao_id inválido" }, { status: 400 });
  }

  try {
    await execute(
      `UPDATE \`${TABLE_FIELDS}\` SET \`${SITUACAO_COLUMN}\` = ? WHERE items_id = ?`,
      [situacao_id, id]
    );

    const ACOES: Record<number, string> = {
      2: "vistoria-em-vistoria",
      7: "vistoria-em-deslocamento",
    };
    const acao = ACOES[situacao_id];
    if (acao) {
      void auditInsert({
        ator: { id: actorId, nome: actorNome, role: "tecnico" },
        acao: acao as Parameters<typeof auditInsert>[0]["acao"],
        alvo: { tipo: "vistoria", id: String(id), label: `NE-${id}` },
        descricao: situacao_id === 7 ? "Técnico em deslocamento até o local" : "Vistoria iniciada em campo",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/vistorias/:id/situacao] error", error);
    return NextResponse.json({ message: "Falha ao atualizar situação" }, { status: 500 });
  }
}
