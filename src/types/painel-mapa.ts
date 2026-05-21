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
  | "REPROVADO";

export interface PainelMapaVistoria {
  id: number;
  equipamento: string;
  municipio: string | null;
  latitude: number;
  longitude: number;
  status: MapaVistoriaStatus;
  is_revisita: boolean;
  tecnico_id: number | null;
}

export interface PainelMapaResponse {
  tecnicos: PainelMapaTecnico[];
  vistorias: PainelMapaVistoria[];
  generated_at: string;
}
