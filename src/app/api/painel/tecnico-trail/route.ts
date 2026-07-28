import { NextRequest, NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface LocationRow {
  longitude: number | string;
  latitude: number | string;
}

/**
 * GET /api/painel/tecnico-trail?users_id=X&hours=8  (admin)
 * GET /api/painel/tecnico-trail?users_id=X&desde=2026-07-01&ate=2026-07-20  (admin)
 *
 * Returns the GPS trail of a technician. Default: last N hours (legacy,
 * used by the live map). If `desde`/`ate` are given, uses that range
 * instead (used by the técnico detail page's heatmap/histórico filters) —
 * capped at 90 days to avoid an unbounded scan on the locations table.
 * Response: { coords: [[lng, lat], ...] } ordered oldest→newest.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const usersId = req.nextUrl.searchParams.get("users_id");
  if (!usersId) {
    return NextResponse.json({ message: "users_id obrigatorio" }, { status: 400 });
  }

  const desde = req.nextUrl.searchParams.get("desde");
  const ate = req.nextUrl.searchParams.get("ate");

  let rows: LocationRow[];
  if (desde || ate) {
    const where: string[] = ["users_id = ?"];
    const params: unknown[] = [usersId];
    where.push("created_at >= ?");
    params.push(desde || "1970-01-01");
    where.push("created_at <= ?");
    params.push(ate || "2999-12-31");
    // Trava de 90 dias — mesmo se desde vier absurdamente antigo.
    where.push("created_at >= NOW() - INTERVAL 90 DAY");
    rows = await query<LocationRow>(
      `SELECT longitude, latitude
         FROM glpi_plugin_vistomap_locations
        WHERE ${where.join(" AND ")}
        ORDER BY created_at ASC
        LIMIT 20000`,
      params
    );
  } else {
    const hours = Math.min(Math.max(Number(req.nextUrl.searchParams.get("hours") ?? 8), 1), 48);
    rows = await query<LocationRow>(
      `SELECT longitude, latitude
         FROM glpi_plugin_vistomap_locations
        WHERE users_id = ?
          AND created_at >= NOW() - INTERVAL ? HOUR
        ORDER BY created_at ASC`,
      [usersId, hours]
    );
  }

  const coords = rows.map((r) => [Number(r.longitude), Number(r.latitude)] as [number, number]);

  return NextResponse.json({ users_id: usersId, coords });
}
