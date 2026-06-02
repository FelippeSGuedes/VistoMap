import { NextResponse } from "next/server";
import { getVistoria } from "@/lib/glpi/equipments";
import { verifySessionJwt } from "@/lib/jwt";
import { expedienteAtual } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Iniciar vistoria = apenas valida existência do equipamento.
 *
 * IMPORTANTE: o schema do plugin (`glpi_plugin_vistomap_projects.project_status`)
 * só aceita PENDENTE/GERANDO/GERADO/ERRO. Não escrevemos nada aqui senão o worker
 * dispararia geração de PDF antes do técnico mandar as fotos.
 *
 * A linha na tabela auxiliar é criada/atualizada apenas no `finalizar`.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }
  // Gating: so pode iniciar vistoria se estiver em expediente aberto.
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token) {
    try {
      const claims = await verifySessionJwt(token);
      const userId = Number(claims.sub);
      if (userId > 0) {
        const exp = await expedienteAtual(userId);
        if (!exp || !exp.emAndamento) {
          return NextResponse.json(
            {
              message:
                "Inicie o expediente antes de começar a vistoria.",
              precisaIniciarExpediente: true,
            },
            { status: 403 }
          );
        }
      }
    } catch {
      /* token inválido cai no try abaixo na verificacao normal */
    }
  }
  try {
    const vistoria = await getVistoria(id);
    if (!vistoria) {
      return NextResponse.json({ message: "Vistoria não encontrada" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, equipamento: vistoria.equipamento });
  } catch (error) {
    console.error("[api/vistorias/:id/iniciar] error", error);
    return NextResponse.json(
      { message: "Falha ao iniciar vistoria", error: String(error) },
      { status: 500 }
    );
  }
}
