import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { registrarConsentimentoLGPD } from "@/lib/expediente";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  dispositivoInfo?: string;
}

/**
 * POST /api/expediente/lgpd
 *
 * Registra o aceite do termo de consentimento LGPD — SEM abrir turno, SEM
 * checar janela de horário. O consentimento é um ato jurídico do técnico e
 * precisa estar disponível a qualquer momento (inclusive fora do horário de
 * expediente); é a ABERTURA DO TURNO (ensureExpedienteAuto, disparada pelo
 * uso normal do app) que respeita a janela — não o aceite em si.
 *
 * Antes, o aceite passava por /api/expediente/iniciar, que também tentava
 * abrir um turno e por isso ficava bloqueado pela janela — impedindo o
 * técnico de sequer aceitar o termo fora do horário.
 */
export async function POST(req: Request) {
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
  try {
    await registrarConsentimentoLGPD(userId, body.dispositivoInfo ?? null);
  } catch (err) {
    console.error("[api/expediente/lgpd] erro ao registrar consentimento", err);
    return NextResponse.json(
      { message: "Falha ao registrar o consentimento. Tente novamente." },
      { status: 500 }
    );
  }
  void auditInsert({
    ator: { id: userId, nome: userNome, role: "tecnico" },
    acao: "expediente-iniciado",
    descricao: `Consentimento LGPD registrado · ${body.dispositivoInfo ?? "sem device info"}`,
  });
  return NextResponse.json({ ok: true });
}
