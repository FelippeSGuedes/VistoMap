import "server-only";

/**
 * Sanitiza um nome de equipamento para uso como pasta no filesystem.
 * Remove caracteres perigosos (path traversal) e mantém um slug compatível.
 */
export function sanitizeFolderName(raw: string): string {
  const slug = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  // "." e ".." sobrevivem ao replace acima (ponto é caractere permitido) e
  // continuam válidos pro filesystem como "diretório atual"/"diretório pai"
  // — bloqueia especificamente um resultado que seja só pontos (path
  // traversal), sem afetar nomes reais de equipamento que usem ponto.
  return slug && !/^\.+$/.test(slug) ? slug : "equipamento";
}
