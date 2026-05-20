export type VistoriaStatus =
  | "PENDENTE"
  | "EM_CAMPO"
  | "FINALIZADA"
  | "REPROVADA"
  | "APROVADA";

export type VistoriaPriority = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";

export interface Tecnico {
  id: string;
  nome: string;
  email: string;
  matricula?: string;
  avatarUrl?: string;
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export type DropdownKey =
  | "tipodeantena"
  | "ganhodbi"
  | "mododeoperacao"
  | "operadorafourg"
  | "tipodematerial"
  | "tensao"
  | "alimentacaodoequipamento"
  | "localdeinstalacao";

export interface VistoriaFields {
  pspostefield?: string;
  alturadaantenafield?: string;
  endereofield?: string;
  observaofield?: string;
  aterramentofield?: string;
  intensidadedesinalfield?: string;
  velocidadefield?: string;
  motivofield?: string;
  // Dropdowns resolvidos (texto, vindos de JOIN com tabelas glpi_plugin_fields_*).
  tipodeantena?: string;
  ganhodbi?: string;
  mododeoperacao?: string;
  operadorafourg?: string;
  tipodematerial?: string;
  tensao?: string;
  alimentacaodoequipamento?: string;
  localdeinstalacao?: string;
}

export interface Vistoria {
  id: string;
  glpiId: string;
  equipamento: string;
  cidade: string;
  estado?: string | null;
  endereco?: string | null;
  status: VistoriaStatus;
  prioridade: VistoriaPriority;
  tecnico: Tecnico;
  latitude: number;
  longitude: number;
  agendadaPara?: string;
  thumbnailUrl?: string;
  distanciaKm?: number;
  categoria?: string;
  online?: boolean;
  fields?: VistoriaFields;
  dropdownIds?: Partial<Record<"statusVistoria" | "pendencia", number | null>>;
  dataVistoria?: string | null;
  /** Vem de `glpi_plugin_vistomap_projects.is_repeat`. Quando true, esta NE
   *  é uma revisita (vistoria anterior reprovada). */
  isRepeat?: boolean;
  /** `project_status` da aux table (PENDENTE/GERANDO/GERADO/ERRO). */
  auxProjectStatus?: string | null;
}

export interface VistoriaPayload {
  vistoria_id: string;
  latitude: number;
  longitude: number;
  observacoes: string;
  pspostefield?: string;
  municipiofield?: string;
  alturadaantenafield?: string;
  endereofield?: string;
  aterramentofield?: string;
  intensidadedesinalfield?: string;
  velocidadefield?: string;
  motivofield?: string;
  dropdowns?: Partial<Record<DropdownKey, string>>;
  finalizadaEm: string;
}

/** Source-of-truth dos postes — vindo do PostGIS via /postes/*. */
export interface Poste {
  id: number;
  pspostefield: string;
  materialfield: string | null;
  alturadaantenafield: string | null;
  municipiofield: string;
  latitudefield: number;
  longitudefield: number;
  distancia_m?: number;
}

export interface PostesProximosResponse {
  origem: { lat: number; lng: number };
  raio_m: number;
  total: number;
  items: Poste[];
}

export const MOTIVOS_MUDANCA = [
  "POSTE_INACESSIVEL",
  "VEGETACAO_BLOQUEANDO",
  "POSTE_INEXISTENTE",
  "ENDERECO_INCORRETO",
  "POSTE_DANIFICADO",
  "AREA_DE_RISCO",
  "OUTRO",
] as const;

export type MotivoMudanca = (typeof MOTIVOS_MUDANCA)[number];

export const MOTIVO_LABEL: Record<MotivoMudanca, string> = {
  POSTE_INACESSIVEL: "Poste inacessível",
  VEGETACAO_BLOQUEANDO: "Vegetação bloqueando",
  POSTE_INEXISTENTE: "Poste inexistente",
  ENDERECO_INCORRETO: "Endereço incorreto",
  POSTE_DANIFICADO: "Poste danificado",
  AREA_DE_RISCO: "Área de risco",
  OUTRO: "Outro",
};

export interface MudancaPosteResponse {
  ok: true;
  mudanca_id: number;
  distancia_m: number;
  raio_max_m: number;
  poste_novo: Poste;
  descricao_glpi: string;
  payload_glpi: {
    vistoria_id: string;
    pspostefield: string;
    municipiofield: string;
    materialfield: string | null;
    alturadaantenafield: string | null;
    latitudefield: number;
    longitudefield: number;
    observaofield_append: string;
  };
}

export interface CaptureBundle {
  imagem1?: Blob | null;
  imagem2?: Blob | null;
  imagem3?: Blob | null;
  imagem4?: Blob | null;
  imagem5?: Blob | null;
  video360?: Blob | null;
}

/** Município ativo na rota operacional do técnico, com contagem de vistorias. */
export interface MunicipioOperacional {
  nome: string;
  totalVistorias: number;
}

export interface DashboardStats {
  total: number;
  pendentes: number;
  concluidas: number;
  /** No GLPI `Reprovada`; na UI é exibida como "Revisitas" (ação operacional). */
  reprovadas: number;
  ultimaSincronizacao: string;
  /** Lista distinta de municípios das vistorias atribuídas — usada no MunicipioField. */
  municipios?: MunicipioOperacional[];
  /** Série dos últimos 7 dias por KPI — usada nas sparklines do dashboard. */
  trend7d?: {
    pendentes: number[];
    concluidas: number[];
    reprovadas: number[];
  };
}

export interface AuthSession {
  token: string;
  tecnico: Tecnico;
  expiresAt: number;
}

/** Snapshot de uma sincronização — usado no filtro do dashboard. */
export interface SyncSnapshot {
  id: string;
  /** ISO timestamp da sincronização. */
  timestamp: string;
  /** Estatísticas agregadas naquele momento. */
  stats: DashboardStats;
  /** Label legível: "Hoje 08:40", "Ontem 18:22", "13/05 09:10". */
  label?: string;
}

/** Perfil enriquecido do técnico para a rota /perfil. */
export interface ProfileInfo {
  tecnico: Tecnico;
  cargo: string;
  equipe: string;
  municipioOperacional: string;
  /** Status operacional: em campo, base, off-shift, etc. */
  statusOperacional: "em-campo" | "base" | "off-shift";
  /** KPIs pessoais acumulados. */
  kpis: {
    vistoriasConcluidas: number;
    revisitas: number;
    aprovadas: number;
    distanciaKm: number;
    diasAtivos: number;
  };
}

/** Atividade do histórico operacional — eventos da timeline. */
export type HistoricoTipo =
  | "vistoria-finalizada"
  | "vistoria-iniciada"
  | "mudanca-poste"
  | "revisita"
  | "pdf-gerado"
  | "sincronizacao"
  | "rota-iniciada"
  | "aprovacao"
  | "reprovacao";

export interface HistoricoEntry {
  id: string;
  tipo: HistoricoTipo;
  timestamp: string;
  titulo: string;
  descricao?: string;
  equipamento?: string;
  municipio?: string;
  glpiId?: string;
}

/** Resumo do histórico operacional (KPIs + timeline). */
export interface HistoricoSummary {
  periodo: { inicio: string; fim: string };
  vistoriasEnviadas: number;
  vistoriasEntregues: number;
  aprovadas: number;
  reprovadas: number;
  revisitas: number;
  pdfsGerados: number;
  rotasExecutadas: number;
  tempoOperacionalHoras: number;
  distanciaPercorridaKm: number;
  municipiosAtendidos: string[];
  sincronizacoes: number;
  timeline: HistoricoEntry[];
}

export interface FilterState {
  query: string;
  status: VistoriaStatus[];
  prioridade: VistoriaPriority[];
  distanciaMaxKm: number;
  ordenacao: "distancia" | "prioridade" | "data";
  categorias: string[];
}
