/**
 * Tipos do painel administrativo para o módulo de Instalação — isolados dos
 * tipos equivalentes da Vistoria (`@/types`, `@/types/painel-mapa`). Nunca
 * reexportar/misturar com aqueles: os dois módulos têm fontes de dados e
 * ciclos de vida totalmente separados no GLPI.
 */

export interface PainelInstalacoesStats {
  liberados: number;
  emInstalacao: number;
  instaladores24h: number;
  /** Instaladas nos últimos 30 dias — mesma janela que o app do instalador já mostra. */
  instaladas30d: number;
  rejeitadasPendentes: number;
  geradoEm: string;
}

export type MapaInstaladorStatus = "em-instalacao" | "em-operacao" | "parado" | "offline";

export interface PainelInstalacoesMapaInstalador {
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
  status_operacional: MapaInstaladorStatus;
  em_instalacao_count: number;
}

export type MapaPosteStatus = "liberado" | "em-instalacao";

export interface PainelInstalacoesMapaPoste {
  id: string;
  equipamento: string;
  municipio: string | null;
  latitude: number;
  longitude: number;
  status: MapaPosteStatus;
  instalador_id: number | null;
  instalador_nome: string | null;
}

export interface PainelInstalacoesMapaResponse {
  instaladores: PainelInstalacoesMapaInstalador[];
  postes: PainelInstalacoesMapaPoste[];
  generated_at: string;
}

// ────────────────────────────────────────────────────────────────────────
// Listas do painel (/painel/instalacoes/pendentes|andamento|instaladas)
// ────────────────────────────────────────────────────────────────────────

export type InstalacaoPainelStatus = "liberado" | "em-instalacao" | "instalado";

export interface InstalacaoPainelItem {
  id: string;
  equipamento: string;
  tipoEquipamento: string | null;
  statusGeralId: number | null;
  statusGeralNome: string | null;
  municipio: string;
  endereco: string;
  psPoste: string;
  alturaPoste: string;
  instalador: { id: number; nome: string } | null;
  dataInstalacao: string | null;
  checklist: {
    cintaInstalada: boolean | null;
    equipamentoFixado: boolean | null;
    cabeamentoOrganizado: boolean | null;
    alimentacaoValidada: boolean | null;
    equipamentoEnergizado: boolean | null;
    registroFotografico: boolean | null;
  };
  validadorCpfl: { nome: string; status: string | null } | null;
}

export interface InstalacaoPainelListResponse {
  items: InstalacaoPainelItem[];
  total: number;
}
