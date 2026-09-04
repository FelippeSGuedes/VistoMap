import { api } from "./api";
import type { AuthSession } from "@/types";

export interface ValidarInput {
  nome: string;
  email: string;
  matricula: string;
  senha: string;
}

export interface ValidarResult {
  ticket: string;
  nome: string;
}

/** Passo 1 — navegador, identidade contra o GLPI. */
export async function validar(input: ValidarInput): Promise<ValidarResult> {
  const { data } = await api.post<ValidarResult>("/liberar-acesso/validar", input);
  return data;
}

export interface GerarCodigoResult {
  codigo: string;
  expiraEm: string;
}

/** Passo 2 — navegador, depois do termo aceito. */
export async function gerarCodigo(ticket: string): Promise<GerarCodigoResult> {
  const { data } = await api.post<GerarCodigoResult>("/liberar-acesso/gerar-codigo", { ticket });
  return data;
}

/** Passo 3 — dentro do app já instalado, troca o código pelo vínculo de verdade. */
export async function confirmar(
  codigo: string,
  deviceId: string,
  deviceModel?: string | null
): Promise<AuthSession> {
  const { data } = await api.post<AuthSession>("/liberar-acesso/confirmar", {
    codigo,
    deviceId,
    deviceModel,
  });
  return data;
}

export const liberarAcessoService = { validar, gerarCodigo, confirmar };
