import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { query } from "@/lib/db";
import { expedienteAtual } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface UserRow {
  id: number;
  name: string;
  firstname: string | null;
  realname: string | null;
  registration_number: string | null;
  comment: string | null;
  email: string | null;
}

interface KpiRow {
  vistoriasConcluidas: number;
  revisitas: number;
  aprovadas: number;
  diasAtivos: number;
}

interface MunicRow {
  municipio: string;
  c: number;
}

/**
 * GET /api/perfil
 * Retorna dados REAIS do usuario logado pra tela /perfil do app tecnico:
 * - nome (firstname + realname GLPI)
 * - email
 * - grupos GLPI
 * - municipio operacional (mais frequente nas vistorias finalizadas, 30d)
 * - status operacional (em-expediente / pausa / fora-expediente)
 * - KPIs 30 dias: vistoriasConcluidas, revisitas, aprovadas, distanciaKm, diasAtivos
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  }
  let userId: number;
  try {
    const claims = await verifySessionJwt(token);
    userId = Number(claims.sub);
    if (!userId) {
      return NextResponse.json({ message: "Token sem ID" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }

  // Dados base do user
  const userRows = await query<UserRow>(
    `SELECT u.id, u.name, u.firstname, u.realname, u.registration_number, u.comment,
            (SELECT email FROM glpi_useremails WHERE users_id = u.id
              ORDER BY is_default DESC, id ASC LIMIT 1) AS email
       FROM glpi_users u
      WHERE u.id = ? LIMIT 1`,
    [userId]
  );
  const user = userRows[0];
  if (!user) {
    return NextResponse.json({ message: "Usuario nao encontrado" }, { status: 404 });
  }

  // Grupos
  const grupos = (
    await query<{ name: string }>(
      `SELECT g.name FROM glpi_groups_users gu
        INNER JOIN glpi_groups g ON g.id = gu.groups_id
       WHERE gu.users_id = ?`,
      [userId]
    )
  ).map((r) => r.name);

  // KPIs ultimos 30 dias
  const kpiRows = await query<KpiRow>(
    `SELECT
       SUM(CASE WHEN sv.name IN ('Aprovado','Aprovada','Em análise','Reprovado','Reprovada')
                THEN 1 ELSE 0 END) AS vistoriasConcluidas,
       SUM(COALESCE(aux.is_repeat, 0)) AS revisitas,
       SUM(CASE WHEN sv.name IN ('Aprovado','Aprovada') THEN 1 ELSE 0 END) AS aprovadas,
       COUNT(DISTINCT DATE(f.datadavistoriafield)) AS diasAtivos
     FROM glpi_plugin_fields_networkequipmentdispositivosderedes f
     LEFT JOIN glpi_plugin_fields_statusvistoriafielddropdowns sv
       ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
     LEFT JOIN glpi_plugin_vistomap_projects aux
       ON aux.items_id = f.items_id AND aux.itemtype = 'NetworkEquipment'
     WHERE f.users_id_vistoriadorafield = ?
       AND f.datadavistoriafield IS NOT NULL
       AND f.datadavistoriafield >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [userId]
  );
  const kpi = kpiRows[0] ?? {
    vistoriasConcluidas: 0,
    revisitas: 0,
    aprovadas: 0,
    diasAtivos: 0,
  };

  // Distancia percorrida (30d): haversine entre pings consecutivos via window
  // function (LAG) — rápido (single pass) e FILTRANDO saltos >= 5km, que são
  // drift/teleporte de GPS e inflavam o total (mesmo critério do painel).
  const distRows = await query<{ km: number | string | null }>(
    `
      WITH p AS (
        SELECT
          latitude,
          longitude,
          LAG(latitude)  OVER (ORDER BY id) AS plat,
          LAG(longitude) OVER (ORDER BY id) AS plng
        FROM glpi_plugin_vistomap_locations
        WHERE users_id = ?
          AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      ),
      seg AS (
        SELECT 6371 * 2 * ASIN(SQRT(
                 POWER(SIN(RADIANS((latitude - plat) / 2)), 2) +
                 COS(RADIANS(plat)) * COS(RADIANS(latitude)) *
                 POWER(SIN(RADIANS((longitude - plng) / 2)), 2)
               )) AS d
        FROM p
        WHERE plat IS NOT NULL
      )
      SELECT COALESCE(SUM(d), 0) AS km FROM seg WHERE d < 5
    `,
    [userId]
  );
  const distanciaKm = Math.round(Number(distRows[0]?.km ?? 0) * 10) / 10;

  // Municipio operacional: mais frequente nas vistorias finalizadas 30d
  const municRows = await query<MunicRow>(
    `SELECT TRIM(f.municipiofield) AS municipio, COUNT(*) AS c
       FROM glpi_plugin_fields_networkequipmentdispositivosderedes f
      WHERE f.users_id_vistoriadorafield = ?
        AND f.municipiofield IS NOT NULL AND TRIM(f.municipiofield) <> ''
        AND f.datadavistoriafield >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY municipio
      ORDER BY c DESC LIMIT 1`,
    [userId]
  );
  const municipioOperacional = municRows[0]?.municipio ?? null;

  // Status operacional via expediente
  const exp = await expedienteAtual(userId);
  let statusOperacional: "em-expediente" | "pausa" | "fora-expediente";
  if (!exp || !exp.emAndamento) statusOperacional = "fora-expediente";
  else if (exp.emPausa) statusOperacional = "pausa";
  else statusOperacional = "em-expediente";

  const nome =
    `${user.firstname ?? ""} ${user.realname ?? ""}`.trim() || user.name;

  return NextResponse.json({
    tecnico: {
      id: String(user.id),
      nome,
      email: user.email ?? user.name,
      matricula: user.registration_number ?? null,
    },
    cargo: grupos.includes("VistoMap-Administradores")
      ? "Coordenador Operacional"
      : "Técnico de Campo",
    equipe: grupos.find((g) => g.toLowerCase().includes("tecnico"))
      ?? grupos[0] ?? "VistoMap",
    grupos,
    municipioOperacional,
    statusOperacional,
    expediente: exp
      ? {
          inicio_at: exp.inicio_at,
          emPausa: exp.emPausa,
        }
      : null,
    kpis: {
      vistoriasConcluidas: Number(kpi.vistoriasConcluidas) || 0,
      revisitas: Number(kpi.revisitas) || 0,
      aprovadas: Number(kpi.aprovadas) || 0,
      distanciaKm,
      diasAtivos: Number(kpi.diasAtivos) || 0,
    },
  });
}
