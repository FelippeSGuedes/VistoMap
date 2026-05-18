import { setAuthToken } from "./api";
import type { AuthSession } from "@/types";

export interface LoginInput {
  email: string;
  senha: string;
}

const SESSION_KEY = "vistomap.session";

function persist(session: AuthSession | null) {
  if (typeof window === "undefined") return;
  if (session) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setAuthToken(session.token);
  } else {
    window.localStorage.removeItem(SESSION_KEY);
    setAuthToken(null);
  }
}

export function loadSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AuthSession;
    if (session.expiresAt && session.expiresAt > Date.now()) {
      setAuthToken(session.token);
      return session;
    }
  } catch {
    /* noop */
  }
  persist(null);
  return null;
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, senha: input.senha }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { message?: string }).message || "Credenciais inválidas"
    );
  }
  const session = (await res.json()) as AuthSession;
  persist(session);
  return session;
}

export function logout() {
  persist(null);
}

export const authService = { login, logout, loadSession };
