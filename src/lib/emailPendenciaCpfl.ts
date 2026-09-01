/**
 * HTML do e-mail de lembrete de pendências CPFL — função PURA.
 *
 * Separado de emailTemplates.ts de propósito: aquele arquivo é `server-only` e
 * lê assets do disco, o que impede rodá-lo fora do Next. Aqui não há import
 * nenhum, então dá pra gerar o HTML num script solto (é assim que a prévia é
 * conferida antes de disparar) sem duplicar a marcação — duplicar seria
 * garantir que a prévia e o e-mail real divergissem com o tempo.
 *
 * Header e rodapé são o header.png e o card.png já usados no e-mail de
 * boas-vindas — NÃO tocar neles aqui, são imagens prontas, renderizadas como
 * estão. Só o miolo (título, mensagem, ilustração, caixa informativa, botão,
 * texto de suporte) é gerado por este arquivo.
 *
 * Decisões de compatibilidade (e-mail ≠ web):
 *  - Tudo table-based com estilo inline; <style> no head só pras media queries
 *    (Gmail respeita, Outlook desktop ignora ambos e cai no layout de tabela).
 *  - O botão tem par VML pro Outlook (roundrect) — sem isso ele vira um link
 *    de texto sem área de clique decente.
 *  - Gradiente do botão tem background sólido de fallback: Outlook não lê
 *    linear-gradient e sem o fallback o texto branco sumiria em fundo branco.
 *  - O preheader escondido controla a linha de resumo da caixa de entrada —
 *    sem ele, o cliente mostra um corte aleatório do corpo.
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

// Emoji puro, sem tile/fundo atrás — a primeira versão (fundo pálido com
// borda) e a segunda (tile em gradiente) leram como "estranho" nas duas
// vezes; de volta ao básico: o glifo colorido flutuando, grande o bastante
// pra ter presença, sem nenhuma caixa ao redor competindo com ele.
const EMOJI_PENDENCIAS = "📁";
const EMOJI_CLIENTE = "🏢";
const EMOJI_ACAO = "🕑";
const EMOJI_ALERTA = "🔔";

/**
 * Linha espaçadora bulletproof: `margin` em <table> é ignorado por boa parte
 * dos clientes de e-mail (Gmail incluído) — só padding/height em <td> é
 * respeitado de forma confiável. Por isso NENHUM espaçamento neste arquivo
 * usa `style="margin"` num <table>; todos os intervalos verticais entre
 * blocos viram uma linha <tr> própria com altura fixa.
 */
function linhaEspacadora(px: number): string {
  return `<tr><td style="height:${px}px;line-height:${px}px;font-size:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>`;
}

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

/**
 * URL pra usar em href de e-mail: codifica colchetes antes de escapar
 * entidades HTML.
 *
 * Achado com o link real do botão não reagindo a clique: `[` e `]` são
 * válidos numa query string comum (é assim que o GLPI monta filtro de busca
 * — `criteria[0][field]=...`), mas o sanitizador de link do Gmail (e
 * possivelmente outros) DESCARTA o atributo href inteiro quando encontra
 * colchete cru — não dá erro, o link simplesmente some, exatamente como "sem
 * reação alguma, parece que não tem link". `encodeURI` sozinho não resolve
 * porque preserva colchete (trata como caractere reservado da sintaxe da
 * URL), por isso o replace dedicado.
 */
export function escaparUrl(s: string): string {
  return escaparHtml(String(s).replace(/\[/g, "%5B").replace(/\]/g, "%5D"));
}

/** Linha da caixa informativa: emoji solto + rótulo pequeno + valor forte. */
function linhaInfo(
  emoji: string,
  rotulo: string,
  valorHtml: string,
  primeira: boolean
): string {
  const borda = primeira ? "" : `border-top:1px solid ${DIVISOR};padding-top:18px;`;
  const respiro = primeira ? "padding-bottom:18px;" : "";
  return `
    <tr><td style="${borda}${respiro}">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td valign="middle" width="38" align="center" style="width:38px;font-size:25px;line-height:1;">${emoji}</td>
        <td valign="middle" style="padding-left:10px;">
          <div style="font-family:${FONTE};font-size:11px;font-weight:700;color:${CINZA_LABEL};text-transform:uppercase;letter-spacing:.1em;">${rotulo}</div>
          <div style="font-family:${FONTE};font-size:16.5px;font-weight:700;color:${AZUL_ESCURO};margin-top:3px;">${valorHtml}</div>
        </td>
      </tr></table>
    </td></tr>`;
}

