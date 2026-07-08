import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { ensureExpedienteAuto, jaAceitouLGPD } from "@/lib/expediente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/expediente/atual
 * Expediente automático: esta chamada (feita pelo app no mount e a cada 30s)
 * já abre o expediente do dia se estiver na janela e o LGPD tiver sido aceito
 * — o dia "começa" quando o técnico abre o app, sem botão. Retorna também a
 * janela configurada pro card passivo do app exibir o status.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  }
  let userId: number;
  try {
    const claims = await verifySessionJwt(token);
    userId = Number(claims.sub);
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }
  const [gate, lgpd] = await Promise.all([
    ensureExpedienteAuto(userId),
    jaAceitouLGPD(userId),
  ]);
  return NextResponse.json({
    expediente: gate.expediente ?? null,
    lgpdAceito: lgpd,
    janela: {
      dentro: gate.janela.dentro,
      motivo: gate.motivo ?? null,
      inicio: gate.janela.config.inicio,
      fim: gate.janela.config.fim,
      fimDeSemana: gate.janela.config.fimDeSemana,
    },
  });
}
