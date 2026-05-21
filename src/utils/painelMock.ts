/**
 * Mocks operacionais do /painel.
 *
 * Tudo aqui é placeholder até existirem endpoints reais que agreguem:
 * - status do situaodavistoriafield (ou mapping do dropdown atual)
 * - lat/lng dos técnicos em campo (push periódico do app)
 * - tabela de auditoria (ainda não existe)
 *
 * Estrutura semelhante ao formato esperado dos endpoints futuros para
 * facilitar a troca quando o backend estiver pronto.
 */

import type {
  AtribuicaoOperacional,
  AuditEntry,
  PainelStats,
  RevisitaPendente,
  TecnicoAtivo,
} from "@/types";

function isoHoursAgo(h: number): string {
  const d = new Date();
  d.setHours(d.getHours() - h);
  return d.toISOString();
}

export const MOCK_PAINEL_STATS: PainelStats = {
  pendentes: 42,
  emVistoria: 9,
  vistoriadas: 128,
  aguardandoRevisita: 6,
  emRevisita: 2,
  revisitadas: 18,
  reprovadasMes: 11,
  municipiosAtivos: 4,
  tecnicosAtivos: 7,
  pdfsGerados: 144,
  ultimaSincronizacao: new Date().toISOString(),
  trend14d: {
    pendentes: [38, 41, 39, 44, 47, 45, 42, 40, 43, 46, 44, 42, 41, 42],
    vistoriadas: [
      90, 96, 102, 108, 113, 116, 118, 121, 124, 126, 127, 128, 128, 128,
    ],
    revisitas: [10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 18, 18, 18],
  },
};

export const MOCK_TECNICOS_ATIVOS: TecnicoAtivo[] = [
  {
    id: "tec-001",
    nome: "Felippe Andrade",
    email: "felippe@vistomap.io",
    status: "em-campo",
    lat: -22.9099,
    lng: -47.0626,
    municipio: "Campinas",
    atribuidas: 8,
    concluidasHoje: 3,
    ultimaAtividade: isoHoursAgo(0.2),
    bateria: 78,
  },
  {
    id: "tec-002",
    nome: "Mariana Costa",
    email: "mariana@vistomap.io",
    status: "em-campo",
    lat: -23.0008,
    lng: -46.9956,
    municipio: "Valinhos",
    atribuidas: 6,
    concluidasHoje: 4,
    ultimaAtividade: isoHoursAgo(0.5),
    bateria: 62,
  },
  {
    id: "tec-003",
    nome: "Roberto Pinto",
    email: "roberto@vistomap.io",
    status: "em-campo",
    lat: -23.0294,
    lng: -46.9764,
    municipio: "Vinhedo",
    atribuidas: 5,
    concluidasHoje: 2,
    ultimaAtividade: isoHoursAgo(1.1),
    bateria: 45,
  },
  {
    id: "tec-004",
    nome: "Ana Beatriz",
    email: "ana@vistomap.io",
    status: "base",
    lat: -23.0058,
    lng: -46.8431,
    municipio: "Itatiba",
    atribuidas: 4,
    concluidasHoje: 4,
    ultimaAtividade: isoHoursAgo(2.0),
    bateria: 92,
  },
  {
    id: "tec-005",
    nome: "Caio Mendes",
    email: "caio@vistomap.io",
    status: "off-shift",
    municipio: "Campinas",
    atribuidas: 0,
    concluidasHoje: 5,
    ultimaAtividade: isoHoursAgo(8),
    bateria: 22,
  },
  {
    id: "tec-006",
    nome: "Júlia Reis",
    email: "julia@vistomap.io",
    status: "em-campo",
    lat: -22.8956,
    lng: -47.0301,
    municipio: "Campinas",
    atribuidas: 7,
    concluidasHoje: 3,
    ultimaAtividade: isoHoursAgo(0.3),
    bateria: 71,
  },
  {
    id: "tec-007",
    nome: "Pedro Lima",
    email: "pedro@vistomap.io",
    status: "offline",
    municipio: "Itatiba",
    atribuidas: 0,
    concluidasHoje: 0,
    ultimaAtividade: isoHoursAgo(36),
    bateria: 0,
  },
];

