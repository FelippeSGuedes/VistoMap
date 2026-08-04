export type VistoriaStatus =
  | "PENDENTE"
  | "EM_CAMPO"
  | "FINALIZADA"
  | "REPROVADA"
  | "APROVADA"
  | "DEVOLVIDA";

export type VistoriaPriority = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";

/**
 * Módulo de Instalação — tipos client-side espelhando o JSON devolvido por
 * GET /api/instalacoes e /api/instalacoes/[id] (server: lib/glpi/instalacoes.ts).
 * Contexto é tudo que já veio da vistoria (leitura); checklist/instalador/
 * validadorCpfl são os campos novos e exclusivos da instalação.
 */
export interface InstalacaoContexto {
  municipio: string;
  estado: string;
  psPoste: string;
  alturaPoste: string;
  endereco: string;
  observacao: string;
  aterramento: boolean | null;
  material: string;
  formato: string;
  alimentacao: string;
  tensao: string;
  localInstalacao: string;
  dan: string;
  chave: boolean | null;
  redePrimaria: boolean | null;
  redeSecundaria: boolean | null;
  religador: boolean | null;
  transformador: boolean | null;
  instalarTp: boolean | null;
}

/** Espelha InstalacaoChecklistKey de lib/glpi/constants.ts (server-only) — não importa de lá pro client bundle. */
export type InstalacaoChecklistKey =
  | "cintaInstalada"
  | "equipamentoFixado"
  | "cabeamentoOrganizado"
  | "alimentacaoValidada"
  | "equipamentoEnergizado"
  | "registroFotografico";

export interface InstalacaoChecklist {
  cintaInstalada: boolean | null;
  equipamentoFixado: boolean | null;
  cabeamentoOrganizado: boolean | null;
  alimentacaoValidada: boolean | null;
  equipamentoEnergizado: boolean | null;
  registroFotografico: boolean | null;
  tensaoIdentificadaId: number | null;
  tensaoIdentificada: string | null;
}

export interface Instalacao {
  id: string;
  glpiId: string;
  equipamento: string;
  tipoEquipamento: string | null;
  statusGeralId: number | null;
  statusGeralNome: string | null;
  latitude: number | null;
  longitude: number | null;
  contexto: InstalacaoContexto;
  empresa: string | null;
  instalador: { id: number; nome: string } | null;
  dataInstalacao: string | null;
  checklist: InstalacaoChecklist;
  validadorCpfl: { id: number; nome: string; statusId: number | null; status: string | null } | null;
}

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
  | "localdeinstalacao"
  | "tipoifield"
  | "tipollfield"
  | "tensovfield";

export interface VistoriaFields {
  pspostefield?: string;
  alturadopostemfield?: string;
  instalartpfield?: string;
  danfield?: string;
  rsrpifield?: string;
  rsrpllfield?: string;
  tipoifield?: string;
  tipollfield?: string;
  tensovfield?: string;
  endereofield?: string;
  observaofield?: string;
  aterramentofield?: string;
  motivofield?: string;
  // Dropdowns resolvidos (texto, vindos de JOIN com tabelas glpi_plugin_fields_*).
  equipamentofield?: string;
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
  alturadopostemfield?: string;
  materialfield?: string;
  endereofield?: string;
  aterramentofield?: string;
  instalartpfield?: string;
  danfield?: string;
  rsrpifield?: string;
  rsrpllfield?: string;
  dropdowns?: Partial<Record<DropdownKey, string>>;
  finalizadaEm: string;
}

/** Source-of-truth dos postes — vindo do PostGIS via /postes/*. */
export interface Poste {
  id: number;
  pspostefield: string;
  materialfield: string | null;
  alturadopostemfield: string | null;
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
    alturadopostemfield: string | null;
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
  /** Vistorias com situação "Devolvida para Correção" (situacao_id 8). */
  devolucoes: number;
  ultimaSincronizacao: string;
  /** Lista distinta de municípios das vistorias atribuídas — usada no MunicipioField. */
  municipios?: MunicipioOperacional[];
  /** Série dos últimos 7 dias por KPI — usada nas sparklines do dashboard. */
  trend7d?: {
    pendentes: number[];
    concluidas: number[];
    reprovadas: number[];
    devolucoes: number[];
  };
}

