import "server-only";
import { listEnabledSubscriptions, deleteSubscriptionById } from "@/lib/glpi/pushPrefs";
import { ACAO_TITULO, ACAO_HREF, categoriaDeAcao } from "@/lib/notifCategorias";
import type { AuditEntry } from "@/types";

/**
 * Web push do painel (VAPID, self-contained — sem Firebase).
 *
 * Envia notificação do navegador só pros analistas que têm a CATEGORIA
 * daquele evento habilitada (ver @/lib/notifCategorias) e que já
 * registraram a inscrição no browser. Best-effort: exceções são engolidas;
 * inscrições inválidas (410/404) são removidas.
 */

type WebPushLib = typeof import("web-push");
let cached: WebPushLib | null = null;

function getWebPush(): WebPushLib | null {
  if (cached) return cached;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  let wp: WebPushLib;
  try {
    // require dinâmico — não quebra o build se o pacote faltar em algum contexto.
    wp = require("web-push") as WebPushLib;
  } catch {
    return null;
  }
  const subject = process.env.VAPID_SUBJECT ?? "mailto:felippegustavo1@gmail.com";
  wp.setVapidDetails(subject, pub, priv);
  cached = wp;
  return wp;
}

/**
 * Qualquer ação de auditoria é aceita aqui — nem toda `acao` mapeia pra uma
 * categoria de notificação (`categoriaDeAcao` devolve null nesse caso e
 * `sendPainelWebPush` só retorna sem fazer nada), então não vale a pena
 * estreitar esse tipo pra só as ações mapeadas hoje.
 */
export type AlertaAcao = AuditEntry["acao"];

export interface WebPushEvento {
  acao: AlertaAcao;
  equipamento: string;
  tecnico: string;
  vistoriaId?: string | number;
}

/**
 * Dispara web push do evento pros analistas com a categoria dele habilitada.
 * Fire-and-forget: chame com `void sendPainelWebPush(...)` dentro das rotas
 * de evento.
 */
export async function sendPainelWebPush(ev: WebPushEvento): Promise<void> {
  const wp = getWebPush();
  if (!wp) return; // web push não configurado — silencioso

  const categoria = categoriaDeAcao(ev.acao);
  if (!categoria) return; // ação sem categoria mapeada — não notifica

  let subs;
  try {
    subs = await listEnabledSubscriptions(categoria);
  } catch {
    return;
  }
  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title: ACAO_TITULO[ev.acao] ?? "Notificação",
    body: `${ev.equipamento} · ${ev.tecnico}`,
    url: ACAO_HREF[ev.acao] ?? "/painel/notificacoes",
    tag: `${ev.acao}-${ev.vistoriaId ?? ""}`,
    icon: "/painel/logo_favicon.PNG",
  });

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await wp.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 600 }
        );
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        // 410 Gone / 404 Not Found → inscrição morta, remove.
        if (code === 410 || code === 404) {
          await deleteSubscriptionById(s.id).catch(() => {});
        }
      }
    })
  );
}
