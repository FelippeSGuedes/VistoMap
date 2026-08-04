import { api } from "./api";
import type { Instalacao, InstalacaoChecklistKey } from "@/types";

/**
 * Serviço do módulo de Instalação — chamadas diretas (sem fila offline),
 * mesmo padrão já usado em corrigirDevolucao (vistorias.ts): volume baixo
 * por instalação, técnico vendo a tela na hora. Suporte offline completo
 * (write-ahead + fila IndexedDB, como finalizarVistoria) fica pra uma
 * proxima fase, se o campo mostrar necessidade — não bloqueia o módulo.
 */

export async function fetchInstalacoes(): Promise<Instalacao[]> {
  const { data } = await api.get<Instalacao[]>("/instalacoes");
  return data;
}

export async function fetchInstalacao(id: string): Promise<Instalacao> {
  const { data } = await api.get<Instalacao>(`/instalacoes/${id}`);
  return data;
}

export async function assumirInstalacao(id: string): Promise<{ ok: true; instalacao: Instalacao }> {
  const { data } = await api.post(`/instalacoes/${id}/assumir`);
  return data;
}

export interface FinalizarInstalacaoInput {
  checklist: Partial<Record<InstalacaoChecklistKey, boolean>>;
  tensaoIdentificadaId: number;
  fotos: Partial<Record<`foto${1 | 2 | 3 | 4 | 5 | 6 | 7}`, Blob>>;
}

export async function finalizarInstalacao(
  id: string,
  input: FinalizarInstalacaoInput
): Promise<{ ok: true; instalacao_id: number }> {
  const form = new FormData();
  form.append(
    "payload",
    JSON.stringify({ checklist: input.checklist, tensaoIdentificadaId: input.tensaoIdentificadaId })
  );
  for (const [campo, blob] of Object.entries(input.fotos)) {
    if (!blob) continue;
    form.append(campo, new File([blob], `${campo}.jpg`, { type: blob.type }));
  }
  // Content-Type: undefined remove o header default (application/json) da
  // instância `api` — deixa o browser gerar o boundary do multipart sozinho.
  const { data } = await api.post(`/instalacoes/${id}/finalizar`, form, {
    headers: { "Content-Type": undefined },
  });
  return data;
}

export interface RejeitarInstalacaoInput {
  motivo: string;
  justificativa: string;
  foto1: Blob;
  foto2?: Blob;
  foto3?: Blob;
}

export async function rejeitarInstalacao(
  id: string,
  input: RejeitarInstalacaoInput
): Promise<{ ok: true; rejeicaoId: number }> {
  const form = new FormData();
  form.append("payload", JSON.stringify({ motivo: input.motivo, justificativa: input.justificativa }));
  form.append("foto1", new File([input.foto1], "foto1.jpg", { type: input.foto1.type }));
  if (input.foto2) form.append("foto2", new File([input.foto2], "foto2.jpg", { type: input.foto2.type }));
  if (input.foto3) form.append("foto3", new File([input.foto3], "foto3.jpg", { type: input.foto3.type }));
  const { data } = await api.post(`/instalacoes/${id}/rejeitar`, form, {
    headers: { "Content-Type": undefined },
  });
  return data;
}

export const instalacoesService = {
  fetchInstalacoes,
  fetchInstalacao,
  assumirInstalacao,
  finalizarInstalacao,
  rejeitarInstalacao,
};
