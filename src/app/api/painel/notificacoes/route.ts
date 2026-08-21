import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";
import { ensureOverrideTable } from "@/lib/ensureOverrideTable";
import { listRecusas } from "@/lib/glpi/recusas";
import { RECUSA_MOTIVO_LABEL, type RecusaMotivo } from "@/lib/glpi/recusaMotivos";
import { TABLE_FIELDS } from "@/lib/glpi/constants";
import { sanitizeFolderName } from "@/lib/sanitize";
import { signUploadUrl } from "@/lib/uploadUrl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface OverrideRequest {
  /** Recusas usam o id da tabela `recusas` — só é único DENTRO do mesmo `tipo`. */
  id: number;
  tipo: "override" | "recusa";
  vistoria_id: number;
  users_id: number;
  equipamento: string;
  tecnico_nome: string;
  justificativa: string;
  status: "PENDENTE" | "APROVADO" | "REPROVADO" | "REABERTA";
  motivo_reprovacao: string | null;
  distancia_m: number | null;
  exception_label: string | null;
  /** Só recusas têm foto própria — já vem assinada (nginx secure_link), pronta pra <img src>. */
  foto_url: string | null;
  /** Endereço/coordenadas vêm da vistoria (glpi_plugin_fields_...), não da tabela de solicitações. */
  endereco: string | null;
  municipio: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

/** Admin: GET /api/painel/notificacoes — junta overrides (fora do raio) + recusas de vistoria. */
export async function GET(request: Request) {
  const auth = await requirePainelRole(request, "moderador");
  if (!auth.ok) return auth.response;

  await ensureOverrideTable();

  const [overrideRows, recusas] = await Promise.all([
    query<Omit<OverrideRequest, "tipo" | "foto_url" | "endereco" | "municipio" | "latitude" | "longitude">>(
      `SELECT id, vistoria_id, users_id, equipamento, tecnico_nome, justificativa,
              status, motivo_reprovacao, distancia_m, exception_label, created_at, updated_at
       FROM \`glpi_plugin_vistomap_override_requests\`
       ORDER BY created_at DESC
       LIMIT 100`
    ),
    listRecusas({ limit: 100 }),
  ]);

  const base: Array<Omit<OverrideRequest, "endereco" | "municipio" | "latitude" | "longitude">> = [
    ...overrideRows.map((r) => ({ ...r, tipo: "override" as const, foto_url: null })),
    ...recusas.map((r) => ({
      id: r.id,
      tipo: "recusa" as const,
      vistoria_id: r.vistoriaId,
      users_id: r.tecnicoId,
      equipamento: r.equipamento,
      tecnico_nome: r.tecnicoNome,
      justificativa: r.justificativa,
      status: r.status,
      motivo_reprovacao: r.motivoReprovacao,
      distancia_m: null,
      exception_label: RECUSA_MOTIVO_LABEL[r.motivo as RecusaMotivo] ?? r.motivo,
      foto_url: r.fotoPath ? signUploadUrl(sanitizeFolderName(r.equipamento), r.fotoPath) : null,
      created_at: r.criadoEm,
      updated_at: r.resolvidoEm ?? r.criadoEm,
    })),
  ];

  // Endereço/município/coordenadas — busca em lote pelos vistoria_id
  // envolvidos, direto na tabela de campos do GLPI (as tabelas de
  // solicitação não guardam local nenhum).
  const vistoriaIds = [...new Set(base.map((r) => r.vistoria_id).filter((id) => id > 0))];
  const localById = new Map<
    number,
    { endereco: string | null; municipio: string | null; latitude: number | null; longitude: number | null }
  >();
  if (vistoriaIds.length > 0) {
    const placeholders = vistoriaIds.map(() => "?").join(",");
    const fieldRows = await query<{
      items_id: number;
      endereco: string | null;
      municipio: string | null;
      lat: string | null;
      lng: string | null;
    }>(
      `SELECT items_id,
              endereofield AS endereco,
              municipiofield AS municipio,
              REPLACE(latitudefield, ',', '.') + 0.0 AS lat,
              REPLACE(longitudefield, ',', '.') + 0.0 AS lng
       FROM \`${TABLE_FIELDS}\`
       WHERE items_id IN (${placeholders})`,
      vistoriaIds
    );
    for (const f of fieldRows) {
      localById.set(Number(f.items_id), {
        endereco: f.endereco,
        municipio: f.municipio,
        latitude: f.lat != null ? Number(f.lat) : null,
        longitude: f.lng != null ? Number(f.lng) : null,
      });
    }
  }

  const rows: OverrideRequest[] = base
    .map((r) => {
      const local = localById.get(r.vistoria_id);
      return {
        ...r,
        endereco: local?.endereco ?? null,
        municipio: local?.municipio ?? null,
        latitude: local?.latitude ?? null,
        longitude: local?.longitude ?? null,
      };
    })
    .sort((a, b) => {
      const pa = a.status === "PENDENTE" ? 0 : 1;
      const pb = b.status === "PENDENTE" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const pendentes = rows.filter((r) => r.status === "PENDENTE").length;

  return NextResponse.json({ requests: rows, pendentes });
}
