import { NextResponse } from "next/server";
import { getVistoria } from "@/lib/glpi/equipments";
import { getActorFromRequest } from "@/lib/auth-request";
import { ensureExpedienteAuto } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }
  try {
    const actor = await getActorFromRequest(request);
    if (!actor) {
      return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
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

    const vistoria = await getVistoria(id);
    if (!vistoria) {
      return NextResponse.json({ message: "Vistoria não encontrada" }, { status: 404 });
    }
    return NextResponse.json(vistoria);
  } catch (error) {
    console.error("[api/vistorias/:id] GET error", error);
    return NextResponse.json(
      { message: "Falha ao carregar vistoria", error: String(error) },
      { status: 500 }
    );
  }
}
