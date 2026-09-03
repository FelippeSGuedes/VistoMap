import "server-only";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Confere senha em texto puro contra o hash armazenado em `glpi_users.password`.
 * GLPI grava bcrypt (`$2y$`) hoje; sha1 puro é suporte a hash legado (contas
 * antigas nunca re-hasheadas). Extraído de auth/login/route.ts pra reusar em
 * liberar-acesso/validar sem duplicar.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$2y$") || stored.startsWith("$2b$")) {
    return bcrypt.compare(plain, stored.replace(/^\$2y\$/, "$2b$"));
  }
  return crypto.createHash("sha1").update(plain).digest("hex") === stored;
}
