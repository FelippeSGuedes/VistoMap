import { NextResponse } from "next/server";
import { fetchAudit } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") ?? 100);
    const offset = Number(searchParams.get("offset") ?? 0);
    const acao = searchParams.get("acao") ?? undefined;
    const alvo_id = searchParams.get("alvo_id") ?? undefined;
    const ator_idParam = searchParams.get("ator_id");
    const ator_id = ator_idParam ? Number(ator_idParam) : undefined;
    const entries = await fetchAudit({
      acao,
      alvo_id,
      ator_id,
      limit: Number.isFinite(limit) ? limit : 100,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    return NextResponse.json(entries);
  } catch (err) {
    console.error("[api/painel/audit] error", err);
    return NextResponse.json(
      { message: "Falha ao listar auditoria", error: String(err) },
      { status: 500 }
    );
  }
}
