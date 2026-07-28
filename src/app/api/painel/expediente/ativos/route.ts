import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { expedientesAtivos, fecharExpedientesPendurados } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/expediente/ativos  (admin)
 * Lista todos os expedientes em aberto AGORA. Antes de listar, varre e fecha
 * expedientes "pendurados" (abertos num dia anterior — ex.: app do técnico
 * ficou sem sinal no fim do turno) para o painel nunca mostrar alguém
 * "em campo há 2 dias" por erro de sincronização.
 */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "moderador");
  if (!auth.ok) return auth.response;
  await fecharExpedientesPendurados();
  const items = await expedientesAtivos();
  return NextResponse.json({ ativos: items, total: items.length });
}
