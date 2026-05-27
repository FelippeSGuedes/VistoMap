/**
 * Prefixa um caminho de asset estático com o basePath/assetPrefix da deploy.
 *
 * Necessário pra tags <img>, <video>, background-image CSS e similares
 * (Next.js NÃO injeta basePath automaticamente nesses — só em <Link>,
 * <Image> e router.push).
 *
 * Uso:
 *   <img src={asset("/logo.png")} />
 *
 * Em raiz (sem deploy prefix): asset("/logo.png") = "/logo.png"
 * Em /app:                     asset("/logo.png") = "/app/logo.png"
 * Em /painel:                  asset("/logo.png") = "/painel/logo.png"
 */
export function asset(path: string): string {
  const prefix = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (!prefix) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${prefix}${p}`;
}
