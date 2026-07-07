import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CORS para os endpoints /api.
 *
 * Necessário porque o app técnico empacotado no APK (Capacitor) roda numa
 * origem local (https://localhost / capacitor://localhost) e chama a API
 * remota (https://zabbmap.nansen.com.br/app/api) — requisição cross-origin.
 *
 * Auth é por Bearer token (header), NÃO cookie → liberar Allow-Origin: *
 * é seguro (sem credenciais de sessão via cookie).
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-App-Build",
  "Access-Control-Max-Age": "86400",
};

export function middleware(req: NextRequest) {
  // Preflight: responde direto, sem tocar na rota.
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

// Cobre os dois formatos: com basePath (/app/api no container técnico) e sem
// (/api no painel). O Next pode ou não auto-prefixar o basePath no matcher
// dependendo da versão — incluir ambos garante o match em qualquer caso.
export const config = {
  matcher: ["/api/:path*", "/app/api/:path*"],
};
