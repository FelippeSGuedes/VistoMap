import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { query } from "@/lib/db";
import { ensureOverrideTable } from "@/lib/ensureOverrideTable";
import { listRecusas } from "@/lib/glpi/recusas";
import { RECUSA_MOTIVO_LABEL, type RecusaMotivo } from "@/lib/glpi/recusaMotivos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface OverrideRequest {
  /** Recusas usam o id da tabela `recusas` — só é único DENTRO do mesmo `tipo`. */
  id: number;
  tipo: "override" | "recusa";
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

/** Admin: GET /api/painel/notificacoes — junta overrides (fora do raio) + recusas de vistoria. */
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

  const [overrideRows, recusas] = await Promise.all([
    query<Omit<OverrideRequest, "tipo">>(
      `SELECT id, vistoria_id, users_id, equipamento, tecnico_nome, justificativa,
              status, motivo_reprovacao, distancia_m, exception_label, created_at, updated_at
       FROM \`glpi_plugin_vistomap_override_requests\`
       ORDER BY created_at DESC
       LIMIT 100`
    ),
    listRecusas({ limit: 100 }),
  ]);

  const recusaRows: OverrideRequest[] = recusas.map((r) => ({
    id: r.id,
    tipo: "recusa",
    vistoria_id: r.vistoriaId,
    users_id: r.tecnicoId,
    equipamento: r.equipamento,
    tecnico_nome: r.tecnicoNome,
    justificativa: r.justificativa,
    status: r.status,
    motivo_reprovacao: r.motivoReprovacao,
    distancia_m: null,
    exception_label: RECUSA_MOTIVO_LABEL[r.motivo as RecusaMotivo] ?? r.motivo,
    created_at: r.criadoEm,
    updated_at: r.resolvidoEm ?? r.criadoEm,
  }));

  const rows: OverrideRequest[] = [
    ...overrideRows.map((r) => ({ ...r, tipo: "override" as const })),
    ...recusaRows,
  ].sort((a, b) => {
    const pa = a.status === "PENDENTE" ? 0 : 1;
    const pb = b.status === "PENDENTE" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const pendentes = rows.filter((r) => r.status === "PENDENTE").length;

  return NextResponse.json({ requests: rows, pendentes });
}
