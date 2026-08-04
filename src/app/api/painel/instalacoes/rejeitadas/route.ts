import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { listInstalacaoRejeicoes } from "@/lib/glpi/instalacaoRejeicoes";
import { sanitizeFolderName } from "@/lib/sanitize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/instalacoes/rejeitadas  (leitura+)
 *
 * Instalações rejeitadas pelo instalador, aguardando decisão do analista
 * (escalar pra vistoria ou descartar a rejeição). Fila própria do módulo
 * de Instalação — não é a mesma de /painel/rejeitadas (vistoria).
 */
export async function GET(request: Request) {
  const auth = await requirePainelRole(request, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const rejeicoes = await listInstalacaoRejeicoes("PENDENTE");
    const comFotos = rejeicoes.map((r) => {
      const folder = encodeURIComponent(sanitizeFolderName(r.equipamento));
      return {
        ...r,
        foto1Url: r.foto1_path ? `/uploads/${folder}/${encodeURIComponent(r.foto1_path)}` : null,
        foto2Url: r.foto2_path ? `/uploads/${folder}/${encodeURIComponent(r.foto2_path)}` : null,
        foto3Url: r.foto3_path ? `/uploads/${folder}/${encodeURIComponent(r.foto3_path)}` : null,
      };
    });
    return NextResponse.json({ rejeicoes: comFotos });
  } catch (err) {
    return NextResponse.json(
      { message: "Erro ao listar instalações rejeitadas", error: String(err) },
      { status: 500 }
    );
  }
}
