import "server-only";
import { query } from "@/lib/db";
import { TABLE_FIELDS } from "./constants";
import { listRecusas } from "./recusas";
import { getCoresIdentidade } from "./tecnicoIdentidade";
import { ensureOverrideTable } from "@/lib/ensureOverrideTable";
import { sanitizeFolderName } from "@/lib/sanitize";
import { signUploadUrl } from "@/lib/uploadUrl";
import {
  RECUSA_MOTIVO_CATEGORIA,
  RECUSA_MOTIVO_LABEL,
  type RecusaMotivo,
} from "./recusaMotivos";

/**
 * Ocorrências operacionais — a leitura unificada de "o que travou a operação".
 *
 * Três naturezas DIFERENTES que antes viviam misturadas numa caixa de
 * notificações, e que o supervisor precisa distinguir na hora:
 *
 *   IMPEDIMENTO  o ambiente travou a vistoria — condomínio fechado, área sem
 *                acesso, nenhum poste alternativo. Ninguém decidiu nada; pode
 *                destravar depois.
 *   RECUSA       houve decisão explícita — sinal fora do padrão CPFL, morador
 *                recusou, risco que o técnico optou por não correr.
 *   EXCEÇÃO      o técnico pediu pra sair do fluxo esperado (trabalhar fora do
 *                raio do geofence) e isso precisou de análise.
 *
 * As duas primeiras saem da MESMA tabela (`recusas`) — o que as separa é o
 * motivo, já classificado em recusaMotivos.ts. A terceira vem de
 * `override_requests`. Nenhuma tabela nova: a arquitetura de dados já
 * distinguia as três, só a interface é que não.
 */

export type OcorrenciaTipo = "impedimento" | "recusa" | "excecao";
export type OcorrenciaStatus = "PENDENTE" | "APROVADO" | "REPROVADO" | "REABERTA";
export type OcorrenciaPrioridade = "normal" | "atencao" | "critico";

export const OCORRENCIA_TIPOS: OcorrenciaTipo[] = ["impedimento", "recusa", "excecao"];

export const TIPO_LABEL: Record<OcorrenciaTipo, string> = {
  impedimento: "Impedimento",
  recusa: "Recusa",
  excecao: "Exceção",
};

export interface Ocorrencia {
  /** Único entre os tipos — o id sozinho só é único dentro da própria tabela. */
  chave: string;
  origem: "recusa" | "override";
  id: number;
  tipo: OcorrenciaTipo;
  motivo: string;
  motivoLabel: string;
  vistoriaId: number;
  equipamento: string;
  municipio: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  tecnicoId: number;
  tecnicoNome: string;
  /** Mesma cor de identidade do mapa — liga pessoa ↔ ocorrência sem legenda. */
  tecnicoCor: string | null;
  justificativa: string;
  respostas: Record<string, string>;
  motivoReprovacao: string | null;
  /** Só exceções de raio têm distância; o resto é null. */
  distanciaM: number | null;
  fotoUrl: string | null;
  status: OcorrenciaStatus;
  criadoEm: string;
  resolvidoEm: string | null;
  /** Posição desta tentativa dentro da MESMA vistoria (1 = primeira). */
  tentativa: number;
  totalTentativas: number;
  prioridade: OcorrenciaPrioridade;
  /** Horas em aberto — só faz sentido enquanto está PENDENTE. */
  horasAberto: number | null;
}

export interface MotivoAgregado {
  motivo: string;
  label: string;
  tipo: OcorrenciaTipo;
  total: number;
  pendentes: number;
}

export interface TecnicoAgregado {
  id: number;
  nome: string;
  cor: string | null;
  total: number;
  pendentes: number;
}

