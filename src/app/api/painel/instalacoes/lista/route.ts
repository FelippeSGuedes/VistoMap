import { NextResponse } from "next/server";
import {
  countInstalacoesPainel,
  listInstalacoesPainel,
  type Instalacao,
  type InstalacaoPainelStatus,
} from "@/lib/glpi/instalacoes";
import { requirePainelRole } from "@/lib/painel-auth";
import type { InstalacaoPainelItem, InstalacaoPainelListResponse } from "@/types/painel-instalacoes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_STATUS: InstalacaoPainelStatus[] = ["liberado", "em-instalacao", "instalado"];

function toPainelItem(i: Instalacao): InstalacaoPainelItem {
  return {
    id: i.id,
    equipamento: i.equipamento,
    tipoEquipamento: i.tipoEquipamento,
    statusGeralId: i.statusGeralId,
    statusGeralNome: i.statusGeralNome,
    municipio: i.contexto.municipio,
    endereco: i.contexto.endereco,
    psPoste: i.contexto.psPoste,
    alturaPoste: i.contexto.alturaPoste,
    instalador: i.instalador,
    dataInstalacao: i.dataInstalacao,
    checklist: {
      cintaInstalada: i.checklist.cintaInstalada,
      equipamentoFixado: i.checklist.equipamentoFixado,
      cabeamentoOrganizado: i.checklist.cabeamentoOrganizado,
      alimentacaoValidada: i.checklist.alimentacaoValidada,
      equipamentoEnergizado: i.checklist.equipamentoEnergizado,
      registroFotografico: i.checklist.registroFotografico,
    },
    validadorCpfl: i.validadorCpfl ? { nome: i.validadorCpfl.nome, status: i.validadorCpfl.status } : null,
  };
}

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  if (!status || !VALID_STATUS.includes(status as InstalacaoPainelStatus)) {
    return NextResponse.json({ message: "Parâmetro 'status' inválido ou ausente" }, { status: 400 });
  }

  const municipio = url.searchParams.get("municipio") ?? undefined;
  const instaladorIdRaw = url.searchParams.get("instalador_id");
  const instaladorId = instaladorIdRaw ? Number(instaladorIdRaw) : undefined;
  const query = url.searchParams.get("q") ?? undefined;
  const desde = url.searchParams.get("desde") ?? undefined;
  const ate = url.searchParams.get("ate") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const offsetRaw = url.searchParams.get("offset");
  const offset = offsetRaw ? Number(offsetRaw) : undefined;

  const filters = {
    status: status as InstalacaoPainelStatus,
    municipio,
    instaladorId,
    query,
    desde,
    ate,
    limit,
    offset,
  };

  try {
    const [items, total] = await Promise.all([
      listInstalacoesPainel(filters),
      countInstalacoesPainel(filters),
    ]);
    const response: InstalacaoPainelListResponse = { items: items.map(toPainelItem), total };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[api/painel/instalacoes/lista] error", err);
    return NextResponse.json(
      { message: "Falha ao carregar lista de instalações", error: String(err) },
      { status: 500 }
    );
  }
}
