import { NextRequest, NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
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
    const distRows = await query<{ km: number | string | null; n: number }>(
      `SELECT
         COALESCE(SUM(
           6371 * 2 * ASIN(SQRT(
             POWER(SIN(RADIANS((l1.latitude - l2.latitude) / 2)), 2) +
             COS(RADIANS(l2.latitude)) * COS(RADIANS(l1.latitude)) *
             POWER(SIN(RADIANS((l1.longitude - l2.longitude) / 2)), 2)
           ))
         ), 0) AS km,
         COUNT(*) AS n
       FROM glpi_plugin_vistomap_locations l1
       INNER JOIN glpi_plugin_vistomap_locations l2
         ON l2.users_id = l1.users_id
        AND l2.id = (
          SELECT MAX(l3.id) FROM glpi_plugin_vistomap_locations l3
           WHERE l3.users_id = l1.users_id AND l3.id < l1.id
             AND l3.created_at BETWEEN ? AND ?
        )
       WHERE l1.users_id = ?
         AND l1.created_at BETWEEN ? AND ?`,
      [iniciada.criado_em, finalizada.criado_em, tecnicoId, iniciada.criado_em, finalizada.criado_em]
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
