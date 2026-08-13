import "server-only";
import crypto from "node:crypto";

/**
 * Assina URLs de `/uploads/` com expiração (nginx `secure_link_md5`) — antes
 * o nginx servia `/uploads/` como alias público, sem autenticação nenhuma;
 * quem soubesse/adivinhasse o nome do equipamento baixava fotos/vídeo/PDF
 * de qualquer vistoria sem login. A fórmula do hash tem que bater EXATAMENTE
 * com a diretiva `secure_link_md5` do nginx (mesmo secret, mesma ordem de
 * concatenação) — ver scripts/nginx-https.conf / nginx-http.conf.
 *
 * Não muda a forma como o front consome a URL (`<img src={file.url}>`
 * continua igual) — só o conteúdo da string passa a ter `?md5=&expires=`.
 */

const SECRET = process.env.UPLOADS_SECURE_LINK_SECRET ?? "";
const DEFAULT_TTL_SECONDS = 60 * 60 * 6; // 6h — cobre uma sessão de trabalho no painel

if (!SECRET && process.env.NODE_ENV === "production") {
  // Não derruba o processo (uploads antigos sem token viram 403 no nginx,
  // não um crash da app) — mas grita alto no log pra não passar batido.
  console.error(
    "[uploadUrl] UPLOADS_SECURE_LINK_SECRET ausente em produção — URLs de /uploads/ vão sair sem assinatura válida."
  );
}

function base64UrlSafe(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * `folder`/`filename` devem ser os componentes JÁ decodificados (sem
 * encodeURIComponent) — a assinatura precisa bater com `$uri` do nginx, que
 * é o path decodificado. A URL retornada é a versão codificada, pronta pra
 * usar em `href`/`src`.
 */
export function signUploadUrl(folder: string, filename: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const pathname = `/uploads/${folder}/${filename}`;
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const md5 = base64UrlSafe(
    crypto.createHash("md5").update(`${expires}${pathname} ${SECRET}`).digest()
  );
  const encodedPath = `/uploads/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`;
  return `${encodedPath}?md5=${md5}&expires=${expires}`;
}
