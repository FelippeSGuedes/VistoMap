import { NextRequest, NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AuditRow {
  acao: string;
  criado_em: string;
}

interface LocationRow {
  km: number | string | null;
}

/**
 * GET /api/painel/tecnico-today?users_id=X  (admin)
 *
 * Aggregates today's metrics for a technician:
 *  - vistorias_hoje: count of distinct vistorias iniciadas today
 *  - km_hoje: sum of haversine distances from GPS pings today
 *  - tempo_medio_min: avg minutes per completed vistoria today
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
  if (!usersId) {
    return NextResponse.json({ message: "users_id obrigatorio" }, { status: 400 });
  }

  // Count vistorias iniciadas today
  const [{ n: vistoriasHoje }] = await query<{ n: number }>(
    `SELECT COUNT(DISTINCT alvo_id) AS n
       FROM glpi_plugin_vistomap_audit
      WHERE ator_id = ?
        AND acao = 'vistoria-iniciada'
        AND DATE(ts) = CURDATE()`,
    [usersId]
  ).then((r) => r.length ? r : [{ n: 0 }]);

  // Avg duration for completed vistorias today (paired iniciada + finalizada).
  // A vistoria pode ter várias revisitas ao longo do tempo (mesmo alvo_id
  // com vários ciclos iniciada→finalizada em dias diferentes) — um JOIN
  // simples por alvo_id+ator_id casava a "iniciada" de hoje com QUALQUER
  // "finalizada" já registrada pra aquele poste, inclusive uma antiga de
  // dias atrás, dando fim-inicio NEGATIVO (ex.: -36062min). O subselect
  // correlacionado pega a finalizada MAIS PRÓXIMA que veio DEPOIS da
  // iniciada — só essa é o par correto do ciclo de hoje.
  const pairs = await query<{ alvo_id: string; inicio: string; fim: string | null }>(
    `SELECT a_inicio.alvo_id,
            a_inicio.ts AS inicio,
            (
              SELECT MIN(a_fim.ts)
                FROM glpi_plugin_vistomap_audit a_fim
               WHERE a_fim.alvo_id = a_inicio.alvo_id
                 AND a_fim.ator_id = a_inicio.ator_id
                 AND a_fim.acao = 'vistoria-finalizada'
                 AND a_fim.ts > a_inicio.ts
            ) AS fim
       FROM glpi_plugin_vistomap_audit a_inicio
      WHERE a_inicio.ator_id = ?
        AND a_inicio.acao = 'vistoria-iniciada'
        AND DATE(a_inicio.ts) = CURDATE()`,
    [usersId]
  ).then((rows) => rows.filter((r) => r.fim != null));

  let tempoMedioMin: number | null = null;
  if (pairs.length > 0) {
    const totalMs = pairs.reduce((acc, p) => {
      return acc + (new Date(p.fim as string).getTime() - new Date(p.inicio).getTime());
    }, 0);
    tempoMedioMin = Math.round(totalMs / pairs.length / 60_000);
  }

  // Distance driven today (sum of consecutive GPS pings)
  const distRows = await query<LocationRow>(
    `SELECT
       COALESCE(SUM(
         6371 * 2 * ASIN(SQRT(
           POWER(SIN(RADIANS((l1.latitude - l2.latitude) / 2)), 2) +
           COS(RADIANS(l2.latitude)) * COS(RADIANS(l1.latitude)) *
           POWER(SIN(RADIANS((l1.longitude - l2.longitude) / 2)), 2)
         ))
       ), 0) AS km
     FROM glpi_plugin_vistomap_locations l1
     INNER JOIN glpi_plugin_vistomap_locations l2
       ON l2.users_id = l1.users_id
      AND l2.id = (
        SELECT MAX(l3.id)
          FROM glpi_plugin_vistomap_locations l3
         WHERE l3.users_id = l1.users_id
           AND l3.id < l1.id
           AND DATE(l3.created_at) = CURDATE()
      )
     WHERE l1.users_id = ?
       AND DATE(l1.created_at) = CURDATE()`,
    [usersId]
  );

  const kmHoje = Math.round(Number(distRows[0]?.km ?? 0) * 100) / 100;

  return NextResponse.json({
    users_id: usersId,
    vistorias_hoje: Number(vistoriasHoje),
    km_hoje: kmHoje,
    tempo_medio_min: tempoMedioMin,
  });
}
