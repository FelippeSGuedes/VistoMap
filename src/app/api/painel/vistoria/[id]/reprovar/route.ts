import { NextResponse } from "next/server";
import { reprovarVistoria } from "@/lib/glpi/painel";
import { auditInsert } from "@/lib/glpi/audit";
import { getActorFromRequest } from "@/lib/auth-request";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-|^rev-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Reprovar vistoria (admin):
 *  - statusvistoria → Reprovado
 *  - situaodavistoria → Aguardando Revisita
 *  - aux.approval_status = REPROVADO; is_repeat = 1
 *  - aux.project_status = PENDENTE (worker regera PDF)
 *
 * Aparece na Central de Revisitas.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { motivo?: string };

    const [actor, neRow] = await Promise.all([
      getActorFromRequest(req),
      query<{ name: string }>(
        `SELECT name FROM glpi_networkequipments WHERE id = ? LIMIT 1`,
        [id]
      ).then((r) => r[0]),
    ]);

    const result = await reprovarVistoria(id, body.motivo);

    void auditInsert({
      ator: actor ?? { id: 0, nome: "Sistema", role: "admin" },
      acao: "vistoria-reprovada",
      alvo: {
        tipo: "vistoria",
        id: String(id),
        label: neRow?.name ?? `NE-${id}`,
      },
      descricao: body.motivo
        ? `Reprovada · ${body.motivo}`
        : "Reprovada · enviada para Central de Revisitas",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/painel/vistoria/reprovar] error", err);
    return NextResponse.json(
      { message: "Falha ao reprovar vistoria", error: String(err) },
      { status: 500 }
    );
  }
}
