import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { getExpedienteConfig, setExpedienteConfig } from "@/lib/expediente";
import { auditInsert } from "@/lib/glpi/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/expediente/config  (admin)
 * Retorna a janela de rastreio automático (início, fim, fim de semana).
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  try {
    const claims = await verifySessionJwt(token);
    if (claims.role !== "admin") {
      return NextResponse.json({ message: "Acesso restrito" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }
  const config = await getExpedienteConfig();
  return NextResponse.json({ config });
}

interface Body {
  inicio?: string;
  fim?: string;
  fimDeSemana?: boolean;
}

/**
 * PUT /api/painel/expediente/config  (admin)
 * Body: { inicio?: "HH:MM", fim?: "HH:MM", fimDeSemana?: boolean }
 * Atualiza a janela de rastreio automático. Registra em auditoria.
 */
export async function PUT(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
  let userId = 0;
  let userNome = "Administrador";
  try {
    const claims = await verifySessionJwt(token);
    if (claims.role !== "admin") {
      return NextResponse.json({ message: "Acesso restrito" }, { status: 403 });
    }
    userId = Number(claims.sub) || 0;
    userNome = claims.email ?? "Administrador";
  } catch {
    return NextResponse.json({ message: "Token invalido" }, { status: 401 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "JSON invalido" }, { status: 400 });
  }
  if (body.inicio !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.inicio)) {
    return NextResponse.json({ message: "inicio invalido (HH:MM)" }, { status: 400 });
  }
  if (body.fim !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.fim)) {
    return NextResponse.json({ message: "fim invalido (HH:MM)" }, { status: 400 });
  }
  if (
    body.inicio !== undefined &&
    body.fim !== undefined &&
    body.inicio >= body.fim
  ) {
    return NextResponse.json(
      { message: "inicio deve ser antes de fim" },
      { status: 400 }
    );
  }
  const config = await setExpedienteConfig(body);
  void auditInsert({
    ator: { id: userId, nome: userNome, role: "admin" },
    acao: "dados-editados",
    alvo: { tipo: "sistema", id: "expediente-config", label: "Janela de expediente" },
    descricao: `Janela de rastreio atualizada: ${config.inicio}–${config.fim}, fim de semana ${config.fimDeSemana ? "ativo" : "inativo"}.`,
  });
  return NextResponse.json({ ok: true, config });
}
