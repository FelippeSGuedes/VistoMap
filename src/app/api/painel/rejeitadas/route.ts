import { NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { listRecusas } from "@/lib/glpi/recusas";
import { sanitizeFolderName } from "@/lib/sanitize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/rejeitadas  (admin)
 *
 * Vistorias com recusa APROVADA — fora de circulação, sem técnico
 * atribuído. Tela de consulta/histórico + ação de reatribuir (via a
 * mesma rota de Central de Vistorias) se o admin decidir reabrir.
 */
export async function GET(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  try {
    const claims = await verifySessionJwt(token);
    if (claims.role !== "admin") return NextResponse.json({ message: "Acesso negado" }, { status: 403 });
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  try {
    const rejeitadas = await listRecusas({ status: "APROVADO", limit: 300 });
    const comFotoUrl = rejeitadas.map((r) => ({
      ...r,
      fotoUrl: r.fotoPath
        ? `/uploads/${encodeURIComponent(sanitizeFolderName(r.equipamento))}/${encodeURIComponent(r.fotoPath)}`
        : null,
    }));
    return NextResponse.json({ rejeitadas: comFotoUrl });
  } catch (err) {
    return NextResponse.json({ message: "Erro ao listar rejeitadas", error: String(err) }, { status: 500 });
  }
}
