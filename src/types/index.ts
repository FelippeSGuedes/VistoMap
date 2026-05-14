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
  alturadaantenafield?: string;
  endereofield?: string;
  aterramentofield?: string;
  intensidadedesinalfield?: string;
  velocidadefield?: string;
  motivofield?: string;
  dropdowns?: Partial<Record<DropdownKey, string>>;
  finalizadaEm: string;
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
