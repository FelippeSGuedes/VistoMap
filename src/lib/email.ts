import "server-only";
import path from "node:path";
import { promises as fs } from "node:fs";
import nodemailer from "nodemailer";

/**
 * Envio de e-mail via SMTP (Office 365) — conta comunicacao.ami@nansen.com.br.
 * Config no env do container: SMTP_HOST, SMTP_PORT, SMTP_SENDER, SMTP_PASSWORD.
 */

export interface MailAttachment {
  filename: string;
  content: Buffer;
  cid: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: MailAttachment[];
}

/** Lê um asset de public/ (funciona no standalone build, cwd=/app). */
export async function lerAssetPublic(nome: string): Promise<Buffer | null> {
  const candidatos = [
    path.join(process.cwd(), "public", nome),
    path.join(process.cwd(), nome),
  ];
  for (const p of candidatos) {
    try {
      return await fs.readFile(p);
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

export async function sendMail(
  input: SendMailInput
): Promise<{ ok: boolean; error?: string }> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_SENDER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    return { ok: false, error: "SMTP não configurado no servidor (SMTP_HOST/SENDER/PASSWORD)." };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 587 = STARTTLS
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: `"Sistemas GIOC" <${user}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
