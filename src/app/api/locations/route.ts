import { NextRequest, NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { execute } from "@/lib/db";
import { expedienteAtual } from "@/lib/expediente";

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

  // Gating LGPD: GPS so eh aceito durante expediente aberto.
  // Fora de expediente: 403 — app deve parar de pingar.
  const exp = await expedienteAtual(usersId);
  if (!exp || !exp.emAndamento) {
    return NextResponse.json(
      { message: "Sem expediente aberto — GPS desativado" },
      { status: 403 }
    );
  }

  let body: {
    latitude?: number;
    longitude?: number;
    accuracy_meters?: number | null;
    speed_kmh?: number | null;
    battery_level?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const { latitude, longitude, accuracy_meters, speed_kmh, battery_level } = body;
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
