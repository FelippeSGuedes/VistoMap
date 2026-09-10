import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { recuperarAvaliadorViaLogsGlpi } from "@/lib/glpi/painel";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/painel/cpfl/recuperar-avaliador (moderador)
 *
 * Botão manual em /painel/cpfl — tenta recuperar, pelo histórico NATIVO
 * do GLPI (glpi_logs), quem aprovou vistorias que a CPFL já aprovou
 * direto no GLPI dela (sem passar pelo VistoMap, então o campo
 * "Avaliador da Vistoria CPFL" nunca foi escrito). Best-effort: só
 * grava quando o histórico não deixa margem pra dúvida — ver
 * recuperarAvaliadorViaLogsGlpi() pro critério exato.
 */
export async function POST(req: Request) {
  const auth = await requirePainelRole(req, "moderador");
  if (!auth.ok) return auth.response;

  try {
    const { recuperados, naoRecuperados } = await recuperarAvaliadorViaLogsGlpi();

    for (const r of recuperados) {
      void auditInsert({
        ator: { id: Number(auth.claims.sub) || 0, nome: auth.claims.email ?? "Administrador", role: "admin" },
        acao: "sincronizacao",
        alvo: { tipo: "vistoria", id: String(r.id), label: r.equipamento },
        descricao: `Avaliador da Vistoria CPFL recuperado do histórico do GLPI: ${r.avaliador} (log de ${r.dataLog}).`,
      });
    }

    return NextResponse.json({ ok: true, recuperados, naoRecuperados });
  } catch (err) {
    console.error("[api/painel/cpfl/recuperar-avaliador] error", err);
    return NextResponse.json(
      { message: "Falha ao recuperar avaliador", error: String(err) },
      { status: 500 }
    );
  }
}
