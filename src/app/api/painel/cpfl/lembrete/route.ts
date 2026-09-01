import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { fetchContagemPendenciaCPFL } from "@/lib/glpi/cpfl";
import { montarEmailPendenciaCPFL } from "@/lib/emailTemplates";
import { sendMail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dispara o lembrete semanal de pendências CPFL. Disparado por cron externo
 * (crontab do usuário no host, mesmo padrão de scripts-gioc/export_ativos.py
 * — ver `crontab -l` no runner), NÃO por sessão de painel — por isso a
 * autenticação é um secret compartilhado (`X-Cron-Secret`), igual ao padrão
 * já usado pra assinar URL de upload (ver src/lib/uploadUrl.ts), em vez de
 * requirePainelRole (que exige usuário logado).
 *
 * URL do GLPI: id_search_option 76695 = "Pendências" em NetworkEquipment,
 * conferido contra o motor de busca real (Search::getDatas) em 2026-08-31 —
 * é o único dos campos do fluxo que é pesquisável no GLPI (Status Vistoria
 * não é). Por isso a contagem do e-mail (fetchContagemPendenciaCPFL) usa o
 * MESMO critério — pendência, não status — pra nunca divergir do que a
 * pessoa vê ao clicar.
 *
 * Lista de destinatários definida em 2026-09-01, direto pelo usuário —
 * contatos da CPFL responsáveis pela análise. Mudar aqui é intencional:
 * qualquer alteração fica no histórico do git, auditável.
 */
const DESTINATARIOS_CPFL = [
  "dbatistacarlos@cpfl.com.br",
  "mbertigimenes@cpfl.com.br",
  "odair.mota@cpfl.com.br",
  "teduardoferreira@cpfl.com.br",
  "vdasilva2@cpfl.com.br",
  "victorm.santos@cpfl.com.br",
  "ddonascimentofarias@cpfl.com.br",
  "charles.alves@cpfl.com.br",
  "pablocoelho@cpfl.com.br",
  "anderson.fraga@cpfl.com.br",
  "felippe.guedes@cpfl.com.br",
];

const URL_GLPI_PENDENCIAS =
  "https://gioc.nansen.com.br/front/networkequipment.php?is_deleted=0&criteria[0][field]=76695&criteria[0][searchtype]=equals&criteria[0][value]=1";

function autorizado(req: Request): boolean {
  const secretEsperado = process.env.CRON_LEMBRETE_SECRET;
  if (!secretEsperado) return false; // sem secret configurado, nunca autoriza
  const recebido = req.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(recebido);
  const b = Buffer.from(secretEsperado);
  // timingSafeEqual exige buffers do mesmo tamanho — compara tamanho antes
  // (vazar o tamanho do secret não é o que essa checagem protege).
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }

  try {
    const quantidade = await fetchContagemPendenciaCPFL();
    const { html, attachments } = await montarEmailPendenciaCPFL({
      quantidade,
      url: URL_GLPI_PENDENCIAS,
    });

    // BCC: destinatários são contatos externos da CPFL, não devem ver a
    // lista uns dos outros. `to` precisa de alguém — o próprio remetente.
    const remetente = process.env.SMTP_SENDER ?? "comunicacao.ami@nansen.com.br";
    const r = await sendMail({
      to: remetente,
      bcc: DESTINATARIOS_CPFL,
      subject: `Lembrete · ${quantidade} ${quantidade === 1 ? "projeto" : "projetos"} com Pendência CPFL para análise`,
      html,
      attachments,
    });

    if (!r.ok) {
      console.error("[/api/painel/cpfl/lembrete] falha no envio:", r.error);
      return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
    }

    console.log(
      `[/api/painel/cpfl/lembrete] enviado a ${DESTINATARIOS_CPFL.length} destinatários, quantidade=${quantidade}`
    );
    return NextResponse.json({ ok: true, quantidade, destinatarios: DESTINATARIOS_CPFL.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/painel/cpfl/lembrete]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
