import "server-only";
import { query } from "./db";

/**
 * Envio de push FCM via firebase-admin SDK.
 *
 * Lazy-importa firebase-admin pra build nao quebrar se package nao instalado.
 * Inicializa app uma unica vez.
 */

type FbAdmin = typeof import("firebase-admin");
let cached: FbAdmin | null = null;
let initOnce: Promise<FbAdmin> | null = null;

async function getAdmin(): Promise<FbAdmin | null> {
  if (cached) return cached;
  if (initOnce) return initOnce;
  initOnce = (async () => {
    let admin: FbAdmin;
    try {
      admin = await import("firebase-admin");
    } catch {
      throw new Error("firebase-admin nao instalado");
    }
    if (admin.apps.length === 0) {
      const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      const filePath =
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
        "/etc/vistomap/firebase-service-account.json";
      let serviceAccount: object;
      if (inline) {
        serviceAccount = JSON.parse(inline);
      } else {
        const fs = await import("node:fs/promises");
        const raw = await fs.readFile(filePath, "utf-8");
        serviceAccount = JSON.parse(raw);
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as never),
      });
    }
    cached = admin;
    return admin;
  })();
  try {
    return await initOnce;
  } catch (err) {
    initOnce = null;
    console.error("[push] init falhou:", err);
    return null;
  }
}

interface PushTokenRow {
  token: string;
}

export interface SendPushInput {
  usersIds: number[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface SendPushResult {
  sent: number;
  failed: number;
  skipped: boolean;
  reason?: string;
}

/**
 * Envia push pra todos os tokens registrados dos usuarios alvo.
 * Best-effort — exceptions sao engolidas e retornadas em result.
 */
export async function sendPushTo(input: SendPushInput): Promise<SendPushResult> {
  if (input.usersIds.length === 0) {
    return { sent: 0, failed: 0, skipped: true, reason: "no users" };
  }

  let rows: PushTokenRow[];
  try {
    const placeholders = input.usersIds.map(() => "?").join(",");
    rows = await query<PushTokenRow>(
      `SELECT token FROM glpi_plugin_vistomap_push_tokens WHERE users_id IN (${placeholders})`,
      input.usersIds
    );
  } catch (err) {
    console.error("[push] query tokens falhou:", err);
    return { sent: 0, failed: 0, skipped: true, reason: "db error" };
  }

  if (rows.length === 0) {
    return { sent: 0, failed: 0, skipped: true, reason: "no tokens" };
  }

  const admin = await getAdmin();
  if (!admin) {
    return { sent: 0, failed: 0, skipped: true, reason: "fcm init failed" };
  }

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: rows.map((r) => r.token),
      notification: { title: input.title, body: input.body },
      data: input.data ?? {},
      android: {
        priority: "high",
        notification: { sound: "default", channelId: "vistomap-default" },
      },
    });
    return {
      sent: response.successCount,
      failed: response.failureCount,
      skipped: false,
    };
  } catch (err) {
    console.error("[push] send falhou:", err);
    return { sent: 0, failed: 0, skipped: true, reason: "send error" };
  }
}
