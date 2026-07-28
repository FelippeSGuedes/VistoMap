import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { sanitizeFolderName } from "@/lib/sanitize";
import { query } from "@/lib/db";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE_PATH =
  process.env.GLPI_UPLOAD_PATH ??
  "/var/www/html/glpi/plugins/vistomapprojetos/uploads";

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-|^rev-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Lista arquivos da pasta do equipamento (fotos imagem1..5 + video360.mp4 + PDFs).
 * Retorna metadata para o painel renderizar previews.
 *
 * URLs publicas: assumem proxy Caddy em /uploads/* → BASE_PATH.
 * Em dev local sem Caddy, retorna apenas os paths absolutos (preview falha).
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }
  try {
    const [row] = await query<{ name: string }>(
      `SELECT name FROM glpi_networkequipments WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!row) return NextResponse.json({ message: "Equipamento não encontrado" }, { status: 404 });

    const folder = sanitizeFolderName(row.name);
    const dir = path.join(BASE_PATH, folder);

    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      // pasta inexistente — retorna vazio.
      return NextResponse.json({
        equipamento: row.name,
        folder,
        items: [],
      });
    }

    const items = await Promise.all(
      entries.map(async (name) => {
        try {
          const stat = await fs.stat(path.join(dir, name));
          const ext = path.extname(name).toLowerCase();
          const isImage = [".png", ".jpg", ".jpeg", ".webp"].includes(ext);
          const isVideo = [".mp4", ".mov", ".webm"].includes(ext);
          const isPdf = ext === ".pdf";
          return {
            name,
            url: `/uploads/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            kind: isImage ? "image" : isVideo ? "video" : isPdf ? "pdf" : "other",
          };
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json({
      equipamento: row.name,
      folder,
      items: items.filter(Boolean),
    });
  } catch (err) {
    console.error("[api/painel/vistoria/files] error", err);
    return NextResponse.json(
      { message: "Falha ao listar arquivos", error: String(err) },
      { status: 500 }
    );
  }
}