export interface OcorrenciasResumo {
  total: number;
  /** Aguardando decisão do analista agora. */
  pendentes: number;
  /** Abertas nos últimos 7 dias (qualquer status). */
  novas7d: number;
  resolvidas: number;
  /** Média de horas entre abertura e resolução. null sem amostra. */
  tempoMedioHoras: number | null;
  /** Vistorias que acumularam mais de uma tentativa. */
  vistoriasReincidentes: number;
  porTipo: Record<OcorrenciaTipo, { total: number; pendentes: number; novas7d: number }>;
  motivos: MotivoAgregado[];
  tecnicos: TecnicoAgregado[];
}

export interface OcorrenciasResponse {
  ocorrencias: Ocorrencia[];
  resumo: OcorrenciasResumo;
  geradoEm: string;
}

/* ── prioridade ───────────────────────────────────────────────────────────
 * Derivada só de sinal real: há quanto tempo está parada e quantas vezes a
 * MESMA vistoria já travou. Sem campo de prioridade no banco e sem chute —
 * uma ocorrência resolvida nunca é crítica, por mais antiga que seja.
 */
const HORAS_ATENCAO = 12;
const HORAS_CRITICO = 48;

function calcPrioridade(
  status: OcorrenciaStatus,
  horasAberto: number | null,
  totalTentativas: number
): OcorrenciaPrioridade {
  if (totalTentativas >= 3) return "critico";
  if (status !== "PENDENTE") return "normal";
  if (horasAberto != null && horasAberto >= HORAS_CRITICO) return "critico";
  if (totalTentativas >= 2) return "atencao";
  if (horasAberto != null && horasAberto >= HORAS_ATENCAO) return "atencao";
  return "normal";
}

interface OverrideRow {
  id: number;
  vistoria_id: number;
  users_id: number;
  equipamento: string;
  tecnico_nome: string;
  justificativa: string;
  status: "PENDENTE" | "APROVADO" | "REPROVADO";
  motivo_reprovacao: string | null;
  distancia_m: number | null;
  exception_label: string | null;
  created_at: string;
  updated_at: string;
}

interface LocalRow {
  items_id: number;
  endereco: string | null;
  municipio: string | null;
  lat: string | null;
  lng: string | null;
}

/** "FORA DO RAIO (989 m)" → "Fora do raio permitido"; o número vira distanciaM. */
function rotuloExcecao(label: string | null, distanciaM: number | null): string {
  const cru = (label ?? "").trim();
  if (!cru) return "Exceção de localização";
  if (/^FORA DO RAIO/i.test(cru)) return "Fora do raio permitido";
  if (/^DEVOLUCAO_NAO_POSSO_DESLOCAR$/i.test(cru)) return "Não pode se deslocar (devolução)";
  // Rótulo desconhecido: mostra como veio, sem a distância repetida.
  return distanciaM != null ? cru.replace(/\s*\(\d+\s*m\)\s*$/i, "") : cru;
}

function horasEntre(de: string, ate: number): number {
  const t = new Date(de.replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (ate - t) / 3_600_000);
}

/**
 * Todas as ocorrências, já com local, técnico (cor de identidade), tentativa e
 * prioridade resolvidos. Uma chamada só: a tela é um painel, não uma lista
 * paginada — e o volume total é de centenas, não milhões.
 */
