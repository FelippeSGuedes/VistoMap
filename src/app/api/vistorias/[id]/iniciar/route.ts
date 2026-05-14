import { NextResponse } from "next/server";
import { getVistoria } from "@/lib/glpi/equipments";
import { upsertAuxiliaryProject } from "@/lib/glpi/auxiliary";
import { AUX_STATUS_EM_CAMPO } from "@/lib/glpi/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }
  try {
    const vistoria = await getVistoria(id);
    if (!vistoria) {
      return NextResponse.json({ message: "Vistoria não encontrada" }, { status: 404 });
    }
    await upsertAuxiliaryProject({
      items_id: id,
      project_status: AUX_STATUS_EM_CAMPO,
    });
    return NextResponse.json({ ok: true, status: AUX_STATUS_EM_CAMPO });
  } catch (error) {
    console.error("[api/vistorias/:id/iniciar] error", error);
    return NextResponse.json(
      { message: "Falha ao iniciar vistoria", error: String(error) },
      { status: 500 }
    );
  }
}
