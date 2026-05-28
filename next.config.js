/** @type {import('next').NextConfig} */
// Desabilita PWA no build do PAINEL (admin nao precisa de offline/install).
// PWA tambem complica assetPrefix quando basePath nao esta ativo.
const PWA_DISABLED = process.env.NODE_ENV === "development" ||
                     process.env.BUILD_VARIANT === "painel";
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: PWA_DISABLED,
  buildExcludes: [/middleware-manifest\.json$/],
  // Handler customizado de notificationclick (foca aba existente / abre URL).
  importScripts: ["/notification-handler.js"],
  // Não deixar o Service Worker interceptar rotas /api/* nem o próprio _next/data.
  // Caso o SW pegue um POST multipart, alguns navegadores retornam 404/0 silenciosamente.
  exclude: [
    /\/api\/.*/,
    /^\/_next\/data\/.*/,
  ],
  runtimeCaching: [
    {
      // Bypass total para qualquer chamada ao backend interno.
      urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
      handler: "NetworkOnly",
      method: "GET",
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
      handler: "NetworkOnly",
      method: "POST",
    },
    {
      urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "mapbox-tiles",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-images",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      method: "GET",
      options: {
        cacheName: "http-cache",
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
  ],
});

// basePath/assetPrefix dinâmicos via env.
//
// Cuidado: basePath faz o Next STRIPAR o prefix da URL antes de rotear,
// então /painel/login -> rota interna /login (= src/app/login = TECNICO!).
//
// Por isso usamos:
//   • tecnico (/app):  basePath=/app  → src/app/* renderiza certo
//   • painel  (/painel): SEM basePath, SO assetPrefix=/painel
//     (rota /painel/login bate com src/app/painel/login natural).
//     nginx faz rewrite /painel/_next/* -> /_next/* pros assets.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const USE_BASE_PATH = process.env.NEXT_PUBLIC_USE_BASE_PATH !== "false";

const nextConfig = {
  output: "standalone",
  basePath: USE_BASE_PATH && BASE_PATH ? BASE_PATH : undefined,
  assetPrefix: BASE_PATH || undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
    // Aumenta o limite de body para Server Actions e route handlers.
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

module.exports = withPWA(nextConfig);
