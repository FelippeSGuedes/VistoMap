import { api, setAuthToken } from "./api";
import { clearLock } from "./lock";
import type { AuthSession } from "@/types";

export interface LoginInput {
  login: string;
  senha: string;
}

export interface PainelLoginInput {
  login: string;
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

/** Login do app técnico — autentica por e-mail. */
export async function login(input: LoginInput): Promise<AuthSession> {
  const res = await api.post<AuthSession>("/auth/login", {
    login: input.login,
    senha: input.senha,
  });
  persist(res.data);
  return res.data;
}

/** Login do painel admin — autentica por usuário GLPI ou e-mail. */
export async function loginAdmin(input: PainelLoginInput): Promise<AuthSession> {
  const res = await api.post<AuthSession>("/auth/painel-login", {
    login: input.login,
    senha: input.senha,
  });
  persist(res.data);
  return res.data;
}

export function logout() {
  persist(null);
  // Hash local da trava diária não pode sobreviver a troca de usuário no
  // mesmo aparelho (aparelhos de campo às vezes são compartilhados).
  clearLock();
}

export const authService = { login, loginAdmin, logout, loadSession };