export async function fetchOcorrencias(limite = 400): Promise<OcorrenciasResponse> {
  await ensureOverrideTable();

  const [recusas, overrides] = await Promise.all([
    listRecusas({ limit: limite }),
    query<OverrideRow>(
      `SELECT id, vistoria_id, users_id, equipamento, tecnico_nome, justificativa,
              status, motivo_reprovacao, distancia_m, exception_label, created_at, updated_at
         FROM \`glpi_plugin_vistomap_override_requests\`
        ORDER BY created_at DESC
        LIMIT ${Math.min(Math.max(limite, 1), 1000)}`
    ),
  ]);

  // Local vem da vistoria (as tabelas de ocorrência não guardam lugar nenhum).
  const vistoriaIds = [
    ...new Set([...recusas.map((r) => r.vistoriaId), ...overrides.map((o) => o.vistoria_id)].filter((v) => v > 0)),
  ];
  const localPorId = new Map<number, LocalRow>();
  if (vistoriaIds.length > 0) {
    const marcadores = vistoriaIds.map(() => "?").join(",");
    const linhas = await query<LocalRow>(
      `SELECT items_id,
              endereofield   AS endereco,
              municipiofield AS municipio,
              latitudefield  AS lat,
              longitudefield AS lng
         FROM \`${TABLE_FIELDS}\`
        WHERE items_id IN (${marcadores})`,
      vistoriaIds
    );
    for (const l of linhas) localPorId.set(l.items_id, l);
  }

  const cores = await getCoresIdentidade([
    ...recusas.map((r) => r.tecnicoId),
    ...overrides.map((o) => o.users_id),
  ]);

  const numero = (v: string | null): number | null => {
    if (!v) return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n !== 0 ? n : null;
  };

  const agora = Date.now();

  interface Parcial extends Omit<Ocorrencia, "tentativa" | "totalTentativas" | "prioridade"> {}

  const parciais: Parcial[] = [
    ...recusas.map((r): Parcial => {
      const motivo = r.motivo as RecusaMotivo;
      const local = localPorId.get(r.vistoriaId);
      return {
        chave: `recusa-${r.id}`,
        origem: "recusa",
        id: r.id,
        tipo: RECUSA_MOTIVO_CATEGORIA[motivo] ?? "recusa",
        motivo: r.motivo,
        motivoLabel: RECUSA_MOTIVO_LABEL[motivo] ?? r.motivo,
        vistoriaId: r.vistoriaId,
        equipamento: r.equipamento,
        municipio: local?.municipio ?? null,
        endereco: local?.endereco ?? null,
        latitude: numero(local?.lat ?? null),
        longitude: numero(local?.lng ?? null),
        tecnicoId: r.tecnicoId,
        tecnicoNome: r.tecnicoNome,
        tecnicoCor: cores.get(r.tecnicoId) ?? null,
        justificativa: r.justificativa,
        respostas: r.respostas,
        motivoReprovacao: r.motivoReprovacao,
        distanciaM: null,
        fotoUrl: r.fotoPath ? signUploadUrl(sanitizeFolderName(r.equipamento), r.fotoPath) : null,
        status: r.status,
        criadoEm: r.criadoEm,
        resolvidoEm: r.resolvidoEm,
        horasAberto: r.status === "PENDENTE" ? horasEntre(r.criadoEm, agora) : null,
      };
    }),
    ...overrides.map((o): Parcial => {
      const local = localPorId.get(o.vistoria_id);
      return {
        chave: `override-${o.id}`,
        origem: "override",
        id: o.id,
        tipo: "excecao",
        motivo: o.exception_label ?? "EXCECAO",
        motivoLabel: rotuloExcecao(o.exception_label, o.distancia_m),
        vistoriaId: o.vistoria_id,
        equipamento: o.equipamento,
        municipio: local?.municipio ?? null,
        endereco: local?.endereco ?? null,
        latitude: numero(local?.lat ?? null),
        longitude: numero(local?.lng ?? null),
        tecnicoId: o.users_id,
        tecnicoNome: o.tecnico_nome,
        tecnicoCor: cores.get(o.users_id) ?? null,
        justificativa: o.justificativa,
        respostas: {},
        motivoReprovacao: o.motivo_reprovacao,
        distanciaM: o.distancia_m,
        fotoUrl: null,
        status: o.status,
        criadoEm: o.created_at,
        resolvidoEm: o.status === "PENDENTE" ? null : o.updated_at,
        horasAberto: o.status === "PENDENTE" ? horasEntre(o.created_at, agora) : null,
      };
    }),
  ];

  // Tentativas: a MESMA vistoria pode travar várias vezes. Não é uma vistoria
  // nova a cada vez — é a evolução da mesma ocorrência, e é isso que mostra
  // quais casos estão realmente emperrados.
  const porVistoria = new Map<number, Parcial[]>();
  for (const p of parciais) {
    const lista = porVistoria.get(p.vistoriaId) ?? [];
    lista.push(p);
    porVistoria.set(p.vistoriaId, lista);
  }
  const ordem = new Map<string, { tentativa: number; total: number }>();
  for (const lista of porVistoria.values()) {
    const cronologica = [...lista].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
    cronologica.forEach((p, i) => ordem.set(p.chave, { tentativa: i + 1, total: cronologica.length }));
  }

  const ocorrencias: Ocorrencia[] = parciais
    .map((p) => {
      const o = ordem.get(p.chave) ?? { tentativa: 1, total: 1 };
      return {
        ...p,
        tentativa: o.tentativa,
        totalTentativas: o.total,
        prioridade: calcPrioridade(p.status, p.horasAberto, o.total),
      };
    })
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

  return { ocorrencias, resumo: resumir(ocorrencias, agora), geradoEm: new Date().toISOString() };
}

