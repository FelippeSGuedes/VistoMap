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
 *
 * Decisões de compatibilidade (e-mail ≠ web):
 *  - Tudo table-based com estilo inline; <style> no head só pras media queries
 *    (Gmail respeita, Outlook desktop ignora ambos e cai no layout de tabela).
 *  - O botão tem par VML pro Outlook (roundrect) — sem isso ele vira um link
 *    de texto sem área de clique decente.
 *  - Gradientes têm bgcolor/background sólido de fallback: Outlook não lê
 *    linear-gradient e sem o fallback o texto branco sumiria em fundo branco.
 *  - O preheader escondido controla a linha de resumo da caixa de entrada —
 *    sem ele, o cliente mostra "Lembrete! Há 307..." cortado de qualquer jeito.
 */

const AZUL = "#003E91";
const AZUL_CLARO = "#0A5BD6";
const AZUL_ESCURO = "#0A1F44";
const VERDE = "#00D084";
const CINZA_BG = "#F4F6F9";
const TEXTO = "#2F3A4A";
const TINTA_AZUL = "#EAF1FB";
const BORDA_AZUL = "#DCE7F7";
const DIVISOR = "#EEF1F6";
const CINZA_LABEL = "#8A94A6";
/** Só o "Reprovado" usa vermelho — é o único par semântico do template. */
const VERMELHO = "#D92D20";

const FONTE = "'Segoe UI',Arial,sans-serif";

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

/** Linha da caixa informativa: tile de ícone + rótulo pequeno + valor forte. */
function linhaInfo(
  icone: string,
  rotulo: string,
  valorHtml: string,
  primeira: boolean
): string {
  const borda = primeira ? "" : `border-top:1px solid ${DIVISOR};padding-top:16px;`;
  const respiro = primeira ? "padding-bottom:16px;" : "";
  return `
    <tr><td style="${borda}${respiro}">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td valign="middle" width="44" style="width:44px;">
          <div style="width:34px;height:34px;border-radius:9px;background:${TINTA_AZUL};border:1px solid ${BORDA_AZUL};text-align:center;line-height:34px;font-size:15px;">${icone}</div>
        </td>
        <td valign="middle">
          <div style="font-family:${FONTE};font-size:11px;font-weight:700;color:${CINZA_LABEL};text-transform:uppercase;letter-spacing:.1em;">${rotulo}</div>
          <div style="font-family:${FONTE};font-size:16.5px;font-weight:700;color:${AZUL_ESCURO};margin-top:3px;">${valorHtml}</div>
        </td>
      </tr></table>
    </td></tr>`;
}

/**
 * Passo do fluxo: círculo numerado com linhas conectoras dos dois lados.
 * As linhas das pontas ficam transparentes — o truque de sempre pra desenhar
 * uma "timeline" só com tabela, que é o que sobrevive no Outlook.
 */
function passo(
  numero: number,
  titulo: string,
  detalheHtml: string,
  primeiro: boolean,
  ultimo: boolean
): string {
  const linha = (visivel: boolean) =>
    `<td valign="middle"><div style="height:2px;background:${visivel ? BORDA_AZUL : "transparent"};font-size:0;line-height:0;">&nbsp;</div></td>`;
  return `
    <td class="col-stack" width="33%" valign="top" style="width:33%;padding:0 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          ${linha(!primeiro)}
          <td width="34" style="width:34px;">
            <div style="width:32px;height:32px;border-radius:50%;background:${AZUL};background-image:linear-gradient(135deg,${AZUL},${AZUL_CLARO});text-align:center;line-height:32px;color:#ffffff;font-family:${FONTE};font-size:14px;font-weight:700;">${numero}</div>
          </td>
          ${linha(!ultimo)}
        </tr>
      </table>
      <div style="font-family:${FONTE};font-size:13px;font-weight:700;color:${AZUL_ESCURO};margin-top:10px;text-align:center;">${titulo}</div>
      <div style="font-family:${FONTE};font-size:11.5px;line-height:1.5;color:${CINZA_LABEL};margin-top:3px;text-align:center;">${detalheHtml}</div>
    </td>`;
}

