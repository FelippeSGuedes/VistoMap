import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { execute } from "@/lib/db";
import {
  TABLE_FIELDS,
  SITUACAO_COLUMN,
  SITUACAO_A_VISTORIAR,
  SITUACAO_EM_VISTORIA,
  SITUACAO_EM_DESLOCAMENTO,
} from "@/lib/glpi/constants";
import { auditInsert } from "@/lib/glpi/audit";
import { getVistoria } from "@/lib/glpi/equipments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const n = Number(raw.replace(/^NE-/, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }

  let actorId: number;
  let actorNome: string;
  try {
    const claims = await verifySessionJwt(token);
    actorId = Number(claims.sub);
    actorNome = claims.email ?? "Tecnico";
    if (!(actorId > 0)) throw new Error("sub inválido");
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  const body = (await request.json()) as { situacao_id: number };
  const { situacao_id } = body;
  if (!Number.isInteger(situacao_id) || situacao_id < 1) {
    return NextResponse.json({ message: "situacao_id inválido" }, { status: 400 });
  }

  try {
    // Rota é usada só pelo app do técnico (marcadores "em deslocamento"/
    // "em vistoria") — sem essa checagem, qualquer token técnico válido
    // mexia na situação de qualquer vistoria, não só a atribuída a ele.
    const vistoria = await getVistoria(id);
    if (!vistoria) {
      return NextResponse.json({ message: "Vistoria não encontrada" }, { status: 404 });
    }
    if (String(actorId) !== vistoria.tecnico.id) {
      return NextResponse.json({ message: "Você não tem acesso a esta vistoria" }, { status: 403 });
    }

    // "Em deslocamento" é um estado EXCLUSIVO: ninguém se desloca para dois
    // equipamentos ao mesmo tempo. Sem esta limpeza, o técnico que marcava
    // deslocamento pro equipamento A e depois pro B, sem concluir o A,
    // deixava o A preso nesse estado indefinidamente — e o painel passava a
    // mostrar o mesmo técnico indo para dois lugares (relatado em produção).
    //
    // Vale também ao INICIAR uma vistoria: se ele chegou e começou o
    // trabalho, qualquer deslocamento pendente dele é resíduo.
    //
    // As vistorias afetadas voltam para "A Vistoriar", que com técnico
    // atribuído é lido como ATRIBUÍDO (ver resolveSituacaoOperacional) — ou
    // seja, continuam na fila dele, só deixam de fingir que ele está a
    // caminho. Só o deslocamento é revertido; vistoria em andamento nunca é
    // tocada, pra não destruir trabalho de campo legítimo.
    if (situacao_id === SITUACAO_EM_DESLOCAMENTO || situacao_id === SITUACAO_EM_VISTORIA) {
      await execute(
        `UPDATE \`${TABLE_FIELDS}\`
            SET \`${SITUACAO_COLUMN}\` = ?
          WHERE users_id_vistoriadorafield = ?
            AND \`${SITUACAO_COLUMN}\` = ?
            AND items_id <> ?`,
        [SITUACAO_A_VISTORIAR, actorId, SITUACAO_EM_DESLOCAMENTO, id]
      );
    }

    await execute(
      `UPDATE \`${TABLE_FIELDS}\` SET \`${SITUACAO_COLUMN}\` = ? WHERE items_id = ?`,
      [situacao_id, id]
    );

    const ACOES: Record<number, string> = {
      2: "vistoria-em-vistoria",
      7: "vistoria-em-deslocamento",
    };
    const acao = ACOES[situacao_id];
    if (acao) {
      void auditInsert({
        ator: { id: actorId, nome: actorNome, role: "tecnico" },
        acao: acao as Parameters<typeof auditInsert>[0]["acao"],
        alvo: { tipo: "vistoria", id: String(id), label: `NE-${id}` },
        descricao: situacao_id === 7 ? "Técnico em deslocamento até o local" : "Vistoria iniciada em campo",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/vistorias/:id/situacao] error", error);
    return NextResponse.json({ message: "Falha ao atualizar situação" }, { status: 500 });
  }
}
