import { NextRequest, NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { execute } from "@/lib/db";
import { ensureExpedienteAuto } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }

  let claims;
  try {
    claims = await verifySessionJwt(token);
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  const usersId = Number(claims.sub);
  if (!usersId || isNaN(usersId)) {
    return NextResponse.json({ message: "Token sem ID de usuário" }, { status: 401 });
  }

  let body: {
    latitude?: number;
    longitude?: number;
    accuracy_meters?: number | null;
    speed_kmh?: number | null;
    battery_level?: number | null;
    // Formato CRU do plugin @capgo/background-geolocation, usado quando o
    // POST vem direto do código nativo (StartOptions.url em
    // useLocationReporter.ts) em vez do caminho JS de sempre — o nativo não
    // sabe montar o payload enriquecido (não lê bateria, manda velocidade em
    // m/s). Sem isso esses pings cairiam no "obrigatórios ausentes" e o
    // ganho de robustez contra processo morto em segundo plano não valeria
    // nada.
    accuracy?: number | null;
    speed?: number | null; // m/s, não km/h
    source?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const { latitude, longitude } = body;
  const accuracy_meters =
    body.accuracy_meters ?? (body.accuracy != null ? body.accuracy : null);
  const speed_kmh =
    body.speed_kmh ?? (body.speed != null ? Math.round(body.speed * 3.6) : null);
  const battery_level = body.battery_level ?? null;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json(
      { message: "latitude e longitude são obrigatórios (number)" },
      { status: 400 }
    );
  }
  // Validação básica de range
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ message: "Coordenadas fora de range" }, { status: 400 });
  }

  // Expediente automático: abre sozinho se estiver na janela (07:30–18:00
  // configurável, dias úteis) e o técnico já tiver consentido LGPD (1x).
  // Fora da janela / sem consentimento → ping recusado (403, app ignora).
  const gate = await ensureExpedienteAuto(usersId);
  if (!gate.permitido) {
    const msg =
      gate.motivo === "lgpd-pendente"
        ? "Consentimento LGPD pendente — abra o app e aceite o termo"
        : "Fora da janela de rastreamento";
    return NextResponse.json({ message: msg, motivo: gate.motivo }, { status: 403 });
  }

  try {
    await execute(
      `INSERT INTO \`glpi_plugin_vistomap_locations\`
         (users_id, latitude, longitude, accuracy_meters, speed_kmh, battery_level)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        usersId,
        latitude,
        longitude,
        accuracy_meters ?? null,
        speed_kmh ?? null,
        battery_level != null ? Math.min(100, Math.max(0, Math.round(battery_level))) : null,
      ]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/locations] POST error", err);
    return NextResponse.json({ message: "Erro ao salvar localização" }, { status: 500 });
  }
}
