import { NextRequest, NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { iniciarExpediente } from "@/lib/expediente";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  aceitarLGPD?: boolean;
  dispositivoInfo?: string;
}

/**
 * POST /api/expediente/iniciar
 * Body: { aceitarLGPD?: boolean, dispositivoInfo?: string }
 *
 * Inicia turno. Se LGPD nunca foi aceito e body.aceitarLGPD nao for true,
 * retorna 409 com precisaAceiteLGPD=true.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  let userId: number;
  let userNome = "Tecnico";
  try {
    const claims = await verifySessionJwt(token);
    userId = Number(claims.sub);
    userNome = claims.email ?? "Tecnico";
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* body vazio ok */
  }
  const result = await iniciarExpediente({
    usersId: userId,
    aceitarLGPDAgora: !!body.aceitarLGPD,
    dispositivoInfo: body.dispositivoInfo,
  });
  if (!result.ok) {
    if (result.reason === "ja-aberto") {
      return NextResponse.json(
        { message: "Expediente ja aberto", expediente: result.expediente },
        { status: 409 }
      );
    }
    if (result.reason === "lgpd-pendente") {
      return NextResponse.json(
        { message: "Aceite LGPD obrigatorio", precisaAceiteLGPD: true },
        { status: 409 }
      );
    }
    return NextResponse.json({ message: "Falha desconhecida" }, { status: 500 });
  }
  void auditInsert({
    ator: { id: userId, nome: userNome, role: "tecnico" },
    acao: "expediente-iniciado",
    descricao: `Expediente aberto · ${body.dispositivoInfo ?? "sem device info"}`,
  });
  return NextResponse.json({ ok: true, expediente: result.expediente });
}
