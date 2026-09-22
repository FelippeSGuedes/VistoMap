import { NextRequest, NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
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
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

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

  // Distance driven today (sum of consecutive GPS pings) — achado 2026-09-24:
  // a versão anterior fazia um self-join com subquery CORRELACIONADA (MAX(id)
  // < id, por linha) pra achar o ping anterior — O(n²) em cima de uma tabela
  // com ~200k pings, sem índice composto que sustente isso. Com pings
  // frequentes, várias chamadas concorrentes (hover no /painel/mapa,
  // /painel/tecnicos/[id]) empilhavam queries de 5+ minutos cada, saturando
  // os 8 núcleos do MariaDB e deixando o sistema inteiro lento/fora.
  // LAG() faz a mesma coisa (pega o ping anterior por users_id) numa única
  // passada ordenada — sem self-join, sem subquery por linha. Também troca
  // DATE(created_at)=CURDATE() por um intervalo sargable, pra poder usar
  // índice em created_at em vez de forçar table scan.
  const distRows = await query<LocationRow>(
    `SELECT
       COALESCE(SUM(
         6371 * 2 * ASIN(SQRT(
           POWER(SIN(RADIANS((latitude - prev_lat) / 2)), 2) +
           COS(RADIANS(prev_lat)) * COS(RADIANS(latitude)) *
           POWER(SIN(RADIANS((longitude - prev_lng) / 2)), 2)
         ))
       ), 0) AS km
     FROM (
       SELECT latitude, longitude,
              LAG(latitude)  OVER (ORDER BY id) AS prev_lat,
              LAG(longitude) OVER (ORDER BY id) AS prev_lng
         FROM glpi_plugin_vistomap_locations
        WHERE users_id = ?
          AND created_at >= CURDATE()
          AND created_at < CURDATE() + INTERVAL 1 DAY
     ) t
     WHERE prev_lat IS NOT NULL`,
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
