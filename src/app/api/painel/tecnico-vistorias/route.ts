import { NextRequest, NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { fetchVistoriasTecnicoPeriodo } from "@/lib/glpi/painel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/tecnico-vistorias?users_id=X&desde=YYYY-MM-DD&ate=YYYY-MM-DD&concessionaria=
 *
 * Vistorias de UM técnico no período — usado pela Análise Operacional dos
 * Técnicos (/painel): KPIs, rota no mapa, timeline, donut, cidades
 * visitadas. Ver fetchVistoriasTecnicoPeriodo() pra regra de inclusão
 * ("concluída no período OU em aberto agora").
 */
export async function GET(req: NextRequest) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const usersIdParam = req.nextUrl.searchParams.get("users_id");
  const usersId = Number(usersIdParam);
  if (!usersIdParam || !Number.isFinite(usersId) || usersId <= 0) {
    return NextResponse.json({ message: "users_id obrigatorio" }, { status: 400 });
  }

  const desde = req.nextUrl.searchParams.get("desde");
  const ate = req.nextUrl.searchParams.get("ate");
  if (!desde || !ate) {
    return NextResponse.json({ message: "desde/ate obrigatorios" }, { status: 400 });
  }

  const concessionaria = req.nextUrl.searchParams.get("concessionaria") || undefined;

  try {
    const vistorias = await fetchVistoriasTecnicoPeriodo(usersId, desde, ate, concessionaria);
    return NextResponse.json({ vistorias });
  } catch (err) {
    console.error("[api/painel/tecnico-vistorias] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar vistorias do técnico", error: String(err) },
      { status: 500 }
    );
  }
}
