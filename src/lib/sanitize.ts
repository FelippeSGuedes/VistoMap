import "server-only";

/**
 * Sanitiza um nome de equipamento para uso como pasta no filesystem.
 * Remove caracteres perigosos (path traversal) e mantém um slug compatível.
 */
export function sanitizeFolderName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120)
    || "equipamento";
}
