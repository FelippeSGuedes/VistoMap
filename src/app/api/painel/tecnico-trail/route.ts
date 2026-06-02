import { NextRequest, NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface LocationRow {
  longitude: number | string;
  latitude: number | string;
}

/**
 * GET /api/painel/tecnico-trail?users_id=X&hours=8  (admin)
 *
 * Returns the GPS trail of a technician for the last N hours.
 * Response: { coords: [[lng, lat], ...] } ordered oldest→newest.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  try {
    const claims = await verifySessionJwt(token);
    if (claims.role !== "admin") {
      return NextResponse.json({ message: "Acesso restrito" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }

  const usersId = req.nextUrl.searchParams.get("users_id");
  const hours = Math.min(Math.max(Number(req.nextUrl.searchParams.get("hours") ?? 8), 1), 48);

  if (!usersId) {
    return NextResponse.json({ message: "users_id obrigatorio" }, { status: 400 });
  }

  const rows = await query<LocationRow>(
    `SELECT longitude, latitude
       FROM glpi_plugin_vistomap_locations
      WHERE users_id = ?
        AND created_at >= NOW() - INTERVAL ? HOUR
      ORDER BY created_at ASC`,
    [usersId, hours]
  );

  const coords = rows.map((r) => [Number(r.longitude), Number(r.latitude)] as [number, number]);

  return NextResponse.json({ users_id: usersId, hours, coords });
}
