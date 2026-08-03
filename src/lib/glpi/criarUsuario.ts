import "server-only";
import bcrypt from "bcryptjs";
import { execute, query } from "@/lib/db";

/**
 * Criação de usuário GLPI (a API do GLPI está desligada, então inserimos
 * direto — replicando como um usuário existente é montado: auth local
 * authtype=1, entidade 0 (GIOC), perfil em glpi_profiles_users e grupo em
 * glpi_groups_users). A role do VistoMap vem do GRUPO.
 */

/** Acesso ao VistoMap — vira o grupo GLPI (ou nenhum). "nenhum" = só GLPI. */
export type AcessoPainel = "tecnico" | "administrador" | "moderador" | "leitura" | "nenhum";

export interface AcessoCfg {
  label: string;
  grupoId: number | null; // grupo VistoMap; null = sem acesso ao painel/app
  destino: "app" | "painel" | "glpi";
}

export const ACESSO_CFG: Record<AcessoPainel, AcessoCfg> = {
  tecnico:       { label: "Técnico (app de campo)",   grupoId: 1,    destino: "app" },
  administrador: { label: "Administrador (painel)",   grupoId: 2,    destino: "painel" },
  moderador:     { label: "Moderador (painel)",       grupoId: 6,    destino: "painel" },
  leitura:       { label: "Leitura (painel)",         grupoId: 3,    destino: "painel" },
  nenhum:        { label: "Nenhum (somente GLPI)",    grupoId: null, destino: "glpi" },
};

/** Perfis GLPI disponíveis (pra dropdown). */
export async function listarPerfisGlpi(): Promise<Array<{ id: number; nome: string }>> {
  const rows = await query<{ id: number; name: string }>(
    `SELECT id, name FROM glpi_profiles ORDER BY name`
  );
  return rows.map((r) => ({ id: r.id, nome: r.name.trim() }));
}

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

/** Normaliza um nome pra compor o login: sem acento, minúsculo, só a-z0-9. */
export function slugNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Login padrão: nome.sobrenome (primeiro nome + primeiro sobrenome). */
export function montarUsername(nome: string, sobrenome: string): string {
  const n = slugNome(nome.trim().split(/\s+/)[0] ?? "");
  const s = slugNome(sobrenome.trim().split(/\s+/).pop() ?? "");
  return [n, s].filter(Boolean).join(".");
}

export interface CriarUsuarioInput {
  username: string;
  nome: string;       // primeiro nome (firstname)
  sobrenome: string;  // sobrenome (realname)
  email: string;
  matricula: string;
  profileId: number;  // perfil GLPI escolhido
  acesso: AcessoPainel; // grupo VistoMap (ou nenhum)
  /** Força troca de senha no 1º login (backdate do password_last_update —
   *  só tem efeito com a expiração de senha do GLPI ligada). */
  forcarTroca?: boolean;
}

export interface CriarUsuarioResult {
  userId: number;
  username: string;
  senha: string; // texto puro (pro e-mail)
  acesso: AcessoPainel;
}

export async function criarUsuarioGlpi(
  input: CriarUsuarioInput
): Promise<CriarUsuarioResult> {
  const cfg = ACESSO_CFG[input.acesso];
  const username = input.username.trim();
  const email = input.email.trim();
  const matricula = input.matricula.trim();
  const senha = montarSenha(matricula);
  const senhaHash = await hashSenhaGlpi(senha);

  const firstname = input.nome.trim();
  const realname = input.sobrenome.trim();

  // Força troca: coloca password_last_update logo ALÉM da expiração (90d) —
  // 91 dias atrás. Assim o GLPI marca como expirada (obriga trocar no 1º
  // login) mas fica DENTRO da janela de 5 dias antes do bloqueio automático
  // (password_expiration_lock_delay=5), evitando travar a conta antes do
  // acesso. Sem forçar: NOW(). Literal controlado (não é input do usuário).
  const pluExpr = input.forcarTroca ? "(NOW() - INTERVAL 91 DAY)" : "NOW()";

  // 1. Usuário
  const { insertId: userId } = await execute(
    `INSERT INTO glpi_users
       (name, password, realname, firstname, registration_number,
        is_active, is_deleted, authtype, auths_id, entities_id,
        date_creation, date_mod, password_last_update)
     VALUES (?, ?, ?, ?, ?, 1, 0, 1, 0, 0, NOW(), NOW(), ${pluExpr})`,
    [username, senhaHash, realname, firstname, matricula]
  );

  // 2. E-mail (padrão)
  await execute(
    `INSERT INTO glpi_useremails (users_id, is_default, is_dynamic, email)
     VALUES (?, 1, 0, ?)`,
    [userId, email]
  );

  // 3. Perfil + entidade (conta válida no GLPI) — perfil escolhido no form.
  await execute(
    `INSERT INTO glpi_profiles_users
       (users_id, profiles_id, entities_id, is_recursive, is_dynamic, is_default_profile)
     VALUES (?, ?, 0, 1, 0, 1)`,
    [userId, input.profileId]
  );

  // 4. Grupo VistoMap (role no app/painel) — só quando há acesso.
  if (cfg.grupoId != null) {
    await execute(
      `INSERT INTO glpi_groups_users (users_id, groups_id) VALUES (?, ?)`,
      [userId, cfg.grupoId]
    );
  }

  return { userId, username, senha, acesso: input.acesso };
}
