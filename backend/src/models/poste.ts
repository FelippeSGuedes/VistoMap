/**
 * Modelos compartilhados — mapeiam 1:1 com as tabelas Postgres.
 * Convertemos `numeric` para number na borda da API (Knex já entrega como string;
 * usaremos `Number(...)` nos repositories).
 */

export interface PosteRow {
  id: number;
  pspostefield: string;
  materialfield: string | null;
  alturadaantenafield: string | null;
  municipiofield: string;
  municipiofield_norm: string;
  latitudefield: number;
  longitudefield: number;
  /** WKT/GeoJSON gerado sob demanda — não armazenado no objeto JS. */
  geom?: string;
  raw?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface PosteWithDistance extends PosteRow {
  /** Distância em metros até um ponto de referência (geography). */
  distancia_m: number;
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

export interface MudancaPosteRow {
  id: number;
  vistoria_id: string;
  psposte_antigo: string | null;
  municipio_antigo: string | null;
  psposte_novo: string;
  municipio_novo: string;
  poste_id_antigo: number | null;
  poste_id_novo: number;
  usuario_id: string;
  usuario_email: string | null;
  motivo: MotivoMudanca;
  observacao: string | null;
  distancia_m: number | null;
  raio_max_m: number;
  payload_glpi: Record<string, unknown> | null;
  created_at: string;
}
