import { api, setAuthToken } from "./api";
import type { AuthSession } from "@/types";
import { MOCK_TECNICO } from "@/utils/mock";

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
  // TODO: substituir pelo endpoint real quando autenticação estiver pronta
  const session: AuthSession = {
    token: "demo-token-" + Math.random().toString(36).slice(2),
    tecnico: { ...MOCK_TECNICO, email: input.email },
    expiresAt: Date.now() + 1000 * 60 * 60 * 8,
  };
  persist(session);
  return session;
}

export function logout() {
  persist(null);
}

export const authService = { login, logout, loadSession };
