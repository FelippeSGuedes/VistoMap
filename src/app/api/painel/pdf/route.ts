import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Dentro do container o volume é montado em /files (ver docker-compose.gioc.yml)
const FILES_BASE = process.env.GLPI_FILES_PATH ?? "/files";

/** GET /api/painel/pdf?file=CAM-P-A-176/projeto.pdf */
export async function GET(req: NextRequest) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const fileParam = req.nextUrl.searchParams.get("file");
  if (!fileParam) {
    return NextResponse.json({ message: "Parâmetro 'file' obrigatório" }, { status: 400 });
  }

  // Sanitização: impede path traversal
  const normalized = path.normalize(fileParam).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.includes("..")) {
    return NextResponse.json({ message: "Caminho inválido" }, { status: 400 });
  }

  const fullPath = path.join(FILES_BASE, normalized);

  // Garante que o path resolvido ainda está dentro do FILES_BASE
  if (!fullPath.startsWith(path.resolve(FILES_BASE))) {
    return NextResponse.json({ message: "Acesso negado" }, { status: 403 });
  }

  try {
    const buf = await fs.readFile(fullPath);
    const filename = path.basename(fullPath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ message: "Arquivo não encontrado" }, { status: 404 });
  }
}