export function htmlLembretePendenciaCPFL(p: HtmlPendenciaCPFLParams): string {
  const n = Math.max(0, Math.floor(p.quantidade));
  const plural = n === 1 ? "Projeto" : "Projetos";
  const qtd = `${n} ${plural}`;
  const urlSegura = escaparHtml(p.url);

  const imgHeader = p.cidHeader
    ? `<img src="cid:${p.cidHeader}" width="700" alt="Sistema GIOC" style="display:block;width:100%;max-width:700px;height:auto;border:0;border-radius:20px 20px 0 0" />`
    : "";
  const imgCard = p.cidCard
    ? `<img src="cid:${p.cidCard}" width="700" alt="Nansen · Sistemas GIOC" style="display:block;width:100%;max-width:700px;height:auto;border:0" />`
    : "";

  // Sem ilustração a coluna some por completo, em vez de deixar um buraco de
  // 250px no layout.
  const colunaIlustracao = p.cidIlustracao
    ? `<td class="col-stack ilustra-td" width="250" valign="middle" align="right" style="vertical-align:middle;width:250px;padding-left:18px;">
         <img src="cid:${p.cidIlustracao}" width="240" alt="Envelope com documento de pendência e sino de notificação" style="display:block;width:240px;max-width:100%;height:auto;border:0" />
       </td>`
    : "";

  return `<!doctype html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<title>Lembrete · Pendências CPFL</title>
<style>
  @media only screen and (max-width:620px){
    .col-stack{display:block !important;width:100% !important;text-align:center !important}
    .ilustra-td{padding:24px 0 0 0 !important}
    .btn-acessar{width:100% !important}
    .metrica-num{font-size:44px !important}
    .padded{padding-left:24px !important;padding-right:24px !important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${CINZA_BG};">

<!-- Preheader: resumo que aparece na caixa de entrada, invisível no corpo -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
  Há ${qtd} com Pendência CPFL aguardando análise no Sistema GIOC.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
</div>

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
            <tr><td class="padded" style="padding:42px 44px 0 44px;">

              <!-- Eyebrow -->
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="background:${TINTA_AZUL};border:1px solid ${BORDA_AZUL};border-radius:999px;padding:7px 16px;">
                  <span style="font-family:${FONTE};font-size:11px;font-weight:700;color:${AZUL};text-transform:uppercase;letter-spacing:.14em;">&#9200;&nbsp; Lembrete semanal</span>
                </td>
              </tr></table>

              <!-- Título + mensagem + ilustração -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
                <tr>
                  <td class="col-stack" valign="middle" style="vertical-align:middle;">
                    <div style="font-family:${FONTE};font-size:36px;font-weight:700;color:${AZUL_ESCURO};line-height:1.1;letter-spacing:-0.02em;">Lembrete!</div>
                    <div style="width:44px;height:4px;background:${VERDE};border-radius:2px;margin:16px 0 22px 0;font-size:0;line-height:0;">&nbsp;</div>

                    <div style="font-family:${FONTE};font-size:20px;font-weight:700;line-height:1.45;color:${TEXTO};">
                      Há <span style="color:${AZUL};">${n}&nbsp;<span style="color:${VERDE};">${plural}</span></span>
                      com <span style="color:${AZUL_ESCURO};">Pendência&nbsp;CPFL</span> para análise.
                    </div>

                    <p style="margin:14px 0 0 0;font-family:${FONTE};font-size:14.5px;line-height:1.7;color:${TEXTO};">
                      Acesse o <b>Sistema GIOC</b> para revisar e realizar a análise dos projetos
                      pendentes para <b style="color:${VERDE};">Aprovado</b> ou
                      <b style="color:${VERMELHO};">Reprovado</b>.
                    </p>
                  </td>
                  ${colunaIlustracao}
                </tr>
              </table>

              <!-- Banda métrica: o número é o e-mail inteiro; o resto orbita ele -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 0 0;">
                <tr><td bgcolor="${AZUL_ESCURO}" style="background:${AZUL_ESCURO};background-image:linear-gradient(120deg,${AZUL_ESCURO} 0%,#12305E 55%,${AZUL} 100%);border-radius:16px;padding:26px 30px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                    <td class="col-stack" valign="middle">
                      <span class="metrica-num" style="font-family:${FONTE};font-size:54px;font-weight:700;color:#ffffff;line-height:1;letter-spacing:-0.02em;">${n}</span>
                      <span style="font-family:${FONTE};font-size:20px;font-weight:700;color:${VERDE};">&nbsp;&nbsp;${plural.toLowerCase()}</span>
                      <div style="font-family:${FONTE};font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);margin-top:8px;letter-spacing:.02em;">aguardando análise da concessionária</div>
                    </td>
                    <td class="col-stack" width="180" valign="middle" align="right" style="width:180px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" align="right"><tr>
                        <td style="border:1px solid rgba(255,255,255,0.22);border-radius:12px;padding:12px 18px;background:rgba(255,255,255,0.06);">
                          <div style="font-family:${FONTE};font-size:10.5px;font-weight:700;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:.12em;">Decisão</div>
                          <div style="font-family:${FONTE};font-size:14px;font-weight:700;margin-top:4px;">
                            <span style="color:${VERDE};">&#10003; Aprovar</span>
                            <span style="color:rgba(255,255,255,0.4);">&nbsp;/&nbsp;</span>
                            <span style="color:#FF7A6E;">&#10005; Reprovar</span>
                          </div>
                        </td>
                      </tr></table>
                    </td>
                  </tr></table>
                </td></tr>
              </table>

              <!-- Fluxo em 3 passos -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0 0 0;">
                <tr>
                  ${passo(1, "Acesse o GIOC", "pelo botão abaixo, já filtrado", true, false)}
                  ${passo(2, "Revise cada projeto", "documentação e PDF da vistoria", false, false)}
                  ${passo(
                    3,
                    "Registre a decisão",
                    `<b style="color:${VERDE};">Aprovado</b> ou <b style="color:${VERMELHO};">Reprovado</b>`,
                    false,
                    true
                  )}
                </tr>
              </table>

              <!-- Caixa informativa -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0 0 0;">
                <tr><td style="background:#ffffff;border:1px solid ${BORDA_AZUL};border-radius:16px;box-shadow:0 3px 12px rgba(10,31,68,0.05);padding:22px 26px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${linhaInfo("&#128196;", "Pendências", `<span style="color:${AZUL};">${qtd}</span>`, true)}
                    ${linhaInfo("&#127970;", "Cliente", `<span style="color:${AZUL};">CPFL</span>`, false)}
                    ${linhaInfo(
                      "&#9888;&#65039;",
                      "Ação necessária",
                      `Análise para <span style="color:${VERDE};">Aprovado</span> ou <span style="color:${VERMELHO};">Reprovado</span>`,
                      false
                    )}
                  </table>
                </td></tr>
              </table>

              <!-- Botão (VML pro Outlook, <a> arredondado pro resto) -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:34px 0 8px 0;"><tr><td align="center">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${urlSegura}" style="height:58px;v-text-anchor:middle;width:380px;" arcsize="24%" fillcolor="${AZUL}" stroke="f">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:15.5px;font-weight:700;">VERIFICAR PENDÊNCIAS &#8594;</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="${urlSegura}" class="btn-acessar" style="display:inline-block;width:380px;max-width:82%;height:58px;line-height:58px;background:${AZUL};background-image:linear-gradient(90deg,${AZUL},${AZUL_CLARO});border-radius:14px;color:#ffffff;font-family:${FONTE};font-size:15.5px;font-weight:700;text-decoration:none;text-align:center;box-shadow:0 8px 22px rgba(0,62,145,0.28);">
                  VERIFICAR PENDÊNCIAS&nbsp;&nbsp;&#8594;
                </a>
                <!--<![endif]-->
                <div style="font-family:${FONTE};font-size:12px;color:${CINZA_LABEL};margin-top:12px;">O link abre a lista já filtrada pelos projetos pendentes.</div>
              </td></tr></table>

              <!-- Suporte -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
                <tr><td style="border-top:1px solid ${DIVISOR};padding-top:22px;font-family:${FONTE};font-size:13.5px;line-height:1.6;color:${TEXTO};">
                  &#127911;&nbsp; Caso tenha dúvidas ou necessite de <a href="mailto:comunicacao.ami@nansen.com.br" style="color:${AZUL};font-weight:700;text-decoration:none;">suporte</a>, entre em contato com nossa equipe.
                </td></tr>
              </table>

              <!-- Encerramento -->
              <p style="margin:26px 0 0 0;font-family:${FONTE};font-size:14px;line-height:1.6;color:${TEXTO};">
                Atenciosamente,<br /><b style="color:${AZUL_ESCURO};">Equipe Sistemas GIOC</b>
              </p>

            </td></tr>

            <!-- Rodapé institucional (card.png) -->
            <tr><td style="padding:30px 0 0 0;line-height:0;">${imgCard}</td></tr>
          </table>

        </td></tr>

        <!-- Barra azul-marinho inferior -->
        <tr><td bgcolor="${AZUL_ESCURO}" style="background:${AZUL_ESCURO};border-radius:0 0 20px 20px;padding:20px 28px;">
          <div style="font-family:${FONTE};font-size:11.5px;line-height:1.6;color:rgba(255,255,255,0.72);">
            &#128737;&#65039;&nbsp; Este é um e-mail automático. Não responda esta mensagem.<br />
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
