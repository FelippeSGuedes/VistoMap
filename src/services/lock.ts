"use client";

/**
 * Trava diária local — verificação 100% offline (Web Crypto SHA-256 salgado,
 * sem round-trip de rede). Ameaça modelada é "alguém pega o celular
 * destravado", não ataque offline sofisticado — por isso SHA-256+salt;
 * bcrypt/scrypt/argon2 pediriam biblioteca extra desproporcional pro caso
 * de uso.
 */

const HASH_KEY = "vistomap.lock.passwordHash";
const SALT_KEY = "vistomap.lock.salt";
const LAST_UNLOCK_KEY = "vistomap.lock.lastUnlockedDate";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function randomSaltHex(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Chamado logo após um login bem-sucedido — deriva e guarda o hash local. */
export async function deriveAndStoreHash(senha: string): Promise<void> {
  try {
    const salt = randomSaltHex();
    const hash = await sha256Hex(`${salt}:${senha}`);
    window.localStorage.setItem(SALT_KEY, salt);
    window.localStorage.setItem(HASH_KEY, hash);
  } catch {
    // Web Crypto indisponível — sem hash local, shouldShowLockToday() cai
    // em "sem trava configurada" e nunca bloqueia o técnico por isso.
  }
}

export async function verifyPassword(senha: string): Promise<boolean> {
  try {
    const salt = window.localStorage.getItem(SALT_KEY);
    const stored = window.localStorage.getItem(HASH_KEY);
    if (!salt || !stored) return false;
    const hash = await sha256Hex(`${salt}:${senha}`);
    return hash === stored;
  } catch {
    return false;
  }
}

/**
 * BUG (achado em teste real, 2026-09-02): sessão de ANTES da trava diária
 * existir sobrevive ao cold-start via loadSession()/hydrate() (services/auth.ts) —
 * nunca passa pelo onSubmit do LoginPage de novo enquanto o token não expirar,
 * então deriveAndStoreHash() nunca roda e HASH_KEY nunca é gravado. Gating
 * nesta função em "hash existe?" fazia esses aparelhos NUNCA travarem.
 * Gating em LAST_UNLOCK_KEY em vez disso: ausência de registro de
 * desbloqueio (sessão antiga OU primeiro login) conta igual a "precisa
 * travar hoje" — LockScreenOverlay decide como confirmar com base em
 * hasLocalHash() (ver função abaixo).
 */
export function shouldShowLockToday(): boolean {
  try {
    return window.localStorage.getItem(LAST_UNLOCK_KEY) !== todayStr();
  } catch {
    return false;
  }
}

/** true = já tem hash local pra comparar rápido; false = sessão anterior à
 * trava (ou primeiro login neste aparelho) — precisa confirmar contra o
 * backend uma vez pra semear o hash (ver LockScreenOverlay). */
export function hasLocalHash(): boolean {
  try {
    return !!window.localStorage.getItem(HASH_KEY);
  } catch {
    return false;
  }
}

export function markUnlockedToday(): void {
  try {
    window.localStorage.setItem(LAST_UNLOCK_KEY, todayStr());
  } catch {
    /* ignora */
  }
}

/** Chamado no logout — hash local não pode sobreviver a troca de usuário
 * no mesmo aparelho (aparelhos de campo às vezes são compartilhados). */
export function clearLock(): void {
  try {
    window.localStorage.removeItem(HASH_KEY);
    window.localStorage.removeItem(SALT_KEY);
    window.localStorage.removeItem(LAST_UNLOCK_KEY);
  } catch {
    /* ignora */
  }
}

/**
 * Feature-detection da biometria nativa — hoje sempre indisponível (o
 * plugin só entra na Fase 3b do build nativo). Centralizado aqui pra
 * LockScreenOverlay não precisar mudar quando a Fase 3b ligar de verdade.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  return false;
}

export async function verifyBiometric(): Promise<boolean> {
  return false;
}
