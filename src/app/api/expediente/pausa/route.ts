import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { togglePausaAlmoco } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/expediente/pausa
 * Toggle pausa-almoco. Retorna o novo estado.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  let userId: number;
  try {
    const claims = await verifySessionJwt(token);
    userId = Number(claims.sub);
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }
  const r = await togglePausaAlmoco(userId);
  if (!r.ok) {
    return NextResponse.json(
      { message: "Nenhum expediente em aberto" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, emPausa: r.emPausa });
}
