import { NextRequest, NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface TecnicoLocation {
  users_id: number;
  nome: string;
  email: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  battery_level: number | null;
  created_at: string;
  /** Minutos desde o último ping. */
  minutos_atras: number;
}

export async function GET(req: NextRequest) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    // Última localização por usuário nas últimas 3 horas.
    const rows = await query<{
      users_id: number;
      firstname: string | null;
      realname: string | null;
      name: string;
      email: string | null;
      latitude: string;
      longitude: string;
      accuracy_meters: number | null;
      battery_level: number | null;
      created_at: string;
    }>(`
      SELECT
        loc.users_id,
        u.firstname,
        u.realname,
        u.name,
        (SELECT email FROM glpi_useremails WHERE users_id = u.id ORDER BY is_default DESC, id ASC LIMIT 1) AS email,
        loc.latitude,
        loc.longitude,
        loc.accuracy_meters,
        loc.battery_level,
        loc.created_at
      FROM glpi_plugin_vistomap_locations loc
      INNER JOIN glpi_users u ON u.id = loc.users_id
      WHERE loc.created_at >= NOW() - INTERVAL 3 HOUR
        AND loc.id = (
          SELECT MAX(l2.id)
          FROM glpi_plugin_vistomap_locations l2
          WHERE l2.users_id = loc.users_id
        )
      ORDER BY loc.created_at DESC
    `);

    const now = Date.now();
    const result: TecnicoLocation[] = rows.map((r) => {
      const nome =
        `${r.firstname ?? ""} ${r.realname ?? ""}`.trim() || r.name;
      const minutos_atras = Math.round(
        (now - new Date(r.created_at).getTime()) / 60000
      );
      return {
        users_id: r.users_id,
        nome,
        email: r.email,
        latitude: parseFloat(r.latitude as unknown as string),
        longitude: parseFloat(r.longitude as unknown as string),
        accuracy_meters: r.accuracy_meters,
        battery_level: r.battery_level,
        created_at: r.created_at,
        minutos_atras,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/painel/locations] GET error", err);
    // Tabela ainda não criada — retorna lista vazia em vez de 500.
    if (String(err).includes("doesn't exist") || String(err).includes("Table")) {
      return NextResponse.json([]);
    }
    return NextResponse.json(
      { message: "Erro ao carregar localizações", error: String(err) },
      { status: 500 }
    );
  }
}
