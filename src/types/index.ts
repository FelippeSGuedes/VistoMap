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

export interface Vistoria {
  id: string;
  glpiId: string;
  equipamento: string;
  cidade: string;
  estado?: string;
  endereco?: string;
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
}

export interface VistoriaPayload {
  vistoria_id: string;
  latitude: number;
  longitude: number;
  observacoes: string;
  fotos: string[];
  finalizadaEm: string;
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