export function htmlLembretePendenciaCPFL(p: HtmlPendenciaCPFLParams): string {
  const n = Math.max(0, Math.floor(p.quantidade));
  const plural = n === 1 ? "Projeto" : "Projetos";
  const qtd = `${n} ${plural}`;
  const urlSegura = escaparUrl(p.url);

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

          <!-- Header — header.png, sem alteração -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="line-height:0">${imgHeader}</td></tr></table>

          <!-- Corpo -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td class="padded" style="padding:46px 44px 0 44px;">

              <!-- 1. Título + sino discreto -->
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td valign="middle" style="font-family:${FONTE};font-size:36px;font-weight:700;color:${AZUL_ESCURO};line-height:1.1;letter-spacing:-0.02em;">Lembrete!</td>
                <td valign="middle" style="padding-left:12px;font-size:30px;line-height:1;">${EMOJI_ALERTA}</td>
              </tr></table>
              <div style="width:44px;height:4px;background:${VERDE};border-radius:2px;margin:16px 0 24px 0;font-size:0;line-height:0;">&nbsp;</div>

              <!-- 2. Mensagem principal + 4. Ilustração -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="col-stack" valign="middle" style="vertical-align:middle;">
                    <div style="font-family:${FONTE};font-size:23px;font-weight:700;line-height:1.4;color:${TEXTO};">
                      Há <span style="color:${AZUL};">${n}&nbsp;<span style="color:${VERDE};">${plural}</span></span><br />
                      com <span style="color:${AZUL_ESCURO};">Pendência&nbsp;CPFL</span> para análise.
                    </div>

                    <!-- 3. Texto explicativo -->
                    <p style="margin:18px 0 0 0;font-family:${FONTE};font-size:14.5px;line-height:1.7;color:${TEXTO};">
                      Existem projetos pendentes aguardando sua análise no <b>Sistema GIOC</b>.
                    </p>
                    <p style="margin:10px 0 0 0;font-family:${FONTE};font-size:14.5px;line-height:1.7;color:${TEXTO};">
                      Acesse o Sistema GIOC para revisar os projetos e realizar a análise necessária,
                      classificando cada solicitação como <b style="color:${VERDE};">Aprovado</b> ou
                      <b style="color:${VERMELHO};">Reprovado</b>.
                    </p>
                  </td>
                  ${colunaIlustracao}
                </tr>
              </table>

              <!-- 5. Caixa informativa -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${linhaEspacadora(34)}
                <tr><td style="background:#ffffff;border:1px solid ${BORDA_AZUL};border-radius:16px;box-shadow:0 3px 12px rgba(10,31,68,0.05);padding:22px 26px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${linhaInfo(EMOJI_PENDENCIAS, "Pendências", `<span style="color:${AZUL};">${qtd}</span>`, true)}
                    ${linhaInfo(EMOJI_CLIENTE, "Cliente", `<span style="color:${AZUL};">CPFL</span>`, false)}
                    ${linhaInfo(
                      EMOJI_ACAO,
                      "Ação necessária",
                      `Análise para <span style="color:${VERDE};">Aprovado</span> ou <span style="color:${VERMELHO};">Reprovado</span>`,
                      false
                    )}
                  </table>
                </td></tr>
              </table>

              <!-- 6. Botão (VML pro Outlook, <a> arredondado pro resto) -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${linhaEspacadora(46)}
                <tr><td align="center">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${urlSegura}" style="height:58px;v-text-anchor:middle;width:380px;" arcsize="24%" fillcolor="${AZUL}" stroke="f">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:15.5px;font-weight:700;">ACESSAR O SISTEMA GIOC &#8594;</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="${urlSegura}" class="btn-acessar" style="display:inline-block;width:380px;max-width:82%;height:58px;line-height:58px;background:${AZUL};background-image:linear-gradient(90deg,${AZUL},${AZUL_CLARO});border-radius:14px;color:#ffffff;font-family:${FONTE};font-size:15.5px;font-weight:700;text-decoration:none;text-align:center;box-shadow:0 8px 22px rgba(0,62,145,0.28);">
                  ACESSAR O SISTEMA GIOC&nbsp;&nbsp;&#8594;
                </a>
                <!--<![endif]-->
                <div style="font-family:${FONTE};font-size:12px;color:${CINZA_LABEL};margin-top:14px;">O link abre a lista já filtrada pelos projetos com pendência CPFL.</div>
              </td></tr></table>

              <!-- 7. Texto de suporte -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${linhaEspacadora(40)}
                <tr><td style="border-top:1px solid ${DIVISOR};padding-top:24px;font-family:${FONTE};font-size:13px;line-height:1.6;color:${CINZA_LABEL};">
                  Em caso de dúvidas ou necessidade de suporte, entre em contato com nossa equipe.
                </td></tr>
              </table>

              <p style="margin:18px 0 0 0;font-family:${FONTE};font-size:13px;line-height:1.6;color:${CINZA_LABEL};">
                Atenciosamente,<br /><b style="color:${AZUL_ESCURO};">Equipe Sistemas GIOC</b>
              </p>

            </td></tr>

            <!-- Rodapé institucional — card.png, sem alteração -->
            <tr><td style="padding:30px 0 0 0;line-height:0;">${imgCard}</td></tr>
          </table>

        </td></tr>

        <!-- Barra azul-marinho inferior -->
        <tr><td bgcolor="${AZUL_ESCURO}" style="background:${AZUL_ESCURO};border-radius:0 0 20px 20px;padding:20px 28px;">
          <div style="font-family:${FONTE};font-size:11.5px;line-height:1.7;color:rgba(255,255,255,0.72);text-transform:uppercase;letter-spacing:.04em;">
            E-mail automático<br />
            Favor não responder
          </div>
        </td></tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
