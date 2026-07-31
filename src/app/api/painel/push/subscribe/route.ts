import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { saveSubscription } from "@/lib/glpi/pushPrefs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/**
 * POST /api/painel/push/subscribe — o navegador do analista registra sua
 * inscrição de web push. Chamado pelo painel quando o usuário está habilitado
 * (flag notificar ligado pelo admin) e concede a permissão do navegador.
 */
export async function POST(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const userId = Number(auth.claims.sub) || 0;
  if (!userId) {
    return NextResponse.json({ message: "Usuário inválido" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh?.trim();
  const authKey = body.keys?.auth?.trim();
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ message: "Inscrição incompleta" }, { status: 400 });
  }

  await saveSubscription({
    userId,
    endpoint,
    p256dh,
    auth: authKey,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