export const MOCK_REVISITAS_PENDENTES: RevisitaPendente[] = [
  {
    id: "rev-001",
    equipamento: "CAM-V-N-005",
    glpiId: "NE-58",
    municipio: "Vinhedo",
    motivoReprovacao: "Foto do topo do poste fora de padrão. Reenviar.",
    reprovadoEm: isoHoursAgo(4),
    reprovadoPor: "Auditoria Concessionária",
    prioridade: "ALTA",
    pdfAnteriorPath: "/uploads/CAM-V-N-005/CAM-V-N-005-v1.pdf",
  },
  {
    id: "rev-002",
    equipamento: "CAM-I-T-008",
    glpiId: "NE-72",
    municipio: "Itatiba",
    motivoReprovacao: "Aterramento marcado como Não — necessário confirmar em campo.",
    reprovadoEm: isoHoursAgo(8),
    reprovadoPor: "Auditoria Concessionária",
    tecnicoAtribuido: { id: "tec-004", nome: "Ana Beatriz" },
    prioridade: "MEDIA",
  },
  {
    id: "rev-003",
    equipamento: "CAM-C-W-012",
    glpiId: "NE-94",
    municipio: "Campinas",
    motivoReprovacao: "Endereço divergente — recoletar via GPS.",
    reprovadoEm: isoHoursAgo(24),
    reprovadoPor: "Auditoria Concessionária",
    prioridade: "BAIXA",
  },
  {
    id: "rev-004",
    equipamento: "CAM-V-L-003",
    glpiId: "NE-31",
    municipio: "Valinhos",
    motivoReprovacao: "Print da operadora Claro ilegível.",
    reprovadoEm: isoHoursAgo(48),
    reprovadoPor: "Auditoria Concessionária",
    tecnicoAtribuido: { id: "tec-002", nome: "Mariana Costa" },
    prioridade: "CRITICA",
  },
  {
    id: "rev-005",
    equipamento: "CAM-C-S-019",
    glpiId: "NE-107",
    municipio: "Campinas",
    motivoReprovacao: "Vídeo 360° não cobre toda a base do poste.",
    reprovadoEm: isoHoursAgo(72),
    reprovadoPor: "Auditoria Concessionária",
    prioridade: "MEDIA",
  },
  {
    id: "rev-006",
    equipamento: "CAM-I-T-014",
    glpiId: "NE-118",
    municipio: "Itatiba",
    motivoReprovacao: "Coordenadas fora do raio do PSPOSTE registrado.",
    reprovadoEm: isoHoursAgo(96),
    reprovadoPor: "Auditoria Concessionária",
    prioridade: "ALTA",
  },
];

export const MOCK_ATRIBUICOES_RECENTES: AtribuicaoOperacional[] = [
  {
    id: "atr-001",
    vistoriaId: "v-1001",
    equipamento: "CAM-C-S-021",
    municipio: "Campinas",
    tecnicoId: "tec-001",
    tecnicoNome: "Felippe Andrade",
    prioridade: "ALTA",
    atribuidoPor: "Admin",
    atribuidoEm: isoHoursAgo(1),
    status: "EM_VISTORIA",
    isRevisita: false,
  },
  {
    id: "atr-002",
    vistoriaId: "v-1002",
    equipamento: "CAM-V-N-009",
    municipio: "Vinhedo",
    tecnicoId: "tec-003",
    tecnicoNome: "Roberto Pinto",
    prioridade: "MEDIA",
    atribuidoPor: "Admin",
    atribuidoEm: isoHoursAgo(3),
    status: "EM_VISTORIA",
    isRevisita: false,
  },
  {
    id: "atr-003",
    vistoriaId: "v-1003",
    equipamento: "CAM-V-L-003",
    municipio: "Valinhos",
    tecnicoId: "tec-002",
    tecnicoNome: "Mariana Costa",
    prioridade: "CRITICA",
    atribuidoPor: "Admin",
    atribuidoEm: isoHoursAgo(5),
    status: "EM_REVISITA",
    isRevisita: true,
    motivoRevisita: "Print da operadora Claro ilegível.",
  },
];

