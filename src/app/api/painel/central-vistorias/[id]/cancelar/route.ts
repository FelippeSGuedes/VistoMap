import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";
import { cancelarVistoria } from "@/lib/glpi/painel";
import { cancelarDevolucoesPorVistoria } from "@/lib/glpi/devolucoes";
import { auditInsert } from "@/lib/glpi/audit";
import { sanitizeFolderName } from "@/lib/sanitize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_PATH =
  process.env.GLPI_UPLOAD_PATH ??
  "/var/www/html/glpi/plugins/vistomapprojetos/uploads";

// Mesmo volume que a aba nativa "VistoMap - Projetos" do GLPI lê pra achar
// o projeto.pdf (front/view.php do plugin). Sem apagar aqui, o PDF antigo
// sobrevive no disco e a aba recria "Em análise" sozinha na próxima vez que
// alguém só ABRIR a página — showProjectTab()/getOrCreateRecord() dispara
// isso automaticamente, sem precisar clicar em nada (achado em 2026-09-03).
const FILES_PATH = process.env.GLPI_FILES_PATH ?? "/files";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requirePainelRole(request, "admin");
  if (!auth.ok) return auth.response;
  const adminNome = auth.claims.email ?? "Administrador";
  const adminId = Number(auth.claims.sub) || 0;

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

  // Cancela devolução(ões) PENDENTE dessa vistoria — sem isso, a devolução
  // ficava presa em PENDENTE pra sempre mesmo com a vistoria já cancelada,
  // e isso bloqueava o técnico de iniciar vistorias NOVAS no dia seguinte
  // (fetchDevolucaoPendente/devolucaoEhDeOutroDia em /vistorias/[id]/iniciar).
  const devolucoesCanceladas = await cancelarDevolucoesPorVistoria(vistoriaId);

  // Remove arquivos físicos (fotos, vídeos, PDFs)
  const folder = sanitizeFolderName(ne.name);
  const dir = path.join(UPLOAD_PATH, folder);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch { /* pasta pode não existir */ }

  // Remove o projeto.pdf da aba nativa do GLPI — ver comentário no FILES_PATH.
  const projetoDir = path.join(FILES_PATH, folder);
  try {
    await fs.rm(projetoDir, { recursive: true, force: true });
  } catch { /* pasta pode não existir */ }

  void auditInsert({
    ator: { id: adminId, nome: adminNome, role: "admin" },
    acao: "dados-editados",
    alvo: { tipo: "vistoria", id: String(vistoriaId), label: ne.name },
    descricao: `Vistoria cancelada e devolvida para fila (A Vistoriar). Arquivos removidos.${
      devolucoesCanceladas > 0 ? ` ${devolucoesCanceladas} devolução(ões) pendente(s) anulada(s).` : ""
    }`,
  });

  return NextResponse.json({ ok: true });
}
