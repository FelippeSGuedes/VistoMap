import { NextResponse } from "next/server";
import { fetchCamposEditaveis } from "@/lib/glpi/painel";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-|^rev-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Admin: GET /api/painel/vistoria/[id]/campos-editaveis — valores atuais de tudo que o EditarVistoriaModal edita. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const id = parseId(params.id);
  if (id == null) return NextResponse.json({ message: "ID inválido" }, { status: 400 });

  try {
    const campos = await fetchCamposEditaveis(id);
    return NextResponse.json({ campos });
  } catch (err) {
    console.error("[api/painel/vistoria/campos-editaveis] error", err);
    return NextResponse.json(
      { message: "Falha ao buscar campos", error: String(err) },
      { status: 500 }
    );
  }
}
