import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { listarPerfisGlpi, ACESSO_CFG, type AcessoPainel } from "@/lib/glpi/criarUsuario";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/usuarios/opcoes (admin) — perfis GLPI + opções de acesso
 * VistoMap, pros dropdowns do form de novo colaborador.
 */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "admin");
  if (!auth.ok) return auth.response;

  try {
    const perfis = await listarPerfisGlpi();
    const acessos = (Object.keys(ACESSO_CFG) as AcessoPainel[]).map((k) => ({
      key: k,
      label: ACESSO_CFG[k].label,
    }));
    return NextResponse.json({ perfis, acessos });
  } catch (err) {
    return NextResponse.json(
      { message: "Falha ao carregar opções", error: String(err) },
      { status: 500 }
    );
  }
}
