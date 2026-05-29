import { NextRequest, NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/painel/push/send  (admin only)
 *
 * Envia push via FCM HTTP v1 para o(s) usuario(s) alvo.
 * Body: { users_id: number | number[], title: string, body: string, data?: Record<string,string> }
 *
 * Pre-requisitos (setup user):
 *  1. Projeto Firebase criado
 *  2. Service Account JSON em /etc/vistomap/firebase-service-account.json
 *     OU env FIREBASE_SERVICE_ACCOUNT_JSON com conteudo inline
 *  3. Env FIREBASE_PROJECT_ID setado
 *  4. npm install firebase-admin (no painel container)
 *  5. Tabela glpi_plugin_vistomap_push_tokens criada (mobile/migrations/001_push_tokens.sql)
 */

interface PushTokenRow {
  token: string;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const tokenAuth = auth.replace(/^Bearer\s+/i, "").trim();
  if (!tokenAuth) {
    return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  }

  try {
    const claims = await verifySessionJwt(tokenAuth);
    if (claims.role !== "admin") {
      return NextResponse.json({ message: "Acesso restrito" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }

  let body: {
    users_id?: number | number[];
    title?: string;
    body?: string;
    data?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Body invalido" }, { status: 400 });
  }

  const ids = Array.isArray(body.users_id)
    ? body.users_id
    : body.users_id != null
    ? [body.users_id]
    : [];
  if (ids.length === 0 || !body.title || !body.body) {
    return NextResponse.json(
      { message: "users_id, title, body sao obrigatorios" },
      { status: 400 }
    );
  }

  // Lazy import firebase-admin (so build does not fail if package ausente).
  let admin: typeof import("firebase-admin");
  try {
    admin = await import("firebase-admin");
  } catch {
    return NextResponse.json(
      {
        message:
          "firebase-admin nao instalado. Rode 'npm install firebase-admin' no painel container.",
      },
      { status: 503 }
    );
  }

  if (admin.apps.length === 0) {
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const filePath =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
      "/etc/vistomap/firebase-service-account.json";
    let serviceAccount: object;
    if (inline) {
      try {
        serviceAccount = JSON.parse(inline);
      } catch {
        return NextResponse.json(
          { message: "FIREBASE_SERVICE_ACCOUNT_JSON nao e JSON valido" },
          { status: 500 }
        );
      }
    } else {
      try {
        const fs = await import("node:fs/promises");
        const raw = await fs.readFile(filePath, "utf-8");
        serviceAccount = JSON.parse(raw);
      } catch (err) {
        return NextResponse.json(
          {
            message: `Service account nao encontrado em ${filePath}`,
            error: String(err),
          },
          { status: 500 }
        );
      }
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as never),
    });
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = await query<PushTokenRow>(
    `SELECT token FROM glpi_plugin_vistomap_push_tokens WHERE users_id IN (${placeholders})`,
    ids
  );
  if (rows.length === 0) {
    return NextResponse.json(
      { ok: true, sent: 0, message: "Nenhum dispositivo registrado" },
      { status: 200 }
    );
  }

  const tokens = rows.map((r) => r.token);
  const messaging = admin.messaging();
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: body.title, body: body.body },
    data: body.data ?? {},
    android: {
      priority: "high",
      notification: { sound: "default", channelId: "vistomap-default" },
    },
  });

  return NextResponse.json({
    ok: true,
    sent: response.successCount,
    failed: response.failureCount,
  });
}
