import { NextResponse } from "next/server";
import { aprovarVistoria } from "@/lib/glpi/painel";
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
 * Aprovar vistoria (admin):
 *  - statusvistoria → Aprovado
 *  - situaodavistoria → Vistoriado (ou Revisitado se era revisita)
 *  - dataaprovaoconcessionriafield = agora
 *  - aux.approval_status = APROVADO; aux.is_repeat = 0
 *
 * Sai da fila de revisitas + da fila principal.
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
    const [actor, neRow] = await Promise.all([
      getActorFromRequest(req),
      query<{ name: string }>(
        `SELECT name FROM glpi_networkequipments WHERE id = ? LIMIT 1`,
        [id]
      ).then((r) => r[0]),
    ]);

    const result = await aprovarVistoria(id);

    void auditInsert({
      ator: actor ?? { id: 0, nome: "Sistema", role: "admin" },
      acao: "vistoria-aprovada",
      alvo: {
        tipo: "vistoria",
        id: String(id),
        label: neRow?.name ?? `NE-${id}`,
      },
      descricao: result.eraRevisita
        ? "Revisita aprovada · situação → Revisitado"
        : "Vistoria aprovada · situação → Vistoriado",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/painel/vistoria/aprovar] error", err);
    return NextResponse.json(
      { message: "Falha ao aprovar vistoria", error: String(err) },
      { status: 500 }
    );
  }
}
