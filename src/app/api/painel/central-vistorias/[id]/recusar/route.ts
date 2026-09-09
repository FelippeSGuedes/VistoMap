import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { query, execute } from "@/lib/db";
import { TABLE_FIELDS } from "@/lib/glpi/constants";
import { criarRecusa, fetchRecusaPendentePorVistoria, resolverRecusa } from "@/lib/glpi/recusas";
import { auditInsert } from "@/lib/glpi/audit";
import { sendPushTo } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RecusarBody {
  justificativa?: string;
}

/**
 * POST /api/painel/central-vistorias/[id]/recusar  (moderador)
 *
 * Recusa uma vistoria EM NOME do técnico — pra quando ele fica incapacitado
 * de fazer isso pelo próprio app (acidente, celular quebrado/perdido, sem
 * contato). Reaproveita a mesma tabela de recusas do técnico
 * (glpi_plugin_vistomap_recusas), mas em vez de nascer PENDENTE esperando
 * um analista aprovar (fluxo normal em [id]/recusar do app), já nasce
 * APROVADO — quem está executando a ação já É o analista.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(request, "moderador");
  if (!auth.ok) return auth.response;
  const adminNome = auth.claims.email ?? "Administrador";
  const adminId = Number(auth.claims.sub) || 0;

  const vistoriaId = Number(params.id);
  if (!vistoriaId || !Number.isFinite(vistoriaId)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let body: RecusarBody = {};
  try {
    body = await request.json();
  } catch {
    /* validado abaixo */
  }
  const justificativa = (body.justificativa ?? "").trim();
  if (!justificativa) {
    return NextResponse.json({ message: "Descreva o motivo da recusa" }, { status: 400 });
  }

  const [row] = await query<{ equipamento: string; tecnico_id: number | null; tecnico_nome: string | null }>(
    `SELECT ne.name AS equipamento, f.users_id_vistoriadorafield AS tecnico_id, u.name AS tecnico_nome
       FROM glpi_networkequipments ne
       JOIN glpi_plugin_fields_networkequipmentdispositivosderedes f ON f.items_id = ne.id
       LEFT JOIN glpi_users u ON u.id = f.users_id_vistoriadorafield
      WHERE ne.id = ? AND ne.is_deleted = 0
      LIMIT 1`,
    [vistoriaId]
  );
  if (!row) return NextResponse.json({ message: "Equipamento não encontrado" }, { status: 404 });
  if (!row.tecnico_id) {
    return NextResponse.json({ message: "Vistoria não tem técnico atribuído" }, { status: 409 });
  }

  const existente = await fetchRecusaPendentePorVistoria(vistoriaId);
  if (existente) {
    return NextResponse.json(
      { message: "Já existe uma recusa pendente pra essa vistoria", recusaId: existente.id },
      { status: 409 }
    );
  }

  const recusaId = await criarRecusa({
    vistoriaId,
    equipamento: row.equipamento,
    tecnicoId: row.tecnico_id,
    tecnicoNome: row.tecnico_nome ?? "—",
    motivo: "TECNICO_INCAPACITADO",
    respostas: {},
    justificativa: `Recusada pelo analista em nome do técnico (incapacitado de agir pelo app). ${justificativa}`,
  });

  // Nasce direto aprovada — quem executa já é o analista, não precisa de
  // uma segunda aprovação de outro analista pra sair de circulação.
  await resolverRecusa(recusaId, "APROVADO");

  // Some da fila do técnico, igual à recusa normal (coluna NOT NULL — 0
  // é a convenção GLPI pra "sem responsável", nunca NULL).
  await execute(
    `UPDATE \`${TABLE_FIELDS}\` SET users_id_vistoriadorafield = 0 WHERE items_id = ?`,
    [vistoriaId]
  );

  void auditInsert({
    ator: { id: adminId, nome: adminNome, role: "admin" },
    acao: "recusa-aprovada",
    alvo: { tipo: "vistoria", id: String(vistoriaId), label: row.equipamento },
    descricao: `Vistoria recusada pelo analista em nome de ${row.tecnico_nome ?? "técnico"} (incapacitado). ${justificativa}`,
  });

  void sendPushTo({
    usersIds: [row.tecnico_id],
    title: "Vistoria recusada pelo analista",
    body: `${row.equipamento} foi recusada em seu nome e saiu da sua fila.`,
    data: { url: "/app/vistorias", vistoria_id: String(vistoriaId), tipo: "recusa" },
  });

  return NextResponse.json({ ok: true, recusaId });
}
