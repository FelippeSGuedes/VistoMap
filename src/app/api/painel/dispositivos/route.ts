import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { fetchAllBindingsAtivos } from "@/lib/glpi/deviceBinding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/painel/dispositivos — lista de vínculos ativos (admin). */
export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "admin");
  if (!auth.ok) return auth.response;

  try {
    const bindings = await fetchAllBindingsAtivos();
    return NextResponse.json(bindings);
  } catch (err) {
    console.error("[api/painel/dispositivos] GET error", err);
    return NextResponse.json(
      { message: "Falha ao carregar dispositivos", error: String(err) },
      { status: 500 }
    );
  }
}
