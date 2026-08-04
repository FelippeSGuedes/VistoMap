import { NextResponse } from "next/server";
import { assumirInstalacao, getInstalacao } from "@/lib/glpi/instalacoes";
import { getActorFromRequest } from "@/lib/auth-request";
import { auditInsert } from "@/lib/glpi/audit";
import { logError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Instalador assume o poste: trava pra ele (states_id LIBERADO → EM_INSTALACAO
 * + users_id_instaladorfield). A condição de corrida entre dois instaladores
 * pegando o mesmo poste ao mesmo tempo é resolvida no próprio UPDATE
 * (WHERE states_id ainda = LIBERADO) — só um dos dois ganha.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  const actor = await getActorFromRequest(request).catch(() => null);
  if (!actor) {
    return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  }

  try {
    const ok = await assumirInstalacao(id, actor.id);
    if (!ok) {
      return NextResponse.json(
        { message: "Essa instalação já foi assumida por outra pessoa." },
        { status: 409 }
      );
    }

    const instalacao = await getInstalacao(id);

    void auditInsert({
      ator: actor,
      acao: "instalacao-assumida",
      alvo: { tipo: "instalacao", id: String(id), label: instalacao?.equipamento ?? `NE-${id}` },
      descricao: `Instalação assumida em campo`,
    });

    return NextResponse.json({ ok: true, instalacao });
  } catch (error) {
    console.error("[api/instalacoes/:id/assumir] error", error);
    void logError("app", "instalacoes/:id/assumir", error, { id });
    return NextResponse.json(
      { message: "Falha ao assumir instalação", error: String(error) },
      { status: 500 }
    );
  }
}
