/**
 * VistoMap · notification-handler.js
 *
 * Anexado ao Service Worker gerado pelo next-pwa via importScripts.
 * Trata clicks em notificações: foca a aba do app se já estiver aberta,
 * caso contrário abre uma nova aba na URL recebida em notification.data.url.
 */

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/vistorias";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Se já tem aba do app aberta → foca e navega para a URL.
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              try {
                return client.navigate(url);
              } catch (_) {
                /* navigate pode falhar entre origens — fallback abre nova aba */
              }
            }
            return;
          }
        }
        // Sem aba aberta → abre nova.
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

/**
 * Handler push (futuro). Permite que um backend envie web push real (VAPID).
 * Por enquanto, dispara notification se payload válido.
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (_) {
    payload = { title: event.data.text(), body: "" };
  }
  const title = payload.title || "VistoMap";
  const opts = {
    body: payload.body || "",
    icon: payload.icon || "/logo_favicon.PNG",
    badge: "/logo_favicon.PNG",
    tag: payload.tag,
    data: { url: payload.url || "/vistorias" },
    vibrate: [120, 60, 120],
    renotify: !!payload.tag,
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});
