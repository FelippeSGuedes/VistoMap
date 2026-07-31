import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const runtime = "nodejs";

/**
 * Service worker de web push do painel, servido como API route.
 *
 * Por que não um arquivo estático em public/? O nginx não serve `.js` sob
 * /painel/ (a regex de assets estáticos não inclui js), então cairia em 404.
 * Servindo aqui com `Service-Worker-Allowed: /painel/` o SW pode controlar
 * todo o /painel/ mesmo estando num path mais fundo (/api/painel/push-sw).
 */
const SW = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let p;
  try { p = event.data.json(); } catch (_) { p = { title: "VistoMap", body: event.data.text() }; }
  const title = p.title || "VistoMap";
  event.waitUntil(self.registration.showNotification(title, {
    body: p.body || "",
    icon: p.icon || "/painel/logo_favicon.PNG",
    badge: "/painel/logo_favicon.PNG",
    tag: p.tag,
    data: { url: p.url || "/painel" },
    vibrate: [120, 60, 120],
    renotify: !!p.tag,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/painel";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.focus();
          if ("navigate" in c) { try { return c.navigate(url); } catch (_) { /* cross-origin */ } }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
`;

export function GET() {
  return new NextResponse(SW, {
    status: 200,
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/painel/",
      "Cache-Control": "no-cache",
    },
  });
}
