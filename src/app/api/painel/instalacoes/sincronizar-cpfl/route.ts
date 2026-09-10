import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { sincronizarStatusLiberadoInstalacao } from "@/lib/glpi/instalacoes";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/painel/instalacoes/sincronizar-cpfl (moderador)
 *
 * Botão manual em /painel/cpfl — corrige o status geral (states_id) de
 * equipamentos já aprovados pela CPFL que ficaram presos em "Vistoriado"
 * porque nada nunca avançava esse campo automaticamente (achado
 * 2026-09-10). Ver sincronizarStatusLiberadoInstalacao() pro critério
 * exato e a explicação completa do porquê disso existir.
 */
export async function POST(req: Request) {
  const auth = await requirePainelRole(req, "moderador");
  if (!auth.ok) return auth.response;

  try {
    const liberados = await sincronizarStatusLiberadoInstalacao();

    for (const eq of liberados) {
      void auditInsert({
        ator: { id: Number(auth.claims.sub) || 0, nome: auth.claims.email ?? "Administrador", role: "admin" },
        acao: "sincronizacao",
        alvo: { tipo: "vistoria", id: String(eq.id), label: eq.equipamento },
        descricao: `Status geral corrigido pra "Liberado para Instalação" — vistoria já aprovada pela CPFL, mas o campo nativo do GLPI nunca tinha sido atualizado.`,
      });
    }

    return NextResponse.json({ ok: true, liberados });
  } catch (err) {
    console.error("[api/painel/instalacoes/sincronizar-cpfl] error", err);
    return NextResponse.json(
      { message: "Falha ao sincronizar status", error: String(err) },
      { status: 500 }
    );
  }
}
