import type { Metadata, Viewport } from "next";
import "./globals.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { Providers } from "./providers";

// Next 14 NAO injeta basePath em metadata.icons[].url nem em manifest path.
// Prefixa manual pra evitar 404 quando deploy usa /app ou /painel.
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: {
    default: "VistoMap — Vistorias em Campo",
    template: "%s · VistoMap",
  },
  description:
    "Plataforma enterprise de vistorias técnicas em campo, com mapa operacional, GPS e workflow integrado ao GLPI.",
  applicationName: "VistoMap",
  manifest: `${BP}/manifest.json`,
  icons: {
    icon: [
      { url: `${BP}/logo_favicon.PNG`, type: "image/png" },
      { url: `${BP}/favicon.svg`, type: "image/svg+xml" },
    ],
    apple: [{ url: `${BP}/logo_favicon.PNG` }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VistoMap",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#073B4C" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1416" },
  ],
};

// Confirma pro @capgo/capacitor-updater "o bundle carregou" o MAIS CEDO
// possível — antes de qualquer JS do React rodar, direto no parse do HTML.
// Sem isso, o plugin só ouve essa confirmação depois que a árvore de
// componentes inteira (Providers, hooks, todas as páginas) monta com
// sucesso; se QUALQUER coisa atrasar ou travar esse mount (bundle maior,
// aparelho mais lento, um erro de render em qualquer página), o plugin
// entende que o bundle está quebrado e reverte sozinho pro anterior depois
// de appReadyTimeout (15s) — e o app "volta pra versão de antes" sem
// nenhum erro visível, parecendo um vai-e-volta entre versões. Isso aqui
// desacopla a confirmação do sucesso do React inteiro: só depende do
// HTML/JS mínimo ter chegado. O hook useOtaUpdate (React) continua
// chamando de novo depois — é seguro, o plugin aceita a confirmação
// repetida sem problema.
const NOTIFY_APP_READY_SCRIPT = `
(function () {
  function tentar() {
    try {
      var cap = window.Capacitor;
      if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
        var Updater = cap.Plugins && cap.Plugins.CapacitorUpdater;
        if (Updater && Updater.notifyAppReady) {
          Updater.notifyAppReady().catch(function () {});
          return true;
        }
      }
    } catch (e) {}
    return false;
  }
  // A ponte nativa do Capacitor (window.Capacitor) pode não existir ainda
  // no exatíssimo instante em que esse script roda — tenta de novo por até
  // ~5s (bem mais rápido que esperar a árvore inteira do React montar).
  if (tentar()) return;
  var tentativas = 0;
  var id = setInterval(function () {
    tentativas++;
    if (tentar() || tentativas > 50) clearInterval(id);
  }, 100);
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-brand-ice text-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: NOTIFY_APP_READY_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
