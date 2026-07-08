import { NextResponse } from "next/server";
import { listVistorias } from "@/lib/glpi/equipments";
import { getActorFromRequest } from "@/lib/auth-request";
import { ensureExpedienteAuto } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lista vistorias do usuario logado (sempre filtrado pelo seu id).
 *
 * Endpoint usado SOMENTE pelo /app (mobile do tecnico). Mesmo se o user
 * for admin+tecnico, no /app ele atua como tecnico — so ve atribuidas.
 * View admin "todas" vive em /api/painel/* .
 */
export async function GET(req: Request) {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor) {
      return NextResponse.json(
        { message: "Não autenticado" },
        { status: 401 }
      );
    }

    // Expediente automático: abre sozinho se dentro da janela + LGPD aceito.
    const gate = await ensureExpedienteAuto(actor.id);
    if (!gate.permitido) {
      const msg =
        gate.motivo === "lgpd-pendente"
          ? "Aceite o termo de consentimento (LGPD) no app antes de acessar as vistorias."
          : gate.motivo === "fds"
            ? "Sem expediente aos fins de semana."
            : `Fora do horário de expediente (${gate.janela.config.inicio}–${gate.janela.config.fim}).`;
      return NextResponse.json({ message: msg, motivo: gate.motivo }, { status: 403 });
    }

    const concluidas = new URL(req.url).searchParams.get("concluidas") === "1";
    const items = await listVistorias({ tecnicoId: actor.id, concluidas });
    return NextResponse.json(items);
  } catch (error) {
    console.error("[api/vistorias] GET error", error);
    return NextResponse.json(
      { message: "Falha ao listar vistorias", error: String(error) },
      { status: 500 }
    );
  }
}
