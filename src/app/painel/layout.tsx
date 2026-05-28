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

export const dynamic = "force-dynamic";
export const dynamicParams = true;
export const revalidate = 0;

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PainelClientLayout>{children}</PainelClientLayout>;
}
