import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePainelRole } from "@/lib/painel-auth";
import { TABLE_FIELDS, TABLE_NE, TABLE_USERS, SITUACAO_COLUMN } from "@/lib/glpi/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TABLE_AUDIT = "glpi_plugin_vistomap_audit";

export interface VistoriaAndamento {
  id: number;
  glpiId: string;
  equipamento: string;
  municipio: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  situacao_id: number;
  situacao: "Em Deslocamento" | "Em Vistoria" | "Em Revisita";
  tecnico_id: number | null;
  tecnico_nome: string | null;
  tecnico_email: string | null;
  iniciado_em: string | null;
  deslocamento_em: string | null;
  tempo_decorrido_min: number | null;
}

interface RawRow {
  id: number;
  name: string;
  municipio: string | null;
  endereco: string | null;
  latitude: string | null;
  longitude: string | null;
  situacao_id: number | null;
  tecnico_id: number | null;
  tecnico_nome: string | null;
  tecnico_email: string | null;
  iniciado_em: string | null;
  deslocamento_em: string | null;
}

function situacaoLabel(id: number): VistoriaAndamento["situacao"] {
  if (id === 7) return "Em Deslocamento";
  if (id === 5) return "Em Revisita";
  return "Em Vistoria";
}

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const rows = await query<RawRow>(
      `
      SELECT
        ne.id,
        ne.name,
        f.municipiofield          AS municipio,
        f.endereofield            AS endereco,
        REPLACE(f.latitudefield,  ',', '.') + 0.0 AS latitude,
        REPLACE(f.longitudefield, ',', '.') + 0.0 AS longitude,
        f.\`${SITUACAO_COLUMN}\`  AS situacao_id,
        u.id                      AS tecnico_id,
        CONCAT(COALESCE(u.firstname,''), ' ', COALESCE(u.realname,'')) AS tecnico_nome,
        ue.email                  AS tecnico_email,
        aud_ini.ts                AS iniciado_em,
        aud_des.ts                AS deslocamento_em
      FROM \`${TABLE_NE}\` ne
      INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
      LEFT JOIN \`${TABLE_USERS}\` u ON u.id = f.users_id_vistoriadorafield
      LEFT JOIN glpi_useremails ue ON ue.users_id = u.id AND ue.is_default = 1
      LEFT JOIN \`${TABLE_AUDIT}\` aud_ini
        ON aud_ini.alvo_id = CAST(ne.id AS CHAR)
        AND aud_ini.acao = 'vistoria-iniciada'
        AND aud_ini.id = (
          SELECT MAX(a2.id) FROM \`${TABLE_AUDIT}\` a2
          WHERE a2.alvo_id = CAST(ne.id AS CHAR) AND a2.acao = 'vistoria-iniciada'
        )
      LEFT JOIN \`${TABLE_AUDIT}\` aud_des
        ON aud_des.alvo_id = CAST(ne.id AS CHAR)
        AND aud_des.acao = 'vistoria-em-deslocamento'
        AND aud_des.id = (
          SELECT MAX(a3.id) FROM \`${TABLE_AUDIT}\` a3
          WHERE a3.alvo_id = CAST(ne.id AS CHAR) AND a3.acao = 'vistoria-em-deslocamento'
        )
      WHERE ne.is_deleted = 0
        AND f.\`${SITUACAO_COLUMN}\` IN (2, 5, 7)
        -- Impedimento/recusa nunca muda a situação nativa (é só um sinal
        -- derivado no mapa/ocorrências) — sem esse filtro, um equipamento
        -- barrado ficava "Em Andamento" pra sempre, mesmo dias depois de
        -- resolvido, porque o técnico já parou de vistoriar mas o campo
        -- de situação continuava travado no valor de antes (achado
        -- 2026-09-15: 9 equipamentos presos, um deles há 5 dias).
        -- PENDENTE (aguardando decisão) e APROVADO (decidido, fora de
        -- circulação) saem daqui; REPROVADO não — a vistoria volta pro
        -- mesmo técnico tentar de novo, e aí sim está em andamento.
        AND NOT EXISTS (
          SELECT 1 FROM \`glpi_plugin_vistomap_recusas\` rec
           WHERE rec.vistoria_id = ne.id AND rec.status IN ('PENDENTE', 'APROVADO')
        )
      ORDER BY COALESCE(aud_ini.ts, aud_des.ts, now()) DESC
      LIMIT 200
      `
    );

    const items: VistoriaAndamento[] = rows.map((r) => {
      const sitId = Number(r.situacao_id ?? 2);
      const refTs = r.iniciado_em ?? r.deslocamento_em;
      const tempoMin = refTs
        ? Math.round((Date.now() - new Date(refTs).getTime()) / 60000)
        : null;

      return {
        id: r.id,
        glpiId: `NE-${r.id}`,
        equipamento: r.name,
        municipio: r.municipio ?? null,
        endereco: r.endereco ?? null,
        latitude: r.latitude ? Number(r.latitude) : null,
        longitude: r.longitude ? Number(r.longitude) : null,
        situacao_id: sitId,
        situacao: situacaoLabel(sitId),
        tecnico_id: r.tecnico_id ?? null,
        tecnico_nome: r.tecnico_nome?.trim() || null,
        tecnico_email: r.tecnico_email ?? null,
        iniciado_em: r.iniciado_em ?? null,
        deslocamento_em: r.deslocamento_em ?? null,
        tempo_decorrido_min: tempoMin,
      };
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("[api/painel/andamento] error", error);
    return NextResponse.json({ message: "Erro interno" }, { status: 500 });
  }
}
