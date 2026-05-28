/**
 * Server layout wrapper do /painel.
 *
 * Existe ÚNICAMENTE pra exportar `dynamic = "force-dynamic"` —
 * desabilita prerender estático em build time pra TODAS as rotas
 * /painel/*. Sem isto, Next 14 tenta prerender com SSR e em algumas
 * rotas o resultado vira _not-found (404) silenciosamente.
 *
 * UI real fica em ./client-layout (use client + framer + zustand).
 */

import PainelClientLayout from "./client-layout";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const dynamicParams = true;
export const revalidate = 0;

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Leitura explícita de headers: força Next.js a marcar TODAS as rotas
  // /painel/* como ƒ (dynamic/SSR) no build, evitando prerender estático
  // que falha silenciosamente para páginas sem sessão (retorna _not-found).
  // Sem isto, páginas 'use client' puras ignoram o dynamic="force-dynamic"
  // do layout e são geradas como ○ (static) sem .html → 404 em produção.
  headers();
  return <PainelClientLayout>{children}</PainelClientLayout>;
}
