import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { verifySessionJwt } from "@/lib/jwt";
import { query } from "@/lib/db";
import { cancelarVistoria } from "@/lib/glpi/painel";
import { auditInsert } from "@/lib/glpi/audit";
import { sanitizeFolderName } from "@/lib/sanitize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_PATH =
  process.env.GLPI_UPLOAD_PATH ??
  "/var/www/html/glpi/plugins/vistomapprojetos/uploads";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ message: "Não autenticado" }, { status: 401 });

  let adminNome = "Administrador";
  let adminId = 0;
  try {
    const claims = await verifySessionJwt(token);
    if (claims.role !== "admin") return NextResponse.json({ message: "Acesso negado" }, { status: 403 });
    adminNome = claims.email ?? "Administrador";
    adminId = Number(claims.sub) || 0;
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  const vistoriaId = Number(params.id);
  if (!vistoriaId || !Number.isFinite(vistoriaId)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  const [ne] = await query<{ name: string }>(
    "SELECT name FROM glpi_networkequipments WHERE id = ? AND is_deleted = 0 LIMIT 1",
    [vistoriaId]
  );
  if (!ne) return NextResponse.json({ message: "Equipamento não encontrado" }, { status: 404 });

  // Reset GLPI + remove projeto aux
  await cancelarVistoria(vistoriaId);

  // Remove arquivos físicos (fotos, vídeos, PDFs)
  const folder = sanitizeFolderName(ne.name);
  const dir = path.join(UPLOAD_PATH, folder);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch { /* pasta pode não existir */ }

  void auditInsert({
    ator: { id: adminId, nome: adminNome, role: "admin" },
    acao: "dados-editados",
    alvo: { tipo: "vistoria", id: String(vistoriaId), label: ne.name },
    descricao: `Vistoria cancelada e devolvida para fila (A Vistoriar). Arquivos removidos.`,
  });

  return NextResponse.json({ ok: true });
}
