import { NextRequest, NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { fetchTecnicoObservacoes, criarTecnicoObservacao } from "@/lib/glpi/tecnicoObservacoes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET  /api/painel/tecnico-observacoes?tecnico_id=X   (leitura)
 * POST /api/painel/tecnico-observacoes { tecnicoId, texto }  (leitura)
 *
 * Observações manuais do analista sobre um técnico — Análise Operacional
 * dos Técnicos (/painel).
 */
export async function GET(req: NextRequest) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const tecnicoIdParam = req.nextUrl.searchParams.get("tecnico_id");
  const tecnicoId = Number(tecnicoIdParam);
  if (!tecnicoIdParam || !Number.isFinite(tecnicoId) || tecnicoId <= 0) {
    return NextResponse.json({ message: "tecnico_id obrigatorio" }, { status: 400 });
  }

  try {
    const observacoes = await fetchTecnicoObservacoes(tecnicoId);
    return NextResponse.json({ observacoes });
  } catch (err) {
    console.error("[api/painel/tecnico-observacoes] GET error", err);
    return NextResponse.json({ message: "Falha ao carregar observações", error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;
  const autorNome = auth.claims.email ?? "Analista";
  const autorId = Number(auth.claims.sub) || 0;

  let body: { tecnicoId?: number; texto?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const tecnicoId = Number(body.tecnicoId);
  const texto = (body.texto ?? "").trim();
  if (!Number.isFinite(tecnicoId) || tecnicoId <= 0) {
    return NextResponse.json({ message: "tecnicoId obrigatorio" }, { status: 400 });
  }
  if (!texto) {
    return NextResponse.json({ message: "texto obrigatorio" }, { status: 400 });
  }

  try {
    const observacao = await criarTecnicoObservacao({ tecnicoId, autorId, autorNome, texto });
    return NextResponse.json({ observacao });
  } catch (err) {
    console.error("[api/painel/tecnico-observacoes] POST error", err);
    return NextResponse.json({ message: "Falha ao salvar observação", error: String(err) }, { status: 500 });
  }
}
