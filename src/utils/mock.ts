import type {
  Vistoria,
  DashboardStats,
  Tecnico,
  SyncSnapshot,
  ProfileInfo,
  HistoricoSummary,
  HistoricoEntry,
} from "@/types";

export const MOCK_TECNICO: Tecnico = {
  id: "tec-001",
  nome: "Felippe Andrade",
  email: "felippe@vistomap.io",
  matricula: "VM-04219",
};

export const MOCK_VISTORIAS: Vistoria[] = [
  {
    id: "vst-1001",
    glpiId: "GLPI-220419",
    equipamento: "Nobreak APC SRT 10kVA",
    cidade: "São Paulo",
    estado: "SP",
    endereco: "Av. Paulista, 1578 — Bela Vista",
    status: "PENDENTE",
    prioridade: "ALTA",
    tecnico: MOCK_TECNICO,
    latitude: -23.5614,
    longitude: -46.6559,
    agendadaPara: new Date(Date.now() + 2 * 3600_000).toISOString(),
    categoria: "Energia",
    online: true,
  },
  {
    id: "vst-1002",
    glpiId: "GLPI-220422",
    equipamento: "Switch Cisco Catalyst 9300",
    cidade: "Osasco",
    estado: "SP",
    endereco: "Al. Araguaia, 2104",
    status: "EM_CAMPO",
    prioridade: "CRITICA",
    tecnico: MOCK_TECNICO,
    latitude: -23.5325,
    longitude: -46.7916,
    categoria: "Rede",
    agendadaPara: new Date(Date.now() + 5 * 3600_000).toISOString(),
    online: true,
  },
  {
    id: "vst-1003",
    glpiId: "GLPI-220431",
    equipamento: "Servidor Dell PowerEdge R740",
    cidade: "Guarulhos",
    estado: "SP",
    endereco: "Rod. Hélio Smidt, S/N — Aeroporto",
    status: "FINALIZADA",
    prioridade: "MEDIA",
    tecnico: MOCK_TECNICO,
    latitude: -23.4356,
    longitude: -46.4731,
    categoria: "Servidor",
    online: false,
  },
  {
    id: "vst-1004",
    glpiId: "GLPI-220448",
    equipamento: "Câmera IP Hikvision DS-2CD2T47",
    cidade: "Santo André",
    estado: "SP",
    endereco: "Av. Industrial, 600",
    status: "APROVADA",
    prioridade: "BAIXA",
    tecnico: MOCK_TECNICO,
    latitude: -23.6663,
    longitude: -46.5301,
    categoria: "CFTV",
    online: false,
  },
  {
    id: "vst-1005",
    glpiId: "GLPI-220452",
    equipamento: "Roteador MikroTik CCR2004",
    cidade: "São Bernardo do Campo",
    estado: "SP",
    endereco: "Av. Kennedy, 1100",
    status: "REPROVADA",
    prioridade: "ALTA",
    tecnico: MOCK_TECNICO,
    latitude: -23.7026,
    longitude: -46.5614,
    categoria: "Rede",
    online: true,
  },
  {
    id: "vst-1006",
    glpiId: "GLPI-220467",
    equipamento: "Painel Solar Canadian 540W (string 12)",
    cidade: "Campinas",
    estado: "SP",
    endereco: "Rod. D. Pedro I, km 132",
    status: "PENDENTE",
    prioridade: "MEDIA",
    tecnico: MOCK_TECNICO,
    latitude: -22.9099,
    longitude: -47.0626,
    categoria: "Energia",
    agendadaPara: new Date(Date.now() + 26 * 3600_000).toISOString(),
    online: false,
  },
];

export const MOCK_STATS: DashboardStats = {
  total: 24,
  pendentes: 9,
  concluidas: 12,
  reprovadas: 3,
  ultimaSincronizacao: new Date().toISOString(),
  municipios: [
    { nome: "Campinas", totalVistorias: 12 },
    { nome: "Valinhos", totalVistorias: 5 },
    { nome: "Vinhedo", totalVistorias: 3 },
    { nome: "Itatiba", totalVistorias: 4 },
  ],
  trend7d: {
    pendentes: [6, 8, 7, 9, 10, 8, 9],
    concluidas: [6, 7, 8, 9, 10, 11, 12],
    reprovadas: [1, 1, 2, 2, 3, 2, 3],
  },
};

/* ── SYNC SNAPSHOTS ────────────────────────────────────────────────── */

