import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/expediente/pausa — DESATIVADA.
 *
 * O expediente agora é contínuo (07:30–18:00 sem pausa de almoço, por
 * decisão operacional — rastreio não para no horário de almoço). Mantida
 * como no-op só para bundles antigos do app não quebrarem (404) durante a
 * transição do OTA; sempre responde emPausa:false e não altera nada.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  try {
    await verifySessionJwt(token);
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, emPausa: false });
}
