import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel/alertas  (painel — leitura+)
 *
 * Feed leve dos eventos operacionais importantes das últimas horas, tirado
 * do audit log (fonte única — todos já são gravados lá). O painel faz
 * polling disso e dispara alerta na tela + som quando aparece um id novo.
 */
const ACOES = [
  "recusa-solicitada",
  "override-solicitado",
  "vistoria-finalizada",
  "devolucao-resolvida",
] as const;

export interface AlertaEvento {
  id: number;
  ts: string;
  acao: (typeof ACOES)[number] | string;
  vistoriaId: string;
  equipamento: string;
  tecnico: string;
}

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  try {
    const rows = await query<{
      id: number;
      ts: string;
      acao: string;
      alvo_id: string | null;
      alvo_label: string | null;
      ator_nome: string | null;
    }>(
      `
        SELECT id, ts, acao, alvo_id, alvo_label, ator_nome
          FROM \`glpi_plugin_vistomap_audit\`
         WHERE acao IN (?, ?, ?, ?)
           AND ts >= NOW() - INTERVAL 6 HOUR
         ORDER BY id DESC
         LIMIT 40
      `,
      [...ACOES]
    );

    const eventos: AlertaEvento[] = rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      acao: r.acao,
      vistoriaId: String(r.alvo_id ?? ""),
      equipamento: r.alvo_label ?? (r.alvo_id ? `NE-${r.alvo_id}` : "—"),
      tecnico: r.ator_nome ?? "—",
    }));

    return NextResponse.json({ eventos });
  } catch (err) {
    // Tabela de audit pode não existir em dev — devolve vazio em vez de 500.
    if (String(err).includes("doesn't exist")) {
      return NextResponse.json({ eventos: [] });
    }
    return NextResponse.json(
      { message: "Falha ao carregar alertas", error: String(err) },
      { status: 500 }
    );
  }
}
