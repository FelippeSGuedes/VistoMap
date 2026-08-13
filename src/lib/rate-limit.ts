import "server-only";

/**
 * Rate limit em memória pra login (`/api/auth/login`, `/api/auth/painel-login`)
 * — não existia nenhuma proteção contra força bruta antes disso. Em memória
 * (não Redis) porque o deploy é single-instance; se algum dia virar
 * multi-instância isso precisa migrar pra um store compartilhado.
 *
 * Pensado pra não afetar uso normal: quem acerta a senha de primeira nunca
 * esbarra nisso — só passa a bloquear tentativa repetida (backoff progressivo
 * depois de MAX_ATTEMPTS falhas na mesma janela).
 */

interface Attempt {
  count: number;
  firstAt: number;
  blockedUntil: number;
}

const attempts = new Map<string, Attempt>();

const WINDOW_MS = 15 * 60 * 1000; // 15 min
const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_SECONDS = 300; // 5 min

// Limpeza periódica pra não vazar memória com chaves antigas/resolvidas.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, a] of attempts) {
    if (now - a.firstAt > WINDOW_MS && now > a.blockedUntil) attempts.delete(key);
  }
}, 10 * 60 * 1000);
cleanupTimer.unref?.();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/** Chave = IP + identificador (ex.: username) — isola um atacante numa conta
 * sem penalizar outros usuários atrás do mesmo IP (rede de escritório/NAT). */
export function checkLoginRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const a = attempts.get(key);

  if (!a) {
    attempts.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
    return { allowed: true };
  }

  if (now < a.blockedUntil) {
    return { allowed: false, retryAfterSeconds: Math.ceil((a.blockedUntil - now) / 1000) };
  }

  if (now - a.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
    return { allowed: true };
  }

  a.count += 1;
  if (a.count > MAX_ATTEMPTS) {
    const backoffSeconds = Math.min(2 ** (a.count - MAX_ATTEMPTS), MAX_BACKOFF_SECONDS);
    a.blockedUntil = now + backoffSeconds * 1000;
    return { allowed: false, retryAfterSeconds: backoffSeconds };
  }
  return { allowed: true };
}

/** Chama em login bem-sucedido — não carrega falhas antigas pro próximo turno. */
export function resetLoginRateLimit(key: string): void {
  attempts.delete(key);
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}
