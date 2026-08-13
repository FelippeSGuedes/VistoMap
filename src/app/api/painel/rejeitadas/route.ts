import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { listRecusas } from "@/lib/glpi/recusas";
import { sanitizeFolderName } from "@/lib/sanitize";
import { query } from "@/lib/db";
import { signUploadUrl } from "@/lib/uploadUrl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CoordRow {
  items_id: number;
  lat: string | null;
  lng: string | null;
}

/**
 * GET /api/painel/rejeitadas  (admin)
 *
 * Vistorias com recusa APROVADA — fora de circulação, sem técnico
 * atribuído. Tela de consulta/histórico + ação de reatribuir e reabrir
 * (POST /api/painel/rejeitadas/[id]/reabrir) se o admin decidir reabrir —
 * inclui lat/long pra esse modal poder corrigir coordenada errada ali
 * mesmo, sem precisar ir no GLPI.
 */
export async function GET(request: Request) {
  const auth = await requirePainelRole(request, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const rejeitadas = await listRecusas({ status: "APROVADO", limit: 300 });

    const ids = rejeitadas.map((r) => r.vistoriaId);
    const coordsById = new Map<number, { latitude: number | null; longitude: number | null }>();
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      const coordRows = await query<CoordRow>(
        `SELECT items_id,
                REPLACE(latitudefield, ',', '.') + 0.0 AS lat,
                REPLACE(longitudefield, ',', '.') + 0.0 AS lng
           FROM glpi_plugin_fields_networkequipmentdispositivosderedes
          WHERE items_id IN (${placeholders})`,
        ids
      );
      for (const c of coordRows) {
        coordsById.set(c.items_id, {
          latitude: c.lat != null ? Number(c.lat) : null,
          longitude: c.lng != null ? Number(c.lng) : null,
        });
      }
    }

    const comExtras = rejeitadas.map((r) => ({
      ...r,
      fotoUrl: r.fotoPath
        ? signUploadUrl(sanitizeFolderName(r.equipamento), r.fotoPath)
        : null,
      latitude: coordsById.get(r.vistoriaId)?.latitude ?? null,
      longitude: coordsById.get(r.vistoriaId)?.longitude ?? null,
    }));
    return NextResponse.json({ rejeitadas: comExtras });
  } catch (err) {
    return NextResponse.json({ message: "Erro ao listar rejeitadas", error: String(err) }, { status: 500 });
  }
}
