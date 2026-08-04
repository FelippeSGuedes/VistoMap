import { NextResponse } from "next/server";
import { listInstalacoes } from "@/lib/glpi/instalacoes";
import { getActorFromRequest } from "@/lib/auth-request";
import { ensureExpedienteAuto } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lista instalações disponíveis (states_id = LIBERADO) mais as que o
 * instalador logado já assumiu (EM_INSTALACAO travado pra ele). Espelha
 * /api/vistorias, mas lê a fonte de dados isolada do módulo de Instalação
 * — não toca em nenhuma rota/lib da vistoria.
 */
export async function GET(req: Request) {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor) {
      return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
    }

    const gate = await ensureExpedienteAuto(actor.id);
    if (!gate.permitido) {
      const msg =
        gate.motivo === "lgpd-pendente"
          ? "Aceite o termo de consentimento (LGPD) no app antes de acessar as instalações."
          : gate.motivo === "fds"
            ? "Sem expediente aos fins de semana."
            : `Fora do horário de expediente (${gate.janela.config.inicio}–${gate.janela.config.fim}).`;
      return NextResponse.json({ message: msg, motivo: gate.motivo }, { status: 403 });
    }

    const items = await listInstalacoes({ instaladorId: actor.id });
    return NextResponse.json(items);
  } catch (error) {
    console.error("[api/instalacoes] GET error", error);
    return NextResponse.json(
      { message: "Falha ao listar instalações", error: String(error) },
      { status: 500 }
    );
  }
}