const SETE_DIAS_MS = 7 * 24 * 3_600_000;

function resumir(lista: Ocorrencia[], agora: number): OcorrenciasResumo {
  const porTipo = {
    impedimento: { total: 0, pendentes: 0, novas7d: 0 },
    recusa: { total: 0, pendentes: 0, novas7d: 0 },
    excecao: { total: 0, pendentes: 0, novas7d: 0 },
  } as OcorrenciasResumo["porTipo"];

  const motivos = new Map<string, MotivoAgregado>();
  const tecnicos = new Map<number, TecnicoAgregado>();
  const vistoriasComMais = new Set<number>();
  let pendentes = 0, novas7d = 0, resolvidas = 0;
  let somaHoras = 0, amostraTempo = 0;

  for (const o of lista) {
    const recente = agora - new Date(o.criadoEm.replace(" ", "T") + "Z").getTime() <= SETE_DIAS_MS;
    const t = porTipo[o.tipo];
    t.total += 1;
    if (o.status === "PENDENTE") { t.pendentes += 1; pendentes += 1; }
    if (recente) { t.novas7d += 1; novas7d += 1; }
    if (o.status === "APROVADO" || o.status === "REPROVADO") {
      resolvidas += 1;
      if (o.resolvidoEm) {
        const h = horasEntre(o.criadoEm, new Date(o.resolvidoEm.replace(" ", "T") + "Z").getTime());
        if (h >= 0) { somaHoras += h; amostraTempo += 1; }
      }
    }
    if (o.totalTentativas > 1) vistoriasComMais.add(o.vistoriaId);

    const m = motivos.get(o.motivo) ?? { motivo: o.motivo, label: o.motivoLabel, tipo: o.tipo, total: 0, pendentes: 0 };
    m.total += 1;
    if (o.status === "PENDENTE") m.pendentes += 1;
    motivos.set(o.motivo, m);

    if (o.tecnicoId > 0) {
      const tec = tecnicos.get(o.tecnicoId) ?? { id: o.tecnicoId, nome: o.tecnicoNome, cor: o.tecnicoCor, total: 0, pendentes: 0 };
      tec.total += 1;
      if (o.status === "PENDENTE") tec.pendentes += 1;
      tecnicos.set(o.tecnicoId, tec);
    }
  }

  return {
    total: lista.length,
    pendentes,
    novas7d,
    resolvidas,
    tempoMedioHoras: amostraTempo > 0 ? somaHoras / amostraTempo : null,
    vistoriasReincidentes: vistoriasComMais.size,
    porTipo,
    motivos: [...motivos.values()].sort((a, b) => b.total - a.total),
    tecnicos: [...tecnicos.values()].sort((a, b) => b.total - a.total),
  };
}
