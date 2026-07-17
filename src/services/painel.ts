import { api } from "./api";
import type {
  AdminStatus,
  AuditEntry,
  PainelStats,
  RevisitaPendente,
  TecnicoAtivo,
} from "@/types";
import {
  MOCK_AUDIT,
  MOCK_PAINEL_STATS,
  MOCK_REVISITAS_PENDENTES,
  MOCK_TECNICOS_ATIVOS,
} from "@/utils/painelMock";

/** Item da fila operacional admin. Espelha `FilaItem` do backend. */
export interface FilaItem {
  id: number;
  glpiId: string;
  equipamento: string;
  municipio: string;
  endereco: string | null;
  status: AdminStatus;
  isRepeat: boolean;
  motivoReprovacao: string | null;
  latitude: number | null;
  longitude: number | null;
  dataVistoria: string | null;
  tecnico: { id: number; nome: string } | null;
}

const ALLOW_FALLBACK = process.env.NODE_ENV !== "production";

async function tryReal<T>(p: Promise<T>, fb: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (!ALLOW_FALLBACK) throw err;
    console.warn("[painelService] fallback mock:", err);
    return fb;
  }
}

export async function fetchStats(): Promise<PainelStats> {
  return tryReal(
    api.get<PainelStats>("/painel/stats").then((r) => r.data),
    MOCK_PAINEL_STATS
  );
}

export async function fetchTecnicos(): Promise<TecnicoAtivo[]> {
  return tryReal(
    api.get<TecnicoAtivo[]>("/painel/tecnicos").then((r) => r.data),
    MOCK_TECNICOS_ATIVOS
  );
}

export async function fetchRevisitas(): Promise<RevisitaPendente[]> {
  return tryReal(
    api.get<RevisitaPendente[]>("/painel/revisitas").then((r) => r.data),
    MOCK_REVISITAS_PENDENTES
  );
}

export interface AtribuirInput {
  vistoria_id: number | string;
  tecnico_id: number | string;
  regenerar_pdf?: boolean;
}

export async function atribuir(input: AtribuirInput): Promise<{ ok: true }> {
  await api.post("/painel/atribuir", input);
  return { ok: true } as const;
}

export interface FetchAuditFilters {
  acao?: string;
  alvo_id?: string;
  limit?: number;
  offset?: number;
}

export async function fetchAudit(
  filters: FetchAuditFilters = {}
): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  if (filters.acao) params.set("acao", filters.acao);
  if (filters.alvo_id) params.set("alvo_id", filters.alvo_id);
  if (filters.limit != null) params.set("limit", String(filters.limit));
  if (filters.offset != null) params.set("offset", String(filters.offset));
  const url = `/painel/audit${params.toString() ? `?${params.toString()}` : ""}`;
  return tryReal(
    api.get<AuditEntry[]>(url).then((r) => r.data),
    MOCK_AUDIT
  );
}

