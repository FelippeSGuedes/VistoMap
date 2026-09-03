import { api } from "./api";
import type { AuthSession } from "@/types";

export interface ValidarInput {
  nome: string;
  email: string;
  matricula: string;
  senha: string;
  deviceId: string;
  deviceModel?: string | null;
}

export interface ValidarResult {
  ticket: string;
  nome: string;
}

export async function validar(input: ValidarInput): Promise<ValidarResult> {
  const { data } = await api.post<ValidarResult>("/liberar-acesso/validar", input);
  return data;
}

export async function confirmar(ticket: string): Promise<AuthSession> {
  const { data } = await api.post<AuthSession>("/liberar-acesso/confirmar", { ticket });
  return data;
}

export const liberarAcessoService = { validar, confirmar };
