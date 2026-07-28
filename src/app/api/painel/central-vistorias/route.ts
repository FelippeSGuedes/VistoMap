import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { listCentralVistorias } from "@/lib/glpi/painel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePainelRole(request, "moderador");
  if (!auth.ok) return auth.response;
  try {
    const vistorias = await listCentralVistorias();
    return NextResponse.json({ vistorias });
  } catch (err) {
    return NextResponse.json({ message: "Erro ao listar vistorias", error: String(err) }, { status: 500 });
  }
}
