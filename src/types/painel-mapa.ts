export type MapaTecnicoStatus =
  | "em-operacao"
  | "em-vistoria"
  | "parado"
  | "offline";

export interface PainelMapaTecnico {
  users_id: number;
  nome: string;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  speed_kmh: number | null;
  battery_level: number | null;
  created_at: string | null;
  minutos_atras: number | null;
  status_operacional: MapaTecnicoStatus;
  municipios_ativos: number;
  vistorias_ativas: number;
  revisitas_ativas: number;
}

export type MapaVistoriaStatus =
  | "A_VISTORIAR"
  | "EM_VISTORIA"
  | "VISTORIADO"
  | "REVISITA"
  | "REPROVADO"
  | "DEVOLVIDA";

/**
 * Situação operacional consolidada (alinhada ao dropdown GLPI
 * `situaodavistoriafield`). Usada na nova aba de acompanhamento
 * operacional do mapa.
 */
export type SituacaoOperacional =
  | "A_VISTORIAR"
  | "EM_VISTORIA"
  | "VISTORIADO"
  | "AGUARDANDO_REVISITA"
  | "EM_REVISITA"
  | "REVISITADO"
  | "DEVOLVIDA";

export interface PainelMapaVistoria {
  id: number;
  equipamento: string;
  municipio: string | null;
  latitude: number;
  longitude: number;
  status: MapaVistoriaStatus;
  is_revisita: boolean;
  tecnico_id: number | null;
  /** Nome do técnico atribuído (null = sem atribuição). */
  tecnico_nome: string | null;
  /** ID do dropdown situaodavistoria (1..6). 0 = não definido. */
  situacao_id: number;
  /** Situação operacional consolidada (deriva de situacao_id + flags). */
  situacao: SituacaoOperacional;
  /** Status de aprovação (Em análise / Aprovado / Reprovado) — pra UI. */
  status_aprovacao: "EM_ANALISE" | "APROVADO" | "REPROVADO" | "PENDENTE";
  /** Data da vistoria GLPI (datadavistoriafield). */
  data_vistoria: string | null;
}

export interface PainelMapaResponse {
  tecnicos: PainelMapaTecnico[];
  vistorias: PainelMapaVistoria[];
  generated_at: string;
}
