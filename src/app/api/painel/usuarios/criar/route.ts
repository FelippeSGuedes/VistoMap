import { NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";
import { auditInsert } from "@/lib/glpi/audit";
import { sendMail } from "@/lib/email";
import { montarEmailBoasVindas } from "@/lib/emailTemplates";
import {
  criarUsuarioGlpi,
  usernameExiste,
  emailExiste,
  montarUsername,
  ACESSO_CFG,
  type AcessoPainel,
} from "@/lib/glpi/criarUsuario";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACESSOS: AcessoPainel[] = ["tecnico", "administrador", "moderador", "leitura", "nenhum"];
const URL_APP = "https://vistomap.nansen.com.br/app";
const URL_PAINEL = "https://vistomap.nansen.com.br/painel/login";
const URL_GLPI = "https://gioc.nansen.com.br";

interface Body {
  nome?: string;
  sobrenome?: string;
  username?: string;
  email?: string;
  matricula?: string;
  profileId?: number;
  acesso?: AcessoPainel;
}

function emailValido(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function POST(req: Request) {
  const auth = await requirePainelRole(req, "admin");
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const nome = (body.nome ?? "").trim();
  const sobrenome = (body.sobrenome ?? "").trim();
  const email = (body.email ?? "").trim();
  const matricula = (body.matricula ?? "").trim();
  const acesso = body.acesso;
  const profileId = Number(body.profileId);
  // Login: usa o informado, senão monta nome.sobrenome.
  const username =
    (body.username ?? "").trim().toLowerCase() || montarUsername(nome, sobrenome);

  // Validação
  if (!nome) return NextResponse.json({ message: "Nome é obrigatório" }, { status: 400 });
  if (!sobrenome) return NextResponse.json({ message: "Sobrenome é obrigatório" }, { status: 400 });
  if (!username || !/^[a-z0-9._-]+$/.test(username)) {
    return NextResponse.json({ message: "Usuário inválido (use letras, números, . _ -)" }, { status: 400 });
  }
  if (!emailValido(email)) return NextResponse.json({ message: "E-mail inválido" }, { status: 400 });
  if (!matricula || !/^[A-Za-z0-9]+$/.test(matricula)) {
    return NextResponse.json({ message: "Matrícula é obrigatória (letras/números, sem espaço)" }, { status: 400 });
  }
  if (!profileId || !Number.isFinite(profileId)) {
    return NextResponse.json({ message: "Selecione um perfil do GLPI" }, { status: 400 });
  }
  if (!acesso || !ACESSOS.includes(acesso)) {
    return NextResponse.json({ message: "Acesso inválido" }, { status: 400 });
  }

  // Unicidade
  if (await usernameExiste(username)) {
    return NextResponse.json({ message: "Já existe um usuário com esse login." }, { status: 409 });
  }
  if (await emailExiste(email)) {
    return NextResponse.json({ message: "Já existe uma conta com esse e-mail." }, { status: 409 });
  }

  // Cria
  let result;
  try {
    result = await criarUsuarioGlpi({ username, nome, sobrenome, email, matricula, profileId, acesso });
  } catch (err) {
    return NextResponse.json(
      { message: "Falha ao criar a conta no GLPI", error: String(err) },
      { status: 500 }
    );
  }

  // E-mail de boas-vindas premium (template corporativo GIOC)
  const cfg = ACESSO_CFG[acesso];
  const url = cfg.destino === "app" ? URL_APP : cfg.destino === "glpi" ? URL_GLPI : URL_PAINEL;
  const { html, attachments } = await montarEmailBoasVindas({
    primeiroNome: nome,
    login: result.username,
    senha: result.senha,
    url,
  });
  const mail = await sendMail({
    to: email,
    subject: "Sua conta no Sistema GIOC foi criada",
    html,
    attachments,
  });

  // Auditoria
  void auditInsert({
    ator: { id: Number(auth.claims.sub) || 0, nome: auth.claims.email ?? "Administrador", role: "admin" },
    acao: "dados-editados",
    alvo: { tipo: "sistema", id: `novo-usuario-${result.userId}`, label: `${nome} ${sobrenome}` },
    descricao: `Conta criada (${cfg.label}) para ${nome} ${sobrenome} — login ${result.username}. E-mail ${mail.ok ? "enviado" : "NÃO enviado"}.`,
  });

  return NextResponse.json({
    ok: true,
    userId: result.userId,
    username: result.username,
    emailEnviado: mail.ok,
    emailErro: mail.ok ? undefined : mail.error,
  });
}
