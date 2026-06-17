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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-brand-ice text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