function isoDaysAgo(days: number, hour = 8, minute = 40): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const MOCK_SYNC_SNAPSHOTS: SyncSnapshot[] = [
  {
    id: "sync-now",
    timestamp: MOCK_STATS.ultimaSincronizacao,
    stats: MOCK_STATS,
    label: "Última",
  },
  {
    id: "sync-d-1",
    timestamp: isoDaysAgo(1, 18, 22),
    stats: { ...MOCK_STATS, total: 22, pendentes: 11, concluidas: 9, reprovadas: 2 },
    label: "Ontem 18:22",
  },
  {
    id: "sync-d-2",
    timestamp: isoDaysAgo(2, 16, 5),
    stats: { ...MOCK_STATS, total: 20, pendentes: 13, concluidas: 6, reprovadas: 1 },
    label: "Anteontem 16:05",
  },
  {
    id: "sync-d-4",
    timestamp: isoDaysAgo(4, 9, 12),
    stats: { ...MOCK_STATS, total: 18, pendentes: 15, concluidas: 3, reprovadas: 0 },
  },
  {
    id: "sync-d-7",
    timestamp: isoDaysAgo(7, 14, 30),
    stats: { ...MOCK_STATS, total: 15, pendentes: 14, concluidas: 1, reprovadas: 0 },
  },
];

/* ── PERFIL ────────────────────────────────────────────────────────── */

export const MOCK_PROFILE: ProfileInfo = {
  tecnico: MOCK_TECNICO,
  cargo: "Técnico de Campo Sênior",
  equipe: "VistoMap-Tecnicos",
  municipioOperacional: "Campinas",
  statusOperacional: "em-campo",
  kpis: {
    vistoriasConcluidas: 142,
    revisitas: 18,
    aprovadas: 128,
    distanciaKm: 1284,
    diasAtivos: 87,
  },
};

/* ── HISTÓRICO OPERACIONAL ─────────────────────────────────────────── */

function entry(
  id: string,
  tipo: HistoricoEntry["tipo"],
  hoursAgo: number,
  titulo: string,
  extra: Partial<HistoricoEntry> = {}
): HistoricoEntry {
  const d = new Date();
  d.setHours(d.getHours() - hoursAgo);
  return { id, tipo, timestamp: d.toISOString(), titulo, ...extra };
}

export const MOCK_HISTORICO: HistoricoSummary = {
  periodo: { inicio: isoDaysAgo(7), fim: new Date().toISOString() },
  vistoriasEnviadas: 18,
  vistoriasEntregues: 16,
  aprovadas: 12,
  reprovadas: 3,
  revisitas: 4,
  pdfsGerados: 16,
  rotasExecutadas: 9,
  tempoOperacionalHoras: 52,
  distanciaPercorridaKm: 312,
  municipiosAtendidos: ["Campinas", "Valinhos", "Vinhedo", "Itatiba"],
  sincronizacoes: 14,
  timeline: [
    entry("h1", "vistoria-finalizada", 1, "Vistoria finalizada", {
      equipamento: "CAM-S-GE-002",
      municipio: "Campinas",
      glpiId: "NE-6",
      descricao: "Evidências enviadas, status atualizado para Em análise.",
    }),
    entry("h2", "pdf-gerado", 2, "PDF gerado pelo worker", {
      equipamento: "CAM-S-GE-002",
      municipio: "Campinas",
    }),
    entry("h3", "sincronizacao", 3, "Sincronização operacional", {
      descricao: "8 vistorias atualizadas do GLPI.",
    }),
    entry("h4", "mudanca-poste", 5, "Mudança de PSPOSTE registrada", {
      equipamento: "CAM-S-A-013",
      municipio: "Valinhos",
      descricao: "Motivo: POSTE_INACESSIVEL · 84m da coord. original.",
    }),
    entry("h5", "vistoria-iniciada", 7, "Vistoria iniciada", {
      equipamento: "CAM-S-A-013",
      municipio: "Valinhos",
      glpiId: "NE-12",
    }),
    entry("h6", "rota-iniciada", 9, "Rota operacional iniciada", {
      descricao: "Campinas → Valinhos → Vinhedo (3 paradas).",
    }),
    entry("h7", "revisita", 22, "Revisita marcada", {
      equipamento: "CAM-V-N-005",
      municipio: "Vinhedo",
      descricao: "Reprovada anteriormente — motivo: aterramento.",
    }),
    entry("h8", "aprovacao", 26, "Vistoria aprovada", {
      equipamento: "CAM-V-N-001",
      municipio: "Vinhedo",
      glpiId: "NE-3",
    }),
    entry("h9", "reprovacao", 30, "Vistoria reprovada", {
      equipamento: "CAM-I-T-008",
      municipio: "Itatiba",
      descricao: "Foto do topo do poste fora do padrão.",
    }),
    entry("h10", "sincronizacao", 48, "Sincronização operacional", {
      descricao: "6 vistorias atualizadas do GLPI.",
    }),
  ],
};
