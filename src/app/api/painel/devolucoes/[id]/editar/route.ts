import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";
import { fetchDevolucaoPorId, editarDevolucao } from "@/lib/glpi/devolucoes";
import { devolucaoPrecisaDeslocamento } from "@/lib/glpi/devolucaoItens";
import { trocarTecnicoResponsavel } from "@/lib/glpi/painel";
import { auditInsert } from "@/lib/glpi/audit";
import { sendPushTo } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface EditarBody {
  itens?: string[];
  motivos?: string[];
  motivoOutro?: string;
  tecnicoId?: number;
}

/**
 * POST /api/painel/devolucoes/[id]/editar  (moderador)
 *
 * Corrige os itens/motivos apontados numa devolução PENDENTE, e/ou
 * reatribui pra outro técnico o responsável por resolver — sem mexer na
 * situação da vistoria (continua Devolvida para Correção). Reatribuir aqui
 * também troca o vistoriador na vistoria (senão o novo técnico não vê a
 * vistoria na fila dele pra corrigir).
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requirePainelRole(request, "moderador");
  if (!auth.ok) return auth.response;
  const adminNome = auth.claims.email ?? "Administrador";
  const adminId = Number(auth.claims.sub) || 0;

  const id = Number(params.id);
  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  let body: EditarBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const itens = Array.isArray(body.itens) ? body.itens.filter((i) => typeof i === "string" && i.trim()) : [];
  const motivos = Array.isArray(body.motivos) ? body.motivos.filter((m) => typeof m === "string" && m.trim()) : [];
  const motivoOutro = (body.motivoOutro ?? "").trim() || null;

  if (itens.length === 0) {
    return NextResponse.json({ message: "Selecione ao menos um item errado" }, { status: 400 });
  }
  if (motivos.length === 0) {
    return NextResponse.json({ message: "Selecione ao menos um motivo" }, { status: 400 });
  }
  if (motivos.includes("Outro") && !motivoOutro) {
    return NextResponse.json({ message: "Descreva o motivo em \"Outro\"" }, { status: 400 });
  }
  const novoTecnicoId =
    typeof body.tecnicoId === "number" && body.tecnicoId > 0 ? body.tecnicoId : undefined;

  try {
    const devolucao = await fetchDevolucaoPorId(id);
    if (!devolucao) return NextResponse.json({ message: "Devolução não encontrada" }, { status: 404 });
    if (devolucao.status !== "PENDENTE") {
      return NextResponse.json({ message: "Essa devolução não está mais pendente" }, { status: 409 });
    }

    const tecnicoMudou = novoTecnicoId != null && novoTecnicoId !== devolucao.tecnicoId;
    let tecnicoFinalId = devolucao.tecnicoId;
    let tecnicoFinalNome = devolucao.tecnicoNome;

    if (tecnicoMudou) {
      const [novoTec] = await query<{ name: string }>("SELECT name FROM glpi_users WHERE id = ? LIMIT 1", [
        novoTecnicoId,
      ]);
      if (!novoTec) return NextResponse.json({ message: "Técnico inválido" }, { status: 400 });
      tecnicoFinalId = novoTecnicoId!;
      tecnicoFinalNome = novoTec.name;
      await trocarTecnicoResponsavel(devolucao.vistoriaId, novoTecnicoId!);
    }

    const precisaDeslocamento = devolucaoPrecisaDeslocamento(itens);

    await editarDevolucao(id, {
      itens,
      motivos,
      motivoOutro,
      precisaDeslocamento,
      tecnicoId: tecnicoFinalId,
      tecnicoNome: tecnicoFinalNome,
    });

    if (tecnicoMudou && tecnicoFinalId) {
      void sendPushTo({
        usersIds: [tecnicoFinalId],
        title: "Devolução reatribuída para você",
        body: `${devolucao.equipamento} precisa de correção — ${motivos[0]}${motivos.length > 1 ? ` +${motivos.length - 1}` : ""}`,
        data: { url: "/app/vistorias", vistoria_id: String(devolucao.vistoriaId), tipo: "devolucao" },
      });
    }

    void auditInsert({
      ator: { id: adminId, nome: adminNome, role: "admin" },
      acao: "devolucao-editada",
      alvo: { tipo: "vistoria", id: String(devolucao.vistoriaId), label: devolucao.equipamento },
      descricao: `Devolução #${id} editada — ${itens.length} item(ns): ${motivos.join(", ")}${
        tecnicoMudou ? ` — redirecionada para ${tecnicoFinalNome ?? novoTecnicoId}` : ""
      }`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/painel/devolucoes/editar] error", err);
    return NextResponse.json(
      { message: "Falha ao editar devolução", error: String(err) },
      { status: 500 }
    );
  }
}