const ADMIN_ATOR = { id: "u-9", nome: "Felippe Guedes", role: "admin" as const };
const TEC_ATOR = (i: number, nome: string) => ({ id: `tec-00${i}`, nome, role: "tecnico" as const });

export const MOCK_AUDIT: AuditEntry[] = [
  {
    id: "a-1",
    timestamp: isoHoursAgo(0.5),
    ator: ADMIN_ATOR,
    acao: "vistoria-atribuida",
    alvo: { tipo: "vistoria", id: "v-1001", label: "CAM-C-S-021" },
    descricao: "Atribuída a Felippe Andrade · Campinas",
  },
  {
    id: "a-2",
    timestamp: isoHoursAgo(1.0),
    ator: TEC_ATOR(1, "Felippe Andrade"),
    acao: "vistoria-finalizada",
    alvo: { tipo: "vistoria", id: "v-980", label: "CAM-C-S-019" },
    descricao: "Evidências enviadas. status → Vistoriado.",
  },
  {
    id: "a-3",
    timestamp: isoHoursAgo(2.4),
    ator: ADMIN_ATOR,
    acao: "revisita-criada",
    alvo: { tipo: "revisita", id: "rev-001", label: "CAM-V-N-005" },
    descricao: "Reprovação registrada pela concessionária.",
  },
  {
    id: "a-4",
    timestamp: isoHoursAgo(3.1),
    ator: ADMIN_ATOR,
    acao: "revisita-atribuida",
    alvo: { tipo: "revisita", id: "rev-002", label: "CAM-I-T-008" },
    descricao: "Atribuída a Ana Beatriz · Itatiba",
  },
  {
    id: "a-5",
    timestamp: isoHoursAgo(4.0),
    ator: ADMIN_ATOR,
    acao: "vistoria-reprovada",
    alvo: { tipo: "vistoria", id: "v-915", label: "CAM-V-N-005" },
    descricao: "Motivo: topo do poste fora de padrão.",
  },
  {
    id: "a-6",
    timestamp: isoHoursAgo(4.8),
    ator: { id: "worker", nome: "Worker PDF", role: "admin" },
    acao: "pdf-regenerado",
    alvo: { tipo: "vistoria", id: "v-902", label: "CAM-V-L-003" },
    descricao: "project_status: PENDENTE → GERANDO → GERADO",
  },
  {
    id: "a-7",
    timestamp: isoHoursAgo(6.0),
    ator: ADMIN_ATOR,
    acao: "dados-editados",
    alvo: { tipo: "vistoria", id: "v-880", label: "CAM-C-W-012" },
    descricao: "Endereço corrigido após GPS.",
    diff: [
      { campo: "endereofield", antes: "—", depois: "Av. Andrade Neves, 220" },
      { campo: "municipiofield", antes: "Indaiatuba", depois: "Campinas" },
    ],
  },
  {
    id: "a-8",
    timestamp: isoHoursAgo(8.0),
    ator: TEC_ATOR(2, "Mariana Costa"),
    acao: "vistoria-finalizada",
    alvo: { tipo: "vistoria", id: "v-870", label: "CAM-V-L-007" },
  },
  {
    id: "a-9",
    timestamp: isoHoursAgo(10),
    ator: ADMIN_ATOR,
    acao: "sincronizacao",
    alvo: { tipo: "sistema", id: "sync-day", label: "Sincronização operacional" },
    descricao: "12 ordens atualizadas do GLPI.",
  },
  {
    id: "a-10",
    timestamp: isoHoursAgo(12),
    ator: ADMIN_ATOR,
    acao: "vistoria-aprovada",
    alvo: { tipo: "vistoria", id: "v-860", label: "CAM-I-T-005" },
    descricao: "Aprovada pela concessionária.",
  },
];
