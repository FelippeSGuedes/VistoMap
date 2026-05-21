import { api, setAuthToken } from "./api";
import type { AuthSession } from "@/types";

export interface LoginInput {
  /** Usuário (username GLPI) ou e-mail. */
  login?: string;
  /** Compat: chave alternativa quando só temos email. */
  email?: string;
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
  const payload = {
    login: input.login ?? input.email,
    senha: input.senha,
  };
  const { data } = await api.post<AuthSession>("/auth/login", payload);
  persist(data);
  return data;
}

export function logout() {
  persist(null);
}

export const authService = { login, logout, loadSession };
