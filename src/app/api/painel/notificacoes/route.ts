import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { query } from "@/lib/db";
import { ensureOverrideTable } from "@/lib/ensureOverrideTable";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface OverrideRequest {
  id: number;
  vistoria_id: number;
  users_id: number;
  equipamento: string;
  tecnico_nome: string;
  justificativa: string;
  status: "PENDENTE" | "APROVADO" | "REPROVADO";
  motivo_reprovacao: string | null;
  distancia_m: number | null;
  exception_label: string | null;
  created_at: string;
  updated_at: string;
}

/** Admin: GET /api/painel/notificacoes */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  try {
    const claims = await verifySessionJwt(token);
    if (claims.role !== "admin") return NextResponse.json({ message: "Acesso negado" }, { status: 403 });
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  await ensureOverrideTable();

  const rows = await query<OverrideRequest>(
    `SELECT id, vistoria_id, users_id, equipamento, tecnico_nome, justificativa,
            status, motivo_reprovacao, distancia_m, exception_label, created_at, updated_at
     FROM \`glpi_plugin_vistomap_override_requests\`
     ORDER BY
       CASE status WHEN 'PENDENTE' THEN 0 ELSE 1 END ASC,
       created_at DESC
     LIMIT 100`
  );

  const pendentes = rows.filter((r) => r.status === "PENDENTE").length;

  return NextResponse.json({ requests: rows, pendentes });
}
