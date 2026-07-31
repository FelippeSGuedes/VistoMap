import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { getNotificarFlags } from "@/lib/glpi/pushPrefs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/push/status — o painel usa pra saber se o usuário logado
 * deve se inscrever no web push (admin ligou o flag dele) e se o servidor
 * está configurado (VAPID presente).
 */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const userId = Number(auth.claims.sub) || 0;
  const configured = !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
  let enabled = false;
  if (userId && configured) {
    try {
      const flags = await getNotificarFlags([userId]);
      enabled = flags.get(userId) ?? false;
    } catch {
      enabled = false;
    }
  }
  return NextResponse.json({ enabled, configured });
}
