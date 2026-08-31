/**
 * HTML do e-mail de lembrete de pendências CPFL — função PURA.
 *
 * Separado de emailTemplates.ts de propósito: aquele arquivo é `server-only` e
 * lê assets do disco, o que impede rodá-lo fora do Next. Aqui não há import
 * nenhum, então dá pra gerar o HTML num script solto (é assim que a prévia é
 * conferida antes de disparar) sem duplicar a marcação — duplicar seria
 * garantir que a prévia e o e-mail real divergissem com o tempo.
 *
 * Header, rodapé e barra inferior são os mesmos do e-mail de boas-vindas; só
 * o miolo muda.
 */

const AZUL = "#003E91";
const AZUL_ESCURO = "#0A1F44";
const VERDE = "#00D084";
const CINZA_BG = "#F4F6F9";
const TEXTO = "#2F3A4A";
/** Só o "Reprovado" usa vermelho — é o único par semântico do template. */
const VERMELHO = "#D92D20";

export interface HtmlPendenciaCPFLParams {
  /** Quantidade de projetos aguardando análise da CPFL. */
  quantidade: number;
  /** Link do botão — deve cair na tela JÁ filtrada por pendência CPFL. */
  url: string;
  /** cid do header.png, ou null se o asset não existir. */
  cidHeader: string | null;
  /** cid da ilustração (cardpendencialtz.png), ou null. */
  cidIlustracao: string | null;
  /** cid do rodapé institucional (card.png), ou null. */
  cidCard: string | null;
}

/** Escapa texto pra interpolar com segurança no HTML do e-mail. */
export function escaparHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Linha da caixa informativa: rótulo pequeno + valor destacado. */
function linhaInfo(
  icone: string,
  rotulo: string,
  valorHtml: string,
  primeira: boolean
): string {
  const borda = primeira ? "" : "border-top:1px solid #EEF1F6;padding-top:14px;";
  const respiro = primeira ? "padding-bottom:14px;" : "";
  return `
    <tr><td style="${borda}${respiro}">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td valign="top" width="34" style="width:34px;padding-top:2px;">
          <div style="width:24px;height:24px;border-radius:7px;background:#EAF1FB;text-align:center;line-height:24px;font-size:12px;">${icone}</div>
        </td>
        <td valign="top">
          <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:11.5px;font-weight:700;color:#8A94A6;text-transform:uppercase;letter-spacing:.06em;">${rotulo}</div>
          <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:700;color:${AZUL_ESCURO};margin-top:3px;">${valorHtml}</div>
        </td>
      </tr></table>
    </td></tr>`;
}

export function htmlLembretePendenciaCPFL(p: HtmlPendenciaCPFLParams): string {
  const n = Math.max(0, Math.floor(p.quantidade));
  const qtd = `${n} ${n === 1 ? "Projeto" : "Projetos"}`;

  const imgHeader = p.cidHeader
    ? `<img src="cid:${p.cidHeader}" width="700" alt="Sistema GIOC" style="display:block;width:100%;max-width:700px;height:auto;border:0;border-radius:20px 20px 0 0" />`
    : "";
  const imgCard = p.cidCard
    ? `<img src="cid:${p.cidCard}" width="700" alt="Nansen · Sistemas GIOC" style="display:block;width:100%;max-width:700px;height:auto;border:0" />`
    : "";

  // Sem ilustração a coluna some por completo, em vez de deixar um buraco de
  // 290px no layout.
  const colunaIlustracao = p.cidIlustracao
    ? `<td class="col-stack ilustra-td" width="290" valign="middle" align="right" style="vertical-align:middle;width:290px;">
         <img src="cid:${p.cidIlustracao}" width="280" alt="" style="display:block;width:280px;max-width:100%;height:auto;border:0" />
       </td>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>Lembrete · Pendências CPFL</title>
<style>
  @media only screen and (max-width:620px){
    .col-stack{display:block !important;width:100% !important;text-align:center !important}
    .ilustra-td{padding-top:24px !important}
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

              <!-- Título + mensagem + ilustração -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="col-stack" valign="middle" style="vertical-align:middle;">
                    <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:34px;font-weight:700;color:${AZUL_ESCURO};line-height:1.1;">Lembrete!</div>
                    <div style="width:30px;height:4px;background:${VERDE};border-radius:2px;margin:14px 0 24px 0;"></div>

                    <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:21px;font-weight:700;line-height:1.4;color:${TEXTO};">
                      Há <span style="color:${AZUL};">${qtd}</span>
                      com <span style="color:${AZUL_ESCURO};">Pendência CPFL</span> para análise.
                    </div>

                    <p style="margin:16px 0 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:14.5px;line-height:1.65;color:${TEXTO};">
                      Acesse o <b>Sistema GIOC</b> para revisar e realizar a análise dos projetos
                      pendentes para <b style="color:${VERDE};">Aprovado</b> ou
                      <b style="color:${VERMELHO};">Reprovado</b>.
                    </p>
                  </td>
                  ${colunaIlustracao}
                </tr>
              </table>

              <!-- Caixa informativa -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:34px 0 0 0;">
                <tr><td style="background:#ffffff;border:1px solid #DCE7F7;border-radius:16px;box-shadow:0 3px 12px rgba(10,31,68,0.04);padding:22px 24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${linhaInfo("📄", "Pendências", `<span style="color:${AZUL};">${qtd}</span>`, true)}
                    ${linhaInfo("🏢", "Cliente", `<span style="color:${AZUL};">CPFL</span>`, false)}
                    ${linhaInfo(
                      "⚠️",
                      "Ação necessária",
                      `Análise para <span style="color:${VERDE};">Aprovado</span> ou <span style="color:${VERMELHO};">Reprovado</span>`,
                      false
                    )}
                  </table>
                </td></tr>
              </table>

              <!-- Botão -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 8px 0;"><tr><td align="center">
                <a href="${escaparHtml(p.url)}" class="btn-acessar" style="display:inline-block;width:380px;max-width:82%;height:60px;line-height:60px;background:${AZUL};background-image:linear-gradient(90deg,${AZUL},#0A5BD6);border-radius:14px;color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:15.5px;font-weight:700;text-decoration:none;text-align:center;box-shadow:0 8px 22px rgba(0,62,145,0.28);">
                  VERIFICAR PENDÊNCIAS&nbsp;&nbsp;&#8594;
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
            <tr><td style="padding:30px 0 0 0;line-height:0;">${imgCard}</td></tr>
          </table>

        </td></tr>

        <!-- Barra azul-marinho inferior -->
        <tr><td style="background:${AZUL_ESCURO};border-radius:0 0 20px 20px;padding:20px 28px;">
          <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:11.5px;line-height:1.6;color:rgba(255,255,255,0.72);">
            🛡️&nbsp; Este é um e-mail automático. Não responda esta mensagem.<br />
            © Nansen • Todos os direitos reservados.
          </div>
        </td></tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
