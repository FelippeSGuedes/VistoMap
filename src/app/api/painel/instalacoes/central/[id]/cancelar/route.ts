import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";
import { cancelarInstalacao } from "@/lib/glpi/instalacoes";
import { deleteInstalacaoQueueByItemsId } from "@/lib/glpi/instalacaoQueue";
import { auditInsert } from "@/lib/glpi/audit";
import { sanitizeFolderName } from "@/lib/sanitize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_PATH =
  process.env.GLPI_UPLOAD_PATH ??
  "/var/www/html/glpi/plugins/vistomapprojetos/uploads";

const INSTALACAO_FOTO_RE = /^instalacao_foto\d+\./i;

/**
 * POST /api/painel/instalacoes/central/[id]/cancelar (admin only)
 *
 * Reseta o poste pro início do módulo (LIBERADO), desvincula o instalador,
 * limpa checklist/tensão/data, remove a linha da fila de PDF e apaga só os
 * arquivos `instalacao_foto*` da pasta do equipamento — NUNCA a pasta
 * inteira (a mesma pasta guarda as fotos `imagemN.*` já aprovadas da
 * Vistoria, que não podem ser apagadas por uma ação da Instalação).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(request, "admin");
  if (!auth.ok) return auth.response;
  const adminNome = auth.claims.email ?? "Administrador";
  const adminId = Number(auth.claims.sub) || 0;

  const itemsId = Number(params.id);
  if (!itemsId || !Number.isFinite(itemsId)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  const [ne] = await query<{ name: string }>(
    "SELECT name FROM glpi_networkequipments WHERE id = ? AND is_deleted = 0 LIMIT 1",
    [itemsId]
  );
  if (!ne) return NextResponse.json({ message: "Equipamento não encontrado" }, { status: 404 });

  await cancelarInstalacao(itemsId);
  await deleteInstalacaoQueueByItemsId(itemsId);

  const folder = sanitizeFolderName(ne.name);
  const dir = path.join(UPLOAD_PATH, folder);
  try {
    const entries = await fs.readdir(dir);
    await Promise.all(
      entries
        .filter((name) => INSTALACAO_FOTO_RE.test(name))
        .map((name) => fs.rm(path.join(dir, name), { force: true }).catch(() => {}))
    );
  } catch {
    // pasta pode não existir
  }

  void auditInsert({
    ator: { id: adminId, nome: adminNome, role: auth.claims.role ?? "admin" },
    acao: "instalacao-cancelada",
    alvo: { tipo: "instalacao", id: String(itemsId), label: ne.name },
    descricao: "Instalação cancelada e devolvida pra fila (Liberado). Fotos da instalação removidas.",
  });

  return NextResponse.json({ ok: true });
}
