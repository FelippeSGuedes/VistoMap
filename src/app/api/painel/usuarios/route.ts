import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { query } from "@/lib/db";
import { getCategoriaPrefs, countSubscriptions } from "@/lib/glpi/pushPrefs";
import type { NotifCategoria } from "@/lib/notifCategorias";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type PerfilUsuario = "Administrador" | "Moderador" | "Leitura" | "Técnico";

export interface UsuarioPainel {
  id: number;
  nome: string;
  username: string;
  email: string | null;
  perfil: PerfilUsuario;
  ativo: boolean;
  /** Só analistas — preferência de web push por categoria, decidida pelo admin. */
  categorias?: Record<NotifCategoria, boolean>;
  /** Só analistas — quantos navegadores já se inscreveram. */
  navegadores?: number;
}

const G_ADMIN = "VistoMap-Administradores";
const G_MOD = "VistoMap-Moderador";
const G_LEITURA = "VistoMap - Leitura";
const G_TEC = "VistoMap-Tecnicos";
const G_TEC_ALT = "VistoMap-Técnicos";

interface Row {
  id: number;
  name: string;
  firstname: string | null;
  realname: string | null;
  email: string | null;
  is_active: number;
  grupos: string | null;
}

function nomeDe(r: Row): string {
  return `${r.firstname ?? ""} ${r.realname ?? ""}`.trim() || r.name;
}

/** Perfil do painel por prioridade admin > moderador > leitura. */
function perfilAnalista(grupos: Set<string>): PerfilUsuario {
  if (grupos.has(G_ADMIN)) return "Administrador";
  if (grupos.has(G_MOD)) return "Moderador";
  return "Leitura";
}

export async function GET(req: Request) {
  const auth = await requirePainelRole(req, "moderador");
  if (!auth.ok) return auth.response;

  try {
    const rows = await query<Row>(
      `
        SELECT u.id, u.name, u.firstname, u.realname,
               (SELECT email FROM glpi_useremails WHERE users_id = u.id ORDER BY is_default DESC, id ASC LIMIT 1) AS email,
               u.is_active,
               GROUP_CONCAT(g.name) AS grupos
          FROM glpi_users u
          INNER JOIN glpi_groups_users gu ON gu.users_id = u.id
          INNER JOIN glpi_groups g ON g.id = gu.groups_id
                 AND g.name IN (?, ?, ?, ?, ?)
         WHERE u.is_deleted = 0
         GROUP BY u.id
         ORDER BY u.realname, u.firstname, u.name
      `,
      [G_ADMIN, G_MOD, G_LEITURA, G_TEC, G_TEC_ALT]
    );

    const tecnicos: UsuarioPainel[] = [];
    const analistasRaw: Array<{ r: Row; grupos: Set<string> }> = [];

    for (const r of rows) {
      const grupos = new Set((r.grupos ?? "").split(",").filter(Boolean));
      const ehAnalista = grupos.has(G_ADMIN) || grupos.has(G_MOD) || grupos.has(G_LEITURA);
      const ehTecnico = grupos.has(G_TEC) || grupos.has(G_TEC_ALT);

      // Analista tem prioridade de exibição (se alguém for os dois, aparece nos 2).
      if (ehAnalista) analistasRaw.push({ r, grupos });
      if (ehTecnico) {
        tecnicos.push({
          id: r.id,
          nome: nomeDe(r),
          username: r.name,
          email: r.email,
          perfil: "Técnico",
          ativo: Number(r.is_active) === 1,
        });
      }
    }

    const analistaIds = analistasRaw.map((a) => a.r.id);
    const [prefs, subs] = await Promise.all([
      getCategoriaPrefs(analistaIds),
      countSubscriptions(analistaIds),
    ]);

    const analistas: UsuarioPainel[] = analistasRaw.map(({ r, grupos }) => ({
      id: r.id,
      nome: nomeDe(r),
      username: r.name,
      email: r.email,
      perfil: perfilAnalista(grupos),
      ativo: Number(r.is_active) === 1,
      categorias: prefs.get(r.id),
      navegadores: subs.get(r.id) ?? 0,
    }));

    return NextResponse.json({ analistas, tecnicos });
  } catch (err) {
    return NextResponse.json(
      { message: "Falha ao listar usuários", error: String(err) },
      { status: 500 }
    );
  }
}
