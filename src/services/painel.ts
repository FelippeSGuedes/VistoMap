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

export interface AgendamentoInput {
  vistoria_ids: Array<number | string>;
  tecnico_id: number | string;
  data_agendada: string; // YYYY-MM-DD
  hora_inicio?: string; // HH:MM
  /** Ordem escolhida à mão na simulação (remover/reordenar). Sem isso, vizinho mais próximo. */
  ordem_vistoria_ids?: number[];
}

export interface ExpedienteResumo {
  inicio: string;
  fim: string;
  fim_de_semana: boolean;
}

export interface AgendamentoPreviewItem {
  vistoria_id: number;
  equipamento: string;
  ordem: number;
  /** Dia (YYYY-MM-DD) em que a parada caiu — pode ser depois da data pedida se o expediente não coube. */
  data: string;
  novo_dia: boolean;
  distancia_desde_anterior_m: number | null;
  duracao_perna_min: number;
  chegada_prevista: string;
  saida_prevista: string;
  almoco_antes: boolean;
  risco_chuva_pct: number | null;
  risco_chuva_alerta: boolean;
}

export interface AgendamentoPreviewResponse {
  ok: true;
  itens: AgendamentoPreviewItem[];
  resumo: {
    hora_inicio: string;
    expediente: ExpedienteResumo;
    distancia_total_m: number;
    dias: Array<{ data: string; paradas: number; hora_termino: string }>;
  };
  ignorados_sem_coordenada: Array<{ vistoria_id: number; equipamento: string }>;
}

export async function previewAgendamento(input: AgendamentoInput): Promise<AgendamentoPreviewResponse> {
  const { data } = await api.post<AgendamentoPreviewResponse>("/painel/agendamentos/preview", input);
  return data;
}

/** Esqueleto do roteiro (ordem + origem + SLA + config) — instantâneo, sem rota/clima. */
export interface AgendamentoPlano {
  ok: true;
  data_agendada: string;
  hora_inicio: string; // HH:MM
  expediente: ExpedienteResumo;
  sla_min: number;
  almoco: { hora: string; duracao_min: number };
  margem_min: number;
  paradas: Array<{ vistoria_id: number; equipamento: string; ordem: number; lat: number; lng: number }>;
  ignorados_sem_coordenada: Array<{ vistoria_id: number; equipamento: string }>;
}

export async function previewPlanoAgendamento(input: AgendamentoInput): Promise<AgendamentoPlano> {
  const { data } = await api.post<AgendamentoPlano>("/painel/agendamentos/preview/plano", input);
  return data;
}

export async function criarAgendamento(input: AgendamentoInput): Promise<{ ok: true; agendadas: number }> {
  const { data } = await api.post<{ ok: true; agendadas: number }>("/painel/agendamentos", input);
  return data;
}

export interface AgendamentoItem {
  id: number;
  vistoria_id: number;
  equipamento: string;
  tecnico_id: number;
  tecnico_nome: string;
  data_agendada: string;
  ordem: number;
  chegada_prevista: string | null;
  saida_prevista: string | null;
  distancia_desde_anterior_m: number | null;
  risco_chuva_pct: number | null;
  risco_chuva_alerta: boolean;
}

export async function fetchAgendamentos(filtros: { tecnico_id?: number; de?: string; ate?: string } = {}): Promise<AgendamentoItem[]> {
  const p = new URLSearchParams();
  if (filtros.tecnico_id != null) p.set("tecnico_id", String(filtros.tecnico_id));
  if (filtros.de) p.set("de", filtros.de);
  if (filtros.ate) p.set("ate", filtros.ate);
  const url = `/painel/agendamentos${p.toString() ? `?${p}` : ""}`;
  const { data } = await api.get<{ ok: true; itens: AgendamentoItem[] }>(url);
  return data.itens;
}

export async function cancelarAgendamento(id: number): Promise<{ ok: true }> {
  await api.post(`/painel/agendamentos/${id}/cancelar`);
  return { ok: true } as const;
}

export interface FetchAuditFilters {
  acao?: string;
  alvo_id?: string;
  ator_id?: number;
  limit?: number;
  offset?: number;
}

export async function fetchAudit(
  filters: FetchAuditFilters = {}
): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  if (filters.acao) params.set("acao", filters.acao);
  if (filters.alvo_id) params.set("alvo_id", filters.alvo_id);
  if (filters.ator_id != null) params.set("ator_id", String(filters.ator_id));
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
  topMunicipios: Array<{ municipio: string; total: number; concluidas: number }>;
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

export type TopTecnicosPeriodo = "hoje" | "semana" | "mes" | "personalizado";

export interface RankingTecnicoItem {
  id: number;
  nome: string;
  total: number;
  aprovadas: number;
  revisitas: number;
  cidades: number;
  kmPercorrido?: number;
  tempoDeslocamentoMedioMin?: number | null;
  slaExecucaoMedioMin?: number | null;
}

export interface TopTecnicosDashboard {
  periodo: { inicio: string; fim: string };
  tecnicos: RankingTecnicoItem[];
  pendentesCpflPorMunicipio: Array<{ municipio: string; total: number }>;
}

/**
 * Widget "Top Técnicos" do dashboard principal — período próprio
 * (Hoje/Última Semana/30 dias/Personalizado), independente do seletor de
 * /painel/historico. `inicio`/`fim` só importam quando periodo=personalizado.
 */
