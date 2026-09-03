import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth-request";
import { logError, type LogSource } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ErrorReportBody {
  mensagem?: string;
  rota?: string;
  contexto?: Record<string, unknown>;
}

/**
 * POST /api/errors — captura de erro do CLIENTE (app técnico).
 *
 * Fecha o loop que faltava: logError() já existia (9 rotas de servidor),
 * mas nada no app reportava erro de tela/timeout/promise rejeitada — o
 * primeiro sinal de problema era sempre o técnico reclamando. Chamado por
 * `useErrorReporter` (providers.tsx) + error.tsx (error boundary do Next).
 *
 * Exige sessão válida (não é endpoint aberto) mas não derruba nada do app —
 * se falhar, falha em silêncio, igual o resto de logError().
 */
export async function POST(request: Request) {
  const actor = await getActorFromRequest(request).catch(() => null);
  if (!actor) {
    return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  }

  let body: ErrorReportBody;
  try {
    body = (await request.json()) as ErrorReportBody;
  } catch {
    return NextResponse.json({ message: "Payload inválido" }, { status: 400 });
  }

  const mensagem = (body.mensagem ?? "").slice(0, 2000);
  if (!mensagem.trim()) {
    return NextResponse.json({ message: "Mensagem vazia" }, { status: 400 });
  }
  const rota = (body.rota ?? "desconhecida").slice(0, 128);

  // Cada variante (painel/tecnico) roda num container próprio com seu
  // próprio NEXT_PUBLIC_BASE_PATH — não confia no cliente pra dizer de onde
  // veio, o servidor já sabe qual build está rodando.
  const source: LogSource = process.env.NEXT_PUBLIC_BASE_PATH === "/painel" ? "painel" : "app";

  void logError(source, rota, mensagem, {
    ...body.contexto,
    ator: actor.nome,
    atorId: actor.id,
  });

  return NextResponse.json({ ok: true });
}