/**
 * Papel operacional — admin/moderador/leitura acessam /painel, tecnico e
 * instalador acessam o app de campo (raiz). moderador e leitura são
 * variações restritas do admin (ver src/lib/jwt.ts para o detalhe de cada
 * escopo).
 */
export type SessionRole = "admin" | "moderador" | "leitura" | "tecnico" | "instalador";

/** Módulos do app de campo — derivados dos grupos GLPI, um usuário pode ter os dois. */
export type Modulo = "vistoria" | "instalacao";

export interface AuthSession {
  token: string;
  tecnico: Tecnico;
  expiresAt: number;
  /** Derivado dos grupos GLPI: VistoMap-Administradores → admin, VistoMap-Moderador → moderador, "VistoMap - Leitura" → leitura, VistoMap-Tecnicos → tecnico, VistoMap-Instalação → instalador. */
  role: SessionRole;
  /** Só presente na sessão do app de campo (login/painel-login não usam). */
  modulos?: Modulo[];
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

/* ─── PAINEL OPERACIONAL ADMIN ────────────────────────────────────── */

/**
 * Status operacionais do `/painel` — derivados de `situaodavistoriafield`
 * (campo GLPI). 6 valores que cobrem o ciclo completo da operação.
 *
 * Mapeamento legacy (enquanto o campo `situaodavistoriafield` não existe
 * no banco GLPI, derivamos a partir do `plugin_fields_statusvistoriafielddropdowns_id`
 * + `is_repeat` da aux table).
 */
export type AdminStatus =
  | "A_VISTORIAR"
  | "EM_VISTORIA"
  | "VISTORIADO"
  | "AGUARDANDO_REVISITA"
  | "EM_REVISITA"
  | "REVISITADO"
  | "DEVOLVIDA";

export const ADMIN_STATUS_LABEL: Record<AdminStatus, string> = {
  A_VISTORIAR: "A Vistoriar",
  EM_VISTORIA: "Em Vistoria",
  VISTORIADO: "Vistoriado",
  AGUARDANDO_REVISITA: "Aguardando Revisita",
  EM_REVISITA: "Em Revisita",
  REVISITADO: "Revisitado",
  DEVOLVIDA: "Devolvida para Correção",
};

export const ADMIN_STATUS_COLOR: Record<AdminStatus, string> = {
  A_VISTORIAR: "#F59E0B",          // amarelo — pendente
  EM_VISTORIA: "#3B82F6",          // azul — em andamento
  VISTORIADO: "#00B388",           // verde — concluído
  AGUARDANDO_REVISITA: "#F97316",  // laranja — pra revisitar
  EM_REVISITA: "#0EA5E9",          // azul claro — em revisita
  REVISITADO: "#10B981",           // verde claro — revisitado
  DEVOLVIDA: "#DC2626",            // vermelho — precisa correção do técnico
};

/** Técnico ativo no campo — usado no mapa operacional e na gestão de equipe. */
export interface TecnicoAtivo {
  id: string;
  nome: string;
  email?: string;
  avatarUrl?: string;
  /** Status operacional momentâneo do técnico. */
  status: "em-campo" | "base" | "off-shift" | "offline";
  /** Posição GPS atual (se compartilhada). */
  lat?: number;
  lng?: number;
  municipio?: string;
  /** Vistorias atribuídas hoje. */
  atribuidas: number;
  concluidasHoje: number;
  /** Última atividade ISO. */
  ultimaAtividade?: string;
  /** Bateria do dispositivo, 0-100. */
  bateria?: number;
}

/** Atribuição de vistoria a um técnico — registro da operação. */
export interface AtribuicaoOperacional {
  id: string;
  vistoriaId: string;
  equipamento: string;
  municipio: string;
  tecnicoId: string;
  tecnicoNome: string;
  prioridade: VistoriaPriority;
  atribuidoPor: string;
  atribuidoEm: string;
  status: AdminStatus;
  isRevisita: boolean;
  motivoRevisita?: string;
}

/** Registro de auditoria — ação operacional registrada na timeline admin. */
export interface AuditEntry {
  id: string;
  timestamp: string;
  /** Quem realizou a ação. */
  ator: { id: string; nome: string; role: SessionRole };
  /** Tipo de ação executada. */
  acao:
    | "vistoria-atribuida"
    | "vistoria-desvinculada"
    | "vistoria-finalizada"
    | "revisita-criada"
    | "revisita-atribuida"
    | "revisita-finalizada"
    | "vistoria-aprovada"
    | "vistoria-reprovada"
    | "pdf-regenerado"
    | "motivo-alterado"
    | "dados-editados"
    | "sincronizacao"
    | "login-admin"
    | "login-tecnico"
    | "expediente-finalizado"
    | "expediente-iniciado"
    | "vistoria-iniciada"
    | "vistoria-em-deslocamento"
    | "vistoria-em-vistoria"
    | "override-solicitado"
    | "override-aprovado"
    | "override-reprovado"
    | "vistoria-devolvida"
    | "devolucao-resolvida"
    | "recusa-solicitada"
    | "recusa-aprovada"
    | "recusa-reprovada"
    | "instalacao-assumida"
    | "instalacao-finalizada"
    | "instalacao-rejeitada"
    | "instalacao-aprovada"
    | "instalacao-reprovada"
    | "instalacao-rejeicao-escalada"
    | "instalacao-rejeicao-descartada";
  /** Alvo da ação. */
  alvo?: {
    tipo: "vistoria" | "tecnico" | "revisita" | "sistema" | "instalacao";
    id: string;
    label: string;
  };
  descricao?: string;
  /** Diff opcional (campo: antes → depois). */
  diff?: Array<{ campo: string; antes?: string; depois?: string }>;
}

/** Linha da fila de revisitas — Central de Revisitas. */
export interface RevisitaPendente {
  id: string;
  equipamento: string;
  glpiId: string;
  municipio: string;
  motivoReprovacao: string;
  reprovadoEm: string;
  reprovadoPor: string;
  /** Técnico atual atribuído (se já houver). */
  tecnicoAtribuido?: { id: string; nome: string };
  prioridade: VistoriaPriority;
  /** PDF antigo (último gerado antes da reprovação). */
  pdfAnteriorPath?: string;
}

/** KPIs agregados do painel admin (overview). */
export interface PainelStats {
  pendentes: number;
  emVistoria: number;
  vistoriadas: number;
  aguardandoRevisita: number;
  emRevisita: number;
  revisitadas: number;
  reprovadasMes: number;
  municipiosAtivos: number;
  tecnicosAtivos: number;
  pdfsGerados: number;
  /** Vistorias devolvidas para correção (situação 8), aguardando o técnico. */
  devolvidas?: number;
  /** Vistorias com recusa aprovada — fora de circulação. */
  rejeitadas?: number;
  /** Vistorias atribuídas (saíram do backlog) nas últimas 24h — do audit log. */
  atribuidas24h?: number;
  /** Vistorias finalizadas nas últimas 24h — do audit log. */
  finalizadas24h?: number;
  ultimaSincronizacao: string;
  /** Série diária dos últimos 14 dias por status (sparkline). */
  trend14d?: {
    pendentes: number[];
    vistoriadas: number[];
    revisitas: number[];
  };
}

/* ─── histórico (mantido) ─────────────────────────────────────────── */

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
