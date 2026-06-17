import axios, { AxiosError, AxiosInstance } from "axios";

// Quando basePath está ativo (NEXT_PUBLIC_BASE_PATH=/app ou /painel),
// o Next NÃO injeta automaticamente no fetch/axios — precisa prefixar manual.
// Mantém suporte ao override via NEXT_PUBLIC_API_URL (caso o backend
// esteja em outro host).
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const baseURL =
  process.env.NEXT_PUBLIC_API_URL ||
  (BASE_PATH ? `${BASE_PATH}/api` : "/api");

/**
 * Raiz da API para `fetch` cru (fora do axios). Respeita NEXT_PUBLIC_API_URL
 * — essencial no app bundlado (mobile), onde a API é remota e a origem é local.
 * Já inclui o sufixo `/api`; use como `${API_BASE}/vistorias/...`.
 */
export const API_BASE = baseURL;

export const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 20_000,
  headers: { "Content-Type": "application/json" },
});

const TOKEN_KEY = "vistomap.token";

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      setAuthToken(null);
    }
    return Promise.reject(error);
  }
);

export type ApiError = AxiosError<{ message?: string; error?: string }>;
