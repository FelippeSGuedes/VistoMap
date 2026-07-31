import "server-only";
import { lerAssetPublic, type MailAttachment } from "@/lib/email";

/**
 * Template corporativo premium do e-mail de boas-vindas (Sistema GIOC · Nansen).
 * Layout table-based + estilos inline pra render consistente em Outlook/Gmail.
 * Assets (public/): header.png, carta.png, card.png — anexados inline (cid).
 */

const AZUL = "#003E91";
const AZUL_ESCURO = "#0A1F44";
const VERDE = "#00D084";
const CINZA_BG = "#F4F6F9";
const TEXTO = "#2F3A4A";

export interface EmailBoasVindasParams {
  primeiroNome: string;
  login: string;
  senha: string;
  url: string;
}

export interface EmailMontado {
  html: string;
  attachments: MailAttachment[];
}

export async function montarEmailBoasVindas(
  p: EmailBoasVindasParams
): Promise<EmailMontado> {
  const [header, carta, card] = await Promise.all([
    lerAssetPublic("header.png"),
    lerAssetPublic("carta.png"),
    lerAssetPublic("card.png"),
  ]);

  const attachments: MailAttachment[] = [];
  if (header) attachments.push({ filename: "header.png", content: header, cid: "gioc-header" });
  if (carta) attachments.push({ filename: "carta.png", content: carta, cid: "gioc-carta" });
  if (card) attachments.push({ filename: "card.png", content: card, cid: "gioc-card" });

  const imgHeader = header
    ? `<img src="cid:gioc-header" width="700" alt="Sistema GIOC" style="display:block;width:100%;max-width:700px;height:auto;border:0;border-radius:20px 20px 0 0" />`
    : "";
  const imgCarta = carta
    ? `<img src="cid:gioc-carta" width="240" alt="" style="display:block;width:240px;max-width:100%;height:auto;border:0" />`
    : "";
  const imgCard = card
    ? `<img src="cid:gioc-card" width="360" alt="Nansen · Sistemas GIOC" style="display:block;width:360px;max-width:100%;height:auto;border:0;margin:0 auto" />`
    : "";

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>Sua conta GIOC foi criada</title>
<style>
  @media only screen and (max-width:620px){
    .col-stack{display:block !important;width:100% !important;text-align:center !important}
    .carta-td{padding-top:24px !important}
    .btn-acessar{width:100% !important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${CINZA_BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CINZA_BG};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="700" cellpadding="0" cellspacing="0" style="width:700px;max-width:700px;">

        <!-- Cartão branco -->
        <tr><td style="background:#ffffff;border-radius:20px 20px 0 0;box-shadow:0 10px 40px rgba(10,31,68,0.06);overflow:hidden;">

          <!-- Header -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="line-height:0">${imgHeader}</td></tr></table>

          <!-- Corpo -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:45px 44px 0 44px;">

              <!-- Título + ilustração -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="col-stack" valign="top" style="vertical-align:top;">
                    <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:30px;font-weight:700;color:${AZUL_ESCURO};line-height:1.1;">Olá, ${escape(p.primeiroNome)}</div>
                    <div style="width:30px;height:4px;background:${VERDE};border-radius:2px;margin:14px 0 26px 0;"></div>

                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td valign="middle" style="padding-right:10px;">
                        <div style="width:26px;height:26px;border-radius:50%;background:${VERDE};text-align:center;line-height:26px;color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">&#10003;</div>
                      </td>
                      <td valign="middle" style="font-family:'Segoe UI',Arial,sans-serif;font-size:16.5px;font-weight:700;color:${VERDE};">Sua conta foi criada com sucesso!</td>
                    </tr></table>

                    <p style="margin:18px 0 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:14.5px;line-height:1.65;color:${TEXTO};">
                      Sua conta no <b>Sistema GIOC</b> foi criada com sucesso e já está pronta para utilização.
                      Utilize as credenciais abaixo para realizar seu primeiro acesso.
                    </p>
                  </td>
                  <td class="col-stack carta-td" width="250" valign="top" align="right" style="vertical-align:top;width:250px;">
                    ${imgCarta}
                  </td>
                </tr>
              </table>

              <!-- Card de credenciais -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:34px 0 0 0;">
                <tr><td style="background:#ffffff;border:1px solid #E6EAF0;border-radius:18px;box-shadow:0 4px 16px rgba(10,31,68,0.04);padding:22px 24px;">

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr><td style="padding-bottom:14px;">
                      <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;font-weight:700;color:#8A94A6;text-transform:uppercase;letter-spacing:.06em;">👤 Usuário</div>
                      <div style="font-family:'Segoe UI',Consolas,monospace;font-size:16px;font-weight:700;color:${AZUL_ESCURO};margin-top:4px;">${escape(p.login)}</div>
                    </td></tr>
                    <tr><td style="border-top:1px solid #EEF1F6;padding-top:14px;">
                      <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;font-weight:700;color:#8A94A6;text-transform:uppercase;letter-spacing:.06em;">🔒 Senha temporária</div>
                      <div style="font-family:'Segoe UI',Consolas,monospace;font-size:16px;font-weight:700;color:${AZUL_ESCURO};margin-top:4px;letter-spacing:.02em;">${escape(p.senha)}</div>
                    </td></tr>
                  </table>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
                    <tr><td style="background:#EAF1FB;border-radius:12px;padding:12px 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:${AZUL};">
                      🛡️&nbsp; Por segurança, altere sua senha no primeiro acesso.
                    </td></tr>
                  </table>

                </td></tr>
              </table>

              <!-- Botão -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 8px 0;"><tr><td align="center">
                <a href="${escape(p.url)}" class="btn-acessar" style="display:inline-block;width:380px;max-width:82%;height:60px;line-height:60px;background:${AZUL};background-image:linear-gradient(90deg,${AZUL},#0A5BD6);border-radius:14px;color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:15.5px;font-weight:700;text-decoration:none;text-align:center;box-shadow:0 8px 22px rgba(0,62,145,0.28);">
                  ACESSAR O SISTEMA GIOC&nbsp;&nbsp;&#8594;
                </a>
              </td></tr></table>

              <!-- Suporte -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:30px;">
                <tr><td style="border-top:1px solid #EEF1F6;padding-top:22px;font-family:'Segoe UI',Arial,sans-serif;font-size:13.5px;line-height:1.6;color:${TEXTO};">
                  🎧&nbsp; Caso tenha dúvidas ou necessite de <a href="mailto:comunicacao.ami@nansen.com.br" style="color:${AZUL};font-weight:700;text-decoration:none;">suporte</a>, entre em contato com nossa equipe.
                </td></tr>
              </table>

              <!-- Encerramento -->
              <p style="margin:26px 0 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:${TEXTO};">
                Atenciosamente,<br /><b style="color:${AZUL_ESCURO};">Equipe Sistemas GIOC</b>
              </p>

            </td></tr>

            <!-- Rodapé institucional (card.png) -->
            <tr><td style="padding:34px 44px 40px 44px;">${imgCard}</td></tr>
          </table>

        </td></tr>

        <!-- Barra azul-marinho inferior -->
        <tr><td style="background:${AZUL_ESCURO};border-radius:0 0 20px 20px;padding:20px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td class="col-stack" valign="middle" style="font-family:'Segoe UI',Arial,sans-serif;font-size:11.5px;line-height:1.6;color:rgba(255,255,255,0.72);">
              🛡️&nbsp; Este é um e-mail automático. Não responda esta mensagem.<br />
              © Nansen • Todos os direitos reservados.
            </td>
            <td class="col-stack" valign="middle" align="right" style="font-family:'Segoe UI',Arial,sans-serif;font-size:11.5px;color:#ffffff;white-space:nowrap;">
              <a href="https://www.linkedin.com/company/nansen" style="color:#ffffff;text-decoration:none;opacity:.9;">LinkedIn</a>
              &nbsp;&nbsp;·&nbsp;&nbsp;
              <a href="https://www.instagram.com/nansen" style="color:#ffffff;text-decoration:none;opacity:.9;">Instagram</a>
              &nbsp;&nbsp;·&nbsp;&nbsp;
              <a href="https://www.youtube.com/@nansen" style="color:#ffffff;text-decoration:none;opacity:.9;">YouTube</a>
            </td>
          </tr></table>
        </td></tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { html, attachments };
}

/** Escapa texto pra interpolar com segurança no HTML do e-mail. */
function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
