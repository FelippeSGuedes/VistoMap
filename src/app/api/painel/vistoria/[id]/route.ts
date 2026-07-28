import { NextResponse } from "next/server";
import { atualizarCamposVistoria, type AtualizarCamposInput } from "@/lib/glpi/painel";
import { auditInsert } from "@/lib/glpi/audit";
import { getActorFromRequest } from "@/lib/auth-request";
import { requirePainelRole } from "@/lib/painel-auth";
import { getVistoria } from "@/lib/glpi/equipments";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface EditPayload {
  campos: AtualizarCamposInput;
  /** Marca project_status='PENDENTE' (worker regera PDF). */
  regenerar_pdf?: boolean;
}

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Admin: GET /api/painel/vistoria/[id] — todos os campos do equipamento (view "ver detalhes"). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const id = parseId(params.id);
  if (id == null) return NextResponse.json({ message: "ID inválido" }, { status: 400 });

  try {
    const vistoria = await getVistoria(id);
    if (!vistoria) return NextResponse.json({ message: "Equipamento não encontrado" }, { status: 404 });
    return NextResponse.json({ vistoria });
  } catch (err) {
    return NextResponse.json({ message: "Falha ao buscar equipamento", error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
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
    const body = (await req.json()) as EditPayload;

    const [actor, neRow] = await Promise.all([
      getActorFromRequest(req),
      query<{ name: string }>(
        `SELECT name FROM glpi_networkequipments WHERE id = ? LIMIT 1`,
        [id]
      ).then((r) => r[0]),
    ]);

    const { affected, before } = await atualizarCamposVistoria(
      id,
      body.campos ?? {},
      !!body.regenerar_pdf
    );

    // Build diff só com campos que mudaram.
    const diff: Array<{ campo: string; antes?: string; depois?: string }> = [];
    for (const [k, depois] of Object.entries(body.campos ?? {})) {
      if (depois == null) continue;
      const antes = (before as Record<string, string | undefined>)[k];
      if ((antes ?? "") !== String(depois)) {
        diff.push({ campo: k, antes: antes ?? undefined, depois: String(depois) });
      }
    }

    if (diff.length > 0) {
      void auditInsert({
        ator: actor ?? { id: 0, nome: "Sistema", role: "admin" },
        acao: "dados-editados",
        alvo: {
          tipo: "vistoria",
          id: String(id),
          label: neRow?.name ?? `NE-${id}`,
        },
        descricao: body.regenerar_pdf
          ? `${diff.length} campo(s) alterado(s) · PDF marcado para regeneração`
          : `${diff.length} campo(s) alterado(s)`,
        diff,
      });
    }

    return NextResponse.json({ ok: true, affected, diff });
  } catch (err) {
    console.error("[api/painel/vistoria PATCH] error", err);
    return NextResponse.json(
      { message: "Falha ao atualizar vistoria", error: String(err) },
      { status: 500 }
    );
  }
}
