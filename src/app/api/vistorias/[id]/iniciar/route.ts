import { NextResponse } from "next/server";
import { getVistoria } from "@/lib/glpi/equipments";
import { verifySessionJwt } from "@/lib/jwt";
import { expedienteAtual } from "@/lib/expediente";
import { auditInsert } from "@/lib/glpi/audit";
import { execute } from "@/lib/db";
import { TABLE_FIELDS, SITUACAO_COLUMN, SITUACAO_EM_VISTORIA } from "@/lib/glpi/constants";

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
  let actorId: number | null = null;
  let actorNome = "Tecnico";
  if (token) {
    try {
      const claims = await verifySessionJwt(token);
      const userId = Number(claims.sub);
      actorNome = claims.email ?? "Tecnico";
      if (userId > 0) {
        actorId = userId;
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
        if (exp.emPausa) {
          return NextResponse.json(
            {
              message:
                "Você está em pausa para almoço. Retorne do almoço antes de iniciar a vistoria.",
              emPausaAlmoco: true,
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
    // Atualiza situação → Em Vistoria (2) para aparecer em "Vistorias em Andamento" no painel
    await execute(
      `UPDATE \`${TABLE_FIELDS}\` SET \`${SITUACAO_COLUMN}\` = ? WHERE items_id = ?`,
      [SITUACAO_EM_VISTORIA, id]
    );
    // Audit timestamp do "iniciado" — usado pra calcular tempo total da vistoria
    if (actorId) {
      void auditInsert({
        ator: { id: actorId, nome: actorNome, role: "tecnico" },
        acao: "vistoria-iniciada",
        alvo: { tipo: "vistoria", id: String(id), label: vistoria.equipamento ?? `NE-${id}` },
        descricao: `Vistoria iniciada em campo`,
      });
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
