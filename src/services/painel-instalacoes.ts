import { api } from "./api";
import type { PainelInstalacoesMapaResponse, PainelInstalacoesStats } from "@/types/painel-instalacoes";
import type { TecnicoAtivo } from "@/types";

/**
 * Service do painel administrativo para Instalação — paralelo a
 * `src/services/painel.ts` (Vistoria), sem importá-lo. Sem fallback mock
 * (diferente do service de Vistoria): se a API falhar, o dashboard mostra
 * o erro em vez de dados fictícios.
 */

export async function fetchInstalacoesStats(): Promise<PainelInstalacoesStats> {
  const { data } = await api.get<PainelInstalacoesStats>("/painel/instalacoes/stats");
  return data;
}

export async function fetchInstalacoesMapa(): Promise<PainelInstalacoesMapaResponse> {
  const { data } = await api.get<PainelInstalacoesMapaResponse>("/painel/instalacoes/mapa");
  return data;
}

export async function fetchInstaladoresAtivos(): Promise<TecnicoAtivo[]> {
  const { data } = await api.get<TecnicoAtivo[]>("/painel/instalacoes/tecnicos");
  return data;
}
