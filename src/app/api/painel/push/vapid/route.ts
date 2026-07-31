import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/push/vapid — chave pública VAPID para o navegador se inscrever.
 * A pública não é segredo (vai pro cliente de propósito). A privada fica só no
 * servidor (VAPID_PRIVATE_KEY) e nunca é exposta.
 */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  if (!publicKey) {
    return NextResponse.json(
      { message: "Web push não configurado no servidor (VAPID_PUBLIC_KEY ausente)." },
      { status: 503 }
    );
  }
  return NextResponse.json({ publicKey });
}
