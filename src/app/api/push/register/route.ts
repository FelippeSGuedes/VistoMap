import { NextRequest, NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { execute, query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/push/register
 *
 * Registra (upsert) FCM token do dispositivo do tecnico autenticado.
 * Body: { token: string, platform: "android" | "ios" }
 *
 * Token salvo em glpi_plugin_vistomap_push_tokens (schema em mobile/migrations).
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const tokenAuth = auth.replace(/^Bearer\s+/i, "").trim();
  if (!tokenAuth) {
    return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  }

  let userId: number;
  try {
    const claims = await verifySessionJwt(tokenAuth);
    userId = Number(claims.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ message: "Token invalido" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }

  let body: { token?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Body invalido" }, { status: 400 });
  }

  const fcmToken = (body.token ?? "").trim();
  const platform = (body.platform ?? "android").toLowerCase();
  if (!fcmToken || fcmToken.length < 10) {
    return NextResponse.json({ message: "Token FCM ausente" }, { status: 400 });
  }
  if (!["android", "ios"].includes(platform)) {
    return NextResponse.json({ message: "Platform invalida" }, { status: 400 });
  }

  try {
    // Upsert por (users_id, token) — mesmo dispositivo pode reregistrar.
    const existing = await query<{ id: number }>(
      "SELECT id FROM glpi_plugin_vistomap_push_tokens WHERE users_id = ? AND token = ? LIMIT 1",
      [userId, fcmToken]
    );
    if (existing.length > 0) {
      await execute(
        "UPDATE glpi_plugin_vistomap_push_tokens SET updated_at = NOW(), platform = ? WHERE id = ?",
        [platform, existing[0].id]
      );
    } else {
      await execute(
        "INSERT INTO glpi_plugin_vistomap_push_tokens (users_id, token, platform, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
        [userId, fcmToken, platform]
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/push/register] erro:", err);
    return NextResponse.json(
      { message: "Erro ao salvar token", error: String(err) },
      { status: 500 }
    );
  }
}
