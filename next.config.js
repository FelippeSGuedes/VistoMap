/** @type {import('next').NextConfig} */
// Desabilita PWA no build do PAINEL (admin nao precisa de offline/install).
// PWA tambem complica assetPrefix quando basePath nao esta ativo.
// Mobile = export estático embutido no APK (offline real). Sem PWA/SW
// (offline passa a ser nativo via arquivos locais).
const IS_MOBILE = process.env.BUILD_VARIANT === "mobile";
const PWA_DISABLED = process.env.NODE_ENV === "development" ||
                     process.env.BUILD_VARIANT === "painel" ||
                     IS_MOBILE;
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
//   • painel  (/painel): SEM basePath, assetPrefix=/painel-cdn (DISTINTO de /painel)
//     (rota /painel/login bate com src/app/painel/login natural).
//
// IMPORTANTE: assetPrefix NÃO pode ser prefix das rotas, senão Next 14.2.18
// router-server faz pathname.startsWith(assetPrefix) e STRIPA o prefix das
// URLs de página, mandando /painel/mapa pra lookup em /mapa (que não existe
// no técnico) e retornando 404. Solução: assetPrefix=/painel-cdn pra painel.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const USE_BASE_PATH = process.env.NEXT_PUBLIC_USE_BASE_PATH !== "false";
const BUILD_VARIANT = process.env.BUILD_VARIANT || "tecnico";

const ASSET_PREFIX = BUILD_VARIANT === "painel"
  ? "/painel-cdn"
  : (BASE_PATH || undefined);

const nextConfig = {
  // Mobile: export estático (out/) pro Capacitor. Web: standalone (Node).
  output: IS_MOBILE ? "export" : "standalone",
  // Mobile carrega do APK na raiz → sem basePath/assetPrefix.
  basePath: IS_MOBILE ? undefined : (USE_BASE_PATH && BASE_PATH ? BASE_PATH : undefined),
  assetPrefix: IS_MOBILE ? undefined : ASSET_PREFIX,
  // Export precisa de URLs com barra final (cada rota → pasta/index.html).
  trailingSlash: IS_MOBILE ? true : false,
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // Export não tem otimizador de imagem em runtime.
    unoptimized: IS_MOBILE,
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
