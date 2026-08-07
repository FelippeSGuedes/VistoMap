import { api } from "./api";
import type {
  InstalacaoPainelListResponse,
  InstalacaoPainelStatus,
  PainelInstalacoesMapaResponse,
  PainelInstalacoesStats,
} from "@/types/painel-instalacoes";
import type { Instalacao, TecnicoAtivo } from "@/types";

export interface InstalacaoFile {
  name: string;
  url: string;
  size: number;
  modifiedAt: string;
  kind: "image" | "other";
}

export interface InstalacaoFilesResponse {
  equipamento: string;
  folder: string;
  items: InstalacaoFile[];
}

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

export interface FetchInstalacoesListaFiltros {
  status: InstalacaoPainelStatus;
  municipio?: string;
  instaladorId?: number;
  query?: string;
  desde?: string;
  ate?: string;
  limit?: number;
  offset?: number;
}

export async function fetchInstalacoesLista(
  filtros: FetchInstalacoesListaFiltros
): Promise<InstalacaoPainelListResponse> {
  const params: Record<string, string | number> = { status: filtros.status };
  if (filtros.municipio) params.municipio = filtros.municipio;
  if (filtros.instaladorId != null) params.instalador_id = filtros.instaladorId;
  if (filtros.query) params.q = filtros.query;
  if (filtros.desde) params.desde = filtros.desde;
  if (filtros.ate) params.ate = filtros.ate;
  if (filtros.limit != null) params.limit = filtros.limit;
  if (filtros.offset != null) params.offset = filtros.offset;

  const { data } = await api.get<InstalacaoPainelListResponse>("/painel/instalacoes/lista", { params });
  return data;
}

export async function fetchInstalacaoDetalhe(id: string | number): Promise<Instalacao> {
  const { data } = await api.get<Instalacao>(`/painel/instalacoes/${id}`);
  return data;
}

export async function fetchInstalacaoFiles(id: string | number): Promise<InstalacaoFilesResponse> {
  const { data } = await api.get<InstalacaoFilesResponse>(`/painel/instalacoes/${id}/files`);
  return data;
}
