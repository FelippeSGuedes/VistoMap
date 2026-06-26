import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { query, execute } from "@/lib/db";
import { ensureOverrideTable } from "@/lib/ensureOverrideTable";
import { TABLE_FIELDS, SITUACAO_COLUMN, SITUACAO_EM_VISTORIA } from "@/lib/glpi/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface OverrideRow {
  id: number;
  vistoria_id: number;
  status: "PENDENTE" | "APROVADO" | "REPROVADO";
  motivo_reprovacao: string | null;
}

/** Mobile polling: GET /api/vistorias/[id]/override-request?requestId=N */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  try {
    await verifySessionJwt(token);
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestId = Number(url.searchParams.get("requestId"));
  if (!requestId || !Number.isFinite(requestId)) {
    return NextResponse.json({ message: "requestId inválido" }, { status: 400 });
  }

  await ensureOverrideTable();

  const rows = await query<OverrideRow>(
    "SELECT id, vistoria_id, status, motivo_reprovacao FROM `glpi_plugin_vistomap_override_requests` WHERE id = ? LIMIT 1",
    [requestId]
  );

  if (!rows.length) return NextResponse.json({ message: "Solicitação não encontrada" }, { status: 404 });

  const req = rows[0];

  // Se foi aprovado, concretiza a situação no banco (Em Vistoria)
  if (req.status === "APROVADO") {
    const vistoriaId = Number(params.id.replace(/^NE-/, ""));
    if (vistoriaId > 0) {
      await execute(
        `UPDATE \`${TABLE_FIELDS}\` SET \`${SITUACAO_COLUMN}\` = ? WHERE items_id = ?`,
        [SITUACAO_EM_VISTORIA, vistoriaId]
      );
    }
  }

  return NextResponse.json({
    status: req.status,
    motivo: req.motivo_reprovacao ?? undefined,
  });
}