export async function fetchTopTecnicosDashboard(
  periodo: TopTecnicosPeriodo,
  inicio?: string,
  fim?: string
): Promise<TopTecnicosDashboard> {
  const fb: TopTecnicosDashboard = {
    periodo: { inicio: "", fim: "" },
    tecnicos: [],
    pendentesCpflPorMunicipio: [],
  };
  const params = new URLSearchParams({ periodo });
  if (periodo === "personalizado" && inicio && fim) {
    params.set("inicio", inicio);
    params.set("fim", fim);
  }
  return tryReal(
    api
      .get<TopTecnicosDashboard>(`/painel/dashboard/top-tecnicos?${params.toString()}`)
      .then((r) => r.data),
    fb
  );
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
  tipoEquipamento: string | null;
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

export interface VistoriasRealizadasStats {
  total: number;
  vistoriados: number;
  revisitados: number;
  pdfsGerados: number;
}

export interface RealizadasResponse {
  items: VistoriaRealizada[];
  stats: VistoriasRealizadasStats;
}

const EMPTY_REALIZADAS_STATS: VistoriasRealizadasStats = { total: 0, vistoriados: 0, revisitados: 0, pdfsGerados: 0 };

export async function fetchRealizadas(
  filters: RealizadasFilters = {}
): Promise<RealizadasResponse> {
  const p = new URLSearchParams();
  if (filters.municipio)     p.set("municipio",  filters.municipio);
  if (filters.tecnico_id != null) p.set("tecnico_id", String(filters.tecnico_id));
  if (filters.q)             p.set("q",          filters.q);
  if (filters.status)        p.set("status",     filters.status);
  if (filters.limit != null) p.set("limit",      String(filters.limit));
  if (filters.offset != null) p.set("offset",    String(filters.offset));
  const url = `/painel/realizadas${p.toString() ? `?${p}` : ""}`;
  return tryReal(
    api.get<RealizadasResponse>(url).then(r => r.data),
    { items: [], stats: EMPTY_REALIZADAS_STATS }
  );
}

export interface ServiceCheck {
  nome: string;
  ok: boolean;
  detalhe: string;
  tempo_ms: number | null;
}

export interface PainelStatus {
  checadoEm: string;
  saudeGeral: "saudavel" | "atencao";
  servicos: ServiceCheck[];
  otaVersao: string | null;
  workerUltimaAtividade: string | null;
  erros: {
    ultimaHora: number;
    ultimas24h: number;
    recentes: ErrorLogEntry[];
  };
}

export interface ErrorLogEntry {
  id: number;
  ts: string;
  source: "app" | "painel" | "worker" | "glpi";
  level: "error" | "warning";
  rota: string | null;
  mensagem: string;
  contexto: string | null;
}

/** Sem mock — status precisa refletir a realidade, nunca fingir saudável. */
export async function fetchStatus(): Promise<PainelStatus> {
  return api.get<PainelStatus>("/painel/status").then((r) => r.data);
}

/* ── Validação da concessionária (CPFL) ─────────────────────────────────── */

export type EtapaCPFL = "AGUARDANDO" | "APROVADA" | "REPROVADA";

/** Espelha `VistoriaCPFL` de @/lib/glpi/cpfl (server-only, não importável aqui). */
export interface VistoriaCPFL {
  id: number;
  glpiId: string;
  equipamento: string;
  municipio: string;
  endereco: string | null;
  etapa: EtapaCPFL;
  pendencia: string | null;
  tecnico: { id: number; nome: string } | null;
  tecnicoDesligado: boolean;
  dataVistoria: string | null;
  dataEnvio: string | null;
  dataAprovacao: string | null;
  diasAguardando: number | null;
  motivo: string | null;
  pdfPath: string | null;
  validacaoCpfl: string | null;
  validadorCpfl: string | null;
  avaliadorInterno: string | null;
}

export interface CPFLStats {
  total: number;
  aguardando: number;
  aprovadas: number;
  reprovadas: number;
  aguardandoMais30d: number;
}

export interface CPFLFilters {
  etapa?: EtapaCPFL;
  municipio?: string;
  tecnico_id?: number;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface CPFLResponse {
  items: VistoriaCPFL[];
  stats: CPFLStats;
}

const EMPTY_CPFL_STATS: CPFLStats = {
  total: 0,
  aguardando: 0,
  aprovadas: 0,
  reprovadas: 0,
  aguardandoMais30d: 0,
};

export async function fetchCPFL(filters: CPFLFilters = {}): Promise<CPFLResponse> {
  const p = new URLSearchParams();
  if (filters.etapa) p.set("etapa", filters.etapa);
  if (filters.municipio) p.set("municipio", filters.municipio);
  if (filters.tecnico_id != null) p.set("tecnico_id", String(filters.tecnico_id));
  if (filters.q) p.set("q", filters.q);
  if (filters.limit != null) p.set("limit", String(filters.limit));
  if (filters.offset != null) p.set("offset", String(filters.offset));
  const url = `/painel/cpfl${p.toString() ? `?${p}` : ""}`;
  return tryReal(
    api.get<CPFLResponse>(url).then((r) => r.data),
    { items: [], stats: EMPTY_CPFL_STATS }
  );
}

/**
 * Corrige o status geral (states_id) de equipamentos já aprovados pela CPFL
 * que ficaram presos em "Vistoriado" — ver sincronizarStatusLiberadoInstalacao
 * em @/lib/glpi/instalacoes.ts pro critério e o porquê disso existir.
 */
export async function sincronizarStatusCPFL() {
  const { data } = await api.post<{
    ok: true;
    liberados: Array<{ id: number; equipamento: string }>;
  }>("/painel/instalacoes/sincronizar-cpfl");
  return data;
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
  previewAgendamento,
  previewPlanoAgendamento,
  criarAgendamento,
  fetchAgendamentos,
  cancelarAgendamento,
  editarVistoria,
  aprovarVistoria,
  reprovarVistoria,
  fetchRealizadas,
  fetchStatus,
  fetchCPFL,
  sincronizarStatusCPFL,
  fetchTopTecnicosDashboard,
};
