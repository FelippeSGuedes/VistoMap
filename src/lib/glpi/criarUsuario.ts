import "server-only";
import bcrypt from "bcryptjs";
import { execute, query } from "@/lib/db";

/**
 * Criação de usuário GLPI (a API do GLPI está desligada, então inserimos
 * direto — replicando como um usuário existente é montado: auth local
 * authtype=1, entidade 0 (GIOC), perfil em glpi_profiles_users e grupo em
 * glpi_groups_users). A role do VistoMap vem do GRUPO.
 */

export type TipoColaborador = "tecnico" | "administrador" | "moderador" | "leitura";

export interface TipoCfg {
  label: string;
  grupoId: number;   // grupo GLPI que define a role no VistoMap
  profileId: number; // perfil GLPI (pra conta ser válida/logável no GLPI)
  /** Onde a pessoa acessa (vai no e-mail). */
  destino: "app" | "painel";
}

export const TIPO_CFG: Record<TipoColaborador, TipoCfg> = {
  tecnico:       { label: "Técnico",       grupoId: 1, profileId: 12, destino: "app" },
  administrador: { label: "Administrador", grupoId: 2, profileId: 11, destino: "painel" },
  moderador:     { label: "Moderador",     grupoId: 6, profileId: 11, destino: "painel" },
  leitura:       { label: "Leitura",       grupoId: 3, profileId: 10, destino: "painel" },
};

/** Senha padrão: Nsn#<matricula>2026. */
export function montarSenha(matricula: string): string {
  return `Nsn#${matricula.trim()}2026`;
}

/** GLPI usa bcrypt $2y$ (PHP). bcryptjs gera $2b$ — troca o prefixo. */
async function hashSenhaGlpi(plain: string): Promise<string> {
  const h = await bcrypt.hash(plain, 10);
  return h.replace(/^\$2b\$/, "$2y$");
}

export async function usernameExiste(username: string): Promise<boolean> {
  const rows = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM glpi_users WHERE name = ?`,
    [username.trim()]
  );
  return (rows[0]?.n ?? 0) > 0;
}

export async function emailExiste(email: string): Promise<boolean> {
  const rows = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM glpi_useremails WHERE email = ?`,
    [email.trim()]
  );
  return (rows[0]?.n ?? 0) > 0;
}

export interface CriarUsuarioInput {
  username: string;
  nome: string; // nome completo
  email: string;
  matricula: string;
  tipo: TipoColaborador;
}

export interface CriarUsuarioResult {
  userId: number;
  username: string;
  senha: string; // texto puro (pro e-mail)
  tipo: TipoColaborador;
}

export async function criarUsuarioGlpi(
  input: CriarUsuarioInput
): Promise<CriarUsuarioResult> {
  const cfg = TIPO_CFG[input.tipo];
  const username = input.username.trim();
  const email = input.email.trim();
  const matricula = input.matricula.trim();
  const senha = montarSenha(matricula);
  const senhaHash = await hashSenhaGlpi(senha);

  const partes = input.nome.trim().split(/\s+/);
  const firstname = partes[0] ?? "";
  const realname = partes.slice(1).join(" ") || firstname;

  // 1. Usuário
  const { insertId: userId } = await execute(
    `INSERT INTO glpi_users
       (name, password, realname, firstname, registration_number,
        is_active, is_deleted, authtype, auths_id, entities_id,
        date_creation, date_mod, password_last_update)
     VALUES (?, ?, ?, ?, ?, 1, 0, 1, 0, 0, NOW(), NOW(), NOW())`,
    [username, senhaHash, realname, firstname, matricula]
  );

  // 2. E-mail (padrão)
  await execute(
    `INSERT INTO glpi_useremails (users_id, is_default, is_dynamic, email)
     VALUES (?, 1, 0, ?)`,
    [userId, email]
  );

  // 3. Perfil + entidade (conta válida no GLPI)
  await execute(
    `INSERT INTO glpi_profiles_users
       (users_id, profiles_id, entities_id, is_recursive, is_dynamic, is_default_profile)
     VALUES (?, ?, 0, 1, 0, 1)`,
    [userId, cfg.profileId]
  );

  // 4. Grupo (role no VistoMap)
  await execute(
    `INSERT INTO glpi_groups_users (users_id, groups_id) VALUES (?, ?)`,
    [userId, cfg.grupoId]
  );

  return { userId, username, senha, tipo: input.tipo };
}
