import "server-only";
import path from "node:path";
import { promises as fs } from "node:fs";
import nodemailer from "nodemailer";

/**
 * Envio de e-mail via SMTP (Office 365) — reaproveita a conta
 * comunicacao.ami@nansen.com.br. Config no env do container:
 *   SMTP_HOST, SMTP_PORT, SMTP_SENDER, SMTP_PASSWORD
 *
 * A assinatura (public/assinatura.png) é anexada inline (cid) no rodapé.
 */

interface SendMailInput {
  to: string;
  subject: string;
  /** Corpo HTML (a assinatura é adicionada automaticamente no rodapé). */
  html: string;
}

let cachedSigPath: string | null = null;

async function findAssinatura(): Promise<Buffer | null> {
  // No standalone build o public fica em ./public relativo ao cwd (/app).
  const candidates = cachedSigPath
    ? [cachedSigPath]
    : [
        path.join(process.cwd(), "public", "assinatura.png"),
        path.join(process.cwd(), "assinatura.png"),
      ];
  for (const p of candidates) {
    try {
      const buf = await fs.readFile(p);
      cachedSigPath = p;
      return buf;
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

export async function sendMailComAssinatura(
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
    secure: port === 465, // 587 = STARTTLS (secure=false); 465 = TLS direto
    auth: { user, pass },
  });

  const sig = await findAssinatura();
  const attachments = sig
    ? [{ filename: "assinatura.png", content: sig, cid: "assinatura-vistomap" }]
    : [];

  const html = sig
    ? `${input.html}<br><br><img src="cid:assinatura-vistomap" alt="Assinatura" style="max-width:540px;height:auto" />`
    : input.html;

  try {
    await transporter.sendMail({
      from: user,
      to: input.to,
      subject: input.subject,
      html,
      attachments,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
