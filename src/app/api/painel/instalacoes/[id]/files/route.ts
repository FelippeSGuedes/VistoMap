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

// Nunca listar imagemN.* (fotos da Vistoria) — o mesmo NetworkEquipment
// passa pelas duas fases (vistoria → instalação) e a pasta de upload é
// compartilhada por nome de equipamento; só interessam as 7 fotos fixas
// da instalação (instalacao_foto1..7.*).
const INSTALACAO_FOTO_RE = /^instalacao_foto\d+\./i;

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Lista as 7 fotos fixas do módulo de Instalação pro painel administrativo —
 * mesmo padrão de src/app/api/painel/vistoria/[id]/files/route.ts (mesma
 * pasta de upload por equipamento, mesmo proxy /uploads/* → BASE_PATH),
 * só filtrando pelo prefixo instalacao_foto* pra não misturar com as fotos
 * da Vistoria que podem estar na mesma pasta.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
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
      return NextResponse.json({ equipamento: row.name, folder, items: [] });
    }

    const items = await Promise.all(
      entries
        .filter((name) => INSTALACAO_FOTO_RE.test(name))
        .map(async (name) => {
          try {
            const stat = await fs.stat(path.join(dir, name));
            const ext = path.extname(name).toLowerCase();
            const isImage = [".png", ".jpg", ".jpeg", ".webp"].includes(ext);
            return {
              name,
              url: `/uploads/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`,
              size: stat.size,
              modifiedAt: stat.mtime.toISOString(),
              kind: isImage ? "image" : "other",
            };
          } catch {
            return null;
          }
        })
    );

    // Ordena pelo número da foto (instalacao_foto1 antes de instalacao_foto2...).
    const sorted = items
      .filter((i): i is NonNullable<typeof i> => i != null)
      .sort((a, b) => {
        const na = Number(a.name.match(/(\d+)/)?.[1] ?? 0);
        const nb = Number(b.name.match(/(\d+)/)?.[1] ?? 0);
        return na - nb;
      });

    return NextResponse.json({ equipamento: row.name, folder, items: sorted });
  } catch (err) {
    console.error("[api/painel/instalacoes/files] error", err);
    return NextResponse.json(
      { message: "Falha ao listar arquivos", error: String(err) },
      { status: 500 }
    );
  }
}
