import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";
import { fetchRecusaPorId, reabrirRecusa } from "@/lib/glpi/recusas";
import { reatribuirVistoria, atualizarCamposVistoria } from "@/lib/glpi/painel";
import { auditInsert } from "@/lib/glpi/audit";
import { sendPushTo } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ReabrirBody {
  tecnicoId?: number;
  motivo?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * POST /api/painel/rejeitadas/[id]/reabrir (moderador+)
 *
 * "Reatribuir e reabrir" de Vistorias Rejeitadas — [id] é o id da RECUSA,
 * não da vistoria. Endpoint próprio (não reaproveita
 * /api/painel/central-vistorias/[id]/reatribuir): além de reatribuir o
 * técnico, opcionalmente corrige lat/long (motivo comum de rejeição — o
 * engenheiro não precisava mais ir no GLPI pra isso), marca a recusa como
 * REABERTA (sem isso a vistoria continuava contando como "rejeitada" nas
 * estatísticas/mapa mesmo depois de voltar pra fila) e avisa o técnico por
 * push — nada disso existia antes, a vistoria só "reaparecia" sem contexto.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePainelRole(request, "moderador");
  if (!auth.ok) return auth.response;
  const analistaNome = auth.claims.email ?? "Administrador";
  const analistaId = Number(auth.claims.sub) || 0;

  const recusaId = Number(params.id);
  if (!recusaId || !Number.isFinite(recusaId)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let body: ReabrirBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  if (!body.tecnicoId || body.tecnicoId <= 0) {
    return NextResponse.json({ message: "Técnico inválido" }, { status: 400 });
  }
  if (!body.motivo?.trim()) {
    return NextResponse.json({ message: "Motivo obrigatório" }, { status: 400 });
  }

  try {
    const recusa = await fetchRecusaPorId(recusaId);
    if (!recusa) return NextResponse.json({ message: "Recusa não encontrada" }, { status: 404 });
    if (recusa.status !== "APROVADO") {
      return NextResponse.json({ message: "Essa recusa já foi reaberta ou não está aprovada" }, { status: 409 });
    }

    const [ne] = await query<{ name: string }>(
      "SELECT name FROM glpi_networkequipments WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [recusa.vistoriaId]
    );
    if (!ne) return NextResponse.json({ message: "Equipamento não encontrado" }, { status: 404 });

    const [tec] = await query<{ name: string }>("SELECT name FROM glpi_users WHERE id = ? LIMIT 1", [
      body.tecnicoId,
    ]);

    let coordsAtualizadas = false;
    if (
      typeof body.latitude === "number" &&
      Number.isFinite(body.latitude) &&
      typeof body.longitude === "number" &&
      Number.isFinite(body.longitude)
    ) {
      await atualizarCamposVistoria(
        recusa.vistoriaId,
        { latitudefield: body.latitude.toFixed(6), longitudefield: body.longitude.toFixed(6) },
        false
      );
      coordsAtualizadas = true;
    }

    await reatribuirVistoria(recusa.vistoriaId, body.tecnicoId);
    await reabrirRecusa(recusaId);

    void sendPushTo({
      usersIds: [body.tecnicoId],
      title: "Vistoria retornou à sua lista",
      body: `${ne.name} voltou após ser rejeitada — ${body.motivo.trim()}`,
      data: { url: "/app/vistorias", vistoria_id: String(recusa.vistoriaId), tipo: "reabertura" },
    });

    void auditInsert({
      ator: { id: analistaId, nome: analistaNome, role: auth.claims.role ?? "admin" },
      acao: "vistoria-reaberta",
      alvo: { tipo: "vistoria", id: String(recusa.vistoriaId), label: ne.name },
      descricao: `Reaberta e atribuída para ${tec?.name ?? body.tecnicoId}${
        coordsAtualizadas ? " (coordenadas corrigidas)" : ""
      }. Motivo: ${body.motivo.trim()}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/painel/rejeitadas/reabrir] error", err);
    return NextResponse.json(
      { message: "Falha ao reabrir a vistoria", error: String(err) },
      { status: 500 }
    );
  }
}
