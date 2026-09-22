import { NextRequest, NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AuditRow {
  acao: string;
  ator_id: number;
  ator_nome: string;
  criado_em: string;
}

/**
 * GET /api/painel/vistoria-metrics?vistoria_id=X  (admin)
 *
 * Calcula on-demand:
 *  - tempo_min: diff entre audit "vistoria-iniciada" e "vistoria-finalizada"
 *  - km_percorridos: soma haversine dos pings GPS do tecnico durante a janela
 *  - tecnico: id + nome
 *
 * Quando faltam audits (vistoria antiga sem iniciar/finalizar logado),
 * retorna nulls — UI mostra "—".
 */
export async function GET(req: NextRequest) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const vistoriaId = req.nextUrl.searchParams.get("vistoria_id");
  if (!vistoriaId) {
    return NextResponse.json({ message: "vistoria_id obrigatorio" }, { status: 400 });
  }

  const audits = await query<AuditRow>(
    `SELECT acao, ator_id, ator_nome, ts AS criado_em
       FROM glpi_plugin_vistomap_audit
      WHERE alvo_id = ? AND alvo_tipo = 'vistoria'
        AND acao IN ('vistoria-iniciada','vistoria-finalizada')
      ORDER BY ts ASC`,
    [String(vistoriaId)]
  );

  const iniciada = audits.find((a) => a.acao === "vistoria-iniciada");
  const finalizada = audits.find((a) => a.acao === "vistoria-finalizada");

  let tempoMin: number | null = null;
  if (iniciada && finalizada) {
    tempoMin = Math.round(
      (new Date(finalizada.criado_em).getTime() -
        new Date(iniciada.criado_em).getTime()) /
        60_000
    );
  }

  let kmPercorridos: number | null = null;
  let pingsCount: number | null = null;
  if (iniciada && finalizada) {
    const tecnicoId = iniciada.ator_id;
    // Mesmo achado/fix de tecnico-today/route.ts (2026-09-24): self-join com
    // subquery correlacionada por linha (O(n²)) trocado por LAG() numa única
    // passada — essa era uma das queries empilhando 5+min cada e derrubando
    // o MariaDB (8 núcleos a ~750% de uso simultâneo).
    const distRows = await query<{ km: number | string | null; n: number }>(
      `SELECT
         COALESCE(SUM(
           6371 * 2 * ASIN(SQRT(
             POWER(SIN(RADIANS((latitude - prev_lat) / 2)), 2) +
             COS(RADIANS(prev_lat)) * COS(RADIANS(latitude)) *
             POWER(SIN(RADIANS((longitude - prev_lng) / 2)), 2)
           ))
         ), 0) AS km,
         COUNT(*) AS n
       FROM (
         SELECT latitude, longitude,
                LAG(latitude)  OVER (ORDER BY id) AS prev_lat,
                LAG(longitude) OVER (ORDER BY id) AS prev_lng
           FROM glpi_plugin_vistomap_locations
          WHERE users_id = ?
            AND created_at BETWEEN ? AND ?
       ) t
       WHERE prev_lat IS NOT NULL`,
      [tecnicoId, iniciada.criado_em, finalizada.criado_em]
    );
    kmPercorridos = Math.round(Number(distRows[0]?.km ?? 0) * 100) / 100;
    pingsCount = Number(distRows[0]?.n ?? 0);
  }

  return NextResponse.json({
    vistoria_id: vistoriaId,
    inicio_at: iniciada?.criado_em ?? null,
    fim_at: finalizada?.criado_em ?? null,
    tempo_min: tempoMin,
    km_percorridos: kmPercorridos,
    pings: pingsCount,
    tecnico: iniciada
      ? { id: iniciada.ator_id, nome: iniciada.ator_nome }
      : null,
  });
}
