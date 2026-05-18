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

export interface DashboardStats {
  total: number;
  pendentes: number;
  emCampo: number;
  concluidas: number;
  reprovadas: number;
  ultimaSincronizacao: string;
}

export interface AuthSession {
  token: string;
  tecnico: Tecnico;
  expiresAt: number;
}

export interface FilterState {
  query: string;
  status: VistoriaStatus[];
  prioridade: VistoriaPriority[];
  distanciaMaxKm: number;
  ordenacao: "distancia" | "prioridade" | "data";
  categorias: string[];
}