export interface FilaFilters {
  status?: AdminStatus;
  municipio?: string;
  tecnico_id?: number;
  is_repeat?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function fetchFila(filters: FilaFilters = {}): Promise<FilaItem[]> {
  const p = new URLSearchParams();
  if (filters.status) p.set("status", filters.status);
  if (filters.municipio) p.set("municipio", filters.municipio);
  if (filters.tecnico_id != null) p.set("tecnico_id", String(filters.tecnico_id));
  if (filters.is_repeat === true) p.set("is_repeat", "1");
  if (filters.is_repeat === false) p.set("is_repeat", "0");
  if (filters.q) p.set("q", filters.q);
  if (filters.limit != null) p.set("limit", String(filters.limit));
  if (filters.offset != null) p.set("offset", String(filters.offset));
  const url = `/painel/vistorias${p.toString() ? `?${p}` : ""}`;
  return tryReal(api.get<FilaItem[]>(url).then((r) => r.data), []);
}

export interface EditarVistoriaInput {
  vistoria_id: number | string;
  campos: {
    endereofield?: string;
    motivofield?: string;
    alturadaantenafield?: string;
    aterramentofield?: string;
    observaofield?: string;
  };
  regenerar_pdf?: boolean;
}

export async function editarVistoria(input: EditarVistoriaInput) {
  const id = String(input.vistoria_id).replace(/^NE-|^rev-/, "");
  const { data } = await api.patch<{
    ok: true;
    affected: number;
    diff: Array<{ campo: string; antes?: string; depois?: string }>;
  }>(`/painel/vistoria/${id}`, {
    campos: input.campos,
    regenerar_pdf: input.regenerar_pdf,
  });
  return data;
}

export async function aprovarVistoria(vistoriaId: number | string) {
  const id = String(vistoriaId).replace(/^NE-|^rev-/, "");
  const { data } = await api.post<{
    ok: true;
    affected: number;
    eraRevisita: boolean;
    situacaoFinal: number;
  }>(`/painel/vistoria/${id}/aprovar`);
  return data;
}

export async function reprovarVistoria(
  vistoriaId: number | string,
  motivo?: string
) {
  const id = String(vistoriaId).replace(/^NE-|^rev-/, "");
  const { data } = await api.post<{
    ok: true;
    affected: number;
  }>(`/painel/vistoria/${id}/reprovar`, motivo ? { motivo } : {});
  return data;
}

export interface HistoricoAnalytics {
  periodo: { inicio: string; fim: string; dias: number };
  totais: {
    vistoriasFinalizadas: number;
    revisitasFinalizadas: number;
    aprovadas: number;
    reprovadas: number;
    pdfsGerados: number;
  };
  taxas: { aprovacaoPct: number; revisitaPct: number };
  medias: { diariaVistorias: number; semanalVistorias: number };
  serieDiaria: Array<{
    dia: string;
    finalizadas: number;
    aprovadas: number;
    reprovadas: number;
  }>;
  topMunicipios: Array<{ municipio: string; total: number }>;
  rankingTecnicos: Array<{
    id: number;
    nome: string;
    total: number;
    aprovadas: number;
    revisitas: number;
    cidades: number;
    kmPercorrido?: number;
    /** Tempo médio de deslocamento (Em Deslocamento → Iniciada), em minutos. */
    tempoDeslocamentoMedioMin?: number | null;
    /** SLA médio de execução (Iniciada → Finalizada), em minutos. */
    slaExecucaoMedioMin?: number | null;
  }>;
  kmOperacional: number;
  motivosReprovacao: Array<{
    id: string;
    label: string;
    color: string;
    total: number;
    pct: number;
    exemplos: string[];
  }>;
}

export async function fetchHistorico(dias = 30): Promise<HistoricoAnalytics> {
  const fb: HistoricoAnalytics = {
    periodo: { inicio: "", fim: "", dias },
    totais: { vistoriasFinalizadas: 0, revisitasFinalizadas: 0, aprovadas: 0, reprovadas: 0, pdfsGerados: 0 },
    taxas: { aprovacaoPct: 0, revisitaPct: 0 },
    medias: { diariaVistorias: 0, semanalVistorias: 0 },
    serieDiaria: [],
    topMunicipios: [],
    rankingTecnicos: [],
    kmOperacional: 0,
    motivosReprovacao: [],
  };
  return tryReal(
    api.get<HistoricoAnalytics>(`/painel/historico?dias=${dias}`).then((r) => r.data),
    fb
  );
}

export interface VistoriaFile {
  name: string;
  url: string;
  size: number;
  modifiedAt: string;
  kind: "image" | "video" | "pdf" | "other";
}

export async function fetchVistoriaFiles(
  vistoriaId: number | string
): Promise<{ equipamento: string; folder: string; items: VistoriaFile[] }> {
  const id = String(vistoriaId).replace(/^NE-|^rev-/, "");
  const fb = { equipamento: "", folder: "", items: [] as VistoriaFile[] };
  return tryReal(
    api.get<typeof fb>(`/painel/vistoria/${id}/files`).then((r) => r.data),
    fb
  );
}

/* ── Vistorias Realizadas ────────────────────────────────────────── */

export interface VistoriaRealizada {
  id: number;
  glpiId: string;
  equipamento: string;
  municipio: string;
  endereco: string | null;
  status: "VISTORIADO" | "REVISITADO";
  isRepeat: boolean;
  dataVistoria: string | null;
  dataEnvio: string | null;
  approvedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  tecnico: { id: number; nome: string } | null;
  motivo: string | null;
  alturaAntena: string | null;
  aterramento: string | null;
  rsrpClaro: string | null;
  rsrpVivo: string | null;
  observacao: string | null;
  pdfPath: string | null;
  projectStatus: "PENDENTE" | "GERADO" | "ERRO";
  approvalStatus: "APROVADO" | "REPROVADO" | null;
}

export interface RealizadasFilters {
  municipio?: string;
  tecnico_id?: number;
  q?: string;
  status?: "VISTORIADO" | "REVISITADO";
  limit?: number;
  offset?: number;
}

export async function fetchRealizadas(
  filters: RealizadasFilters = {}
): Promise<VistoriaRealizada[]> {
  const p = new URLSearchParams();
  if (filters.municipio)     p.set("municipio",  filters.municipio);
  if (filters.tecnico_id != null) p.set("tecnico_id", String(filters.tecnico_id));
  if (filters.q)             p.set("q",          filters.q);
  if (filters.status)        p.set("status",     filters.status);
  if (filters.limit != null) p.set("limit",      String(filters.limit));
  if (filters.offset != null) p.set("offset",    String(filters.offset));
  const url = `/painel/realizadas${p.toString() ? `?${p}` : ""}`;
  return tryReal(api.get<VistoriaRealizada[]>(url).then(r => r.data), []);
}

export const painelService = {
  fetchStats,
  fetchTecnicos,
  fetchRevisitas,
  fetchAudit,
  fetchFila,
  fetchHistorico,
  fetchVistoriaFiles,
  atribuir,
  editarVistoria,
  aprovarVistoria,
  reprovarVistoria,
  fetchRealizadas,
};
