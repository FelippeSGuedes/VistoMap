import { NextResponse } from "next/server";
import { getVistoria } from "@/lib/glpi/equipments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
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
    return NextResponse.json(vistoria);
  } catch (error) {
    console.error("[api/vistorias/:id] GET error", error);
    return NextResponse.json(
      { message: "Falha ao carregar vistoria", error: String(error) },
      { status: 500 }
    );
  }
}
