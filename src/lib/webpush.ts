import "server-only";
import { listEnabledSubscriptions, deleteSubscriptionById } from "@/lib/glpi/pushPrefs";

/**
 * Web push do painel (VAPID, self-contained — sem Firebase).
 *
 * Envia notificação do navegador para os analistas que o admin habilitou
 * (flag notificar=1) e que já registraram a inscrição no browser. Best-effort:
 * exceções são engolidas; inscrições inválidas (410/404) são removidas.
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

export type AlertaAcao =
  | "recusa-solicitada"
  | "override-solicitado"
  | "vistoria-finalizada"
  | "devolucao-resolvida";

const CONTEUDO: Record<AlertaAcao, { title: string; url: string }> = {
  "recusa-solicitada":   { title: "Nova recusa",         url: "/painel/notificacoes" },
  "override-solicitado": { title: "Pedido de exceção",   url: "/painel/notificacoes" },
  "vistoria-finalizada": { title: "Vistoria concluída",  url: "/painel/realizadas" },
  "devolucao-resolvida": { title: "Devolução corrigida", url: "/painel/devolucoes" },
};

export interface WebPushEvento {
  acao: AlertaAcao;
  equipamento: string;
  tecnico: string;
  vistoriaId?: string | number;
}

/**
 * Dispara web push do evento para todos os analistas habilitados. Fire-and-forget:
 * chame com `void sendPainelWebPush(...)` dentro das rotas de evento.
 */
export async function sendPainelWebPush(ev: WebPushEvento): Promise<void> {
  const wp = getWebPush();
  if (!wp) return; // web push não configurado — silencioso

  let subs;
  try {
    subs = await listEnabledSubscriptions();
  } catch {
    return;
  }
  if (subs.length === 0) return;

  const cfg = CONTEUDO[ev.acao];
  const payload = JSON.stringify({
    title: cfg.title,
    body: `${ev.equipamento} · ${ev.tecnico}`,
    url: cfg.url,
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
