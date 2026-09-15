import { NextResponse } from "next/server";
import { resolverPendenciaNansen } from "@/lib/glpi/painel";
import { auditInsert } from "@/lib/glpi/audit";
import { getActorFromRequest } from "@/lib/auth-request";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const n = Number(raw.replace(/^NE-/, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * POST /api/painel/vistoria/[id]/resolver-pendencia (moderador+)
 *
 * Finaliza a tratativa de "Pendência Nansen" (ver /painel/cpfl): marca
 * pendência = Sem Pendências, grava a data de resolução e agenda a
 * regeneração do projeto (PDF) com os dados já corrigidos.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requirePainelRole(req, "moderador");
  if (!auth.ok) return auth.response;

  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  try {
    const [actor, neRow] = await Promise.all([
      getActorFromRequest(req),
      query<{ name: string }>(
        `SELECT name FROM glpi_networkequipments WHERE id = ? LIMIT 1`,
        [id]
      ).then((r) => r[0]),
    ]);

    const result = await resolverPendenciaNansen(id);

    void auditInsert({
      ator: actor ?? { id: 0, nome: "Sistema", role: "admin" },
      acao: "pendencia-nansen-resolvida",
      alvo: {
        tipo: "vistoria",
        id: String(id),
        label: neRow?.name ?? `NE-${id}`,
      },
      descricao: "Pendência Nansen resolvida · projeto marcado para regeração",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/painel/vistoria/resolver-pendencia] error", err);
    return NextResponse.json({ message: msg }, { status: 422 });
  }
}
