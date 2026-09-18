import "server-only";
import { execute, query } from "@/lib/db";
import {
  RECUSA_MOTIVO_LABEL,
  RECUSA_MOTIVO_CATEGORIA,
  type RecusaCategoria,
  type RecusaMotivo,
} from "./recusaMotivos";

/**
 * Recusas — técnico declara que uma vistoria é impossível de fazer
 * (propriedade privada, risco, poste removido, sem alternativa nas
 * redondezas, etc.) e pede aprovação do analista.
 *
 * Diferente de devolução (analista aponta erro numa vistoria já feita):
 * aqui é o técnico que sinaliza ANTES de conseguir fazer a vistoria.
 * Enquanto PENDENTE, o técnico fica desvinculado da vistoria (some da
 * fila dele) — aprovada, some de circulação de vez; reprovada, volta
 * pra fila do mesmo técnico.
 *
 * Impedimento x Recusa (2026-09-14): passou a ser uma DECISÃO DO ANALISTA
 * no momento de aprovar, não mais um cálculo automático fixo em cima do
 * `motivo`. O técnico continua reportando do MESMO jeito de sempre (chat,
 * motivo, respostas) — só quem decide a categoria final é o analista, que
 * tem o contexto completo pra isso. `categoria` fica NULL até a aprovação;
 * antes disso (e pra todo o histórico anterior a esta mudança), a leitura
 * cai de volta pro palpite automático de recusaMotivos.ts — nunca some uma
 * classificação, só passa a poder ser corrigida por quem decide de fato.
 */

const TABLE = "glpi_plugin_vistomap_recusas";

let ensured = false;

export async function ensureRecusasTable(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
      id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      vistoria_id       INT             NOT NULL,
      equipamento       VARCHAR(255)    NOT NULL,
      tecnico_id        INT             NOT NULL,
      tecnico_nome      VARCHAR(255)    NOT NULL,
      motivo            VARCHAR(64)     NOT NULL,
      respostas_json    JSON            NULL,
      justificativa     TEXT            NOT NULL,
      foto_path         VARCHAR(255)    NULL,
      status            ENUM('PENDENTE','APROVADO','REPROVADO') NOT NULL DEFAULT 'PENDENTE',
      motivo_reprovacao TEXT            NULL,
      criado_em         timestamp       NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolvido_em      timestamp       NULL DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_vistoria (vistoria_id),
      KEY idx_status   (status),
      KEY idx_tecnico  (tecnico_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Migração defensiva: tabela pode já existir de antes do upload de foto
  // (Fase 1 saiu sem essa coluna).
  const cols = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM information_schema.columns
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [TABLE]
  );
  const names = new Set(cols.map((c) => c.COLUMN_NAME));
  if (!names.has("foto_path")) {
    await execute(`ALTER TABLE \`${TABLE}\` ADD COLUMN foto_path VARCHAR(255) NULL AFTER justificativa`);
  }

  // Migração defensiva: status 'REABERTA' (vistoria reaberta a partir de
  // Rejeitadas — some da fila de rejeitadas/contagem sem precisar mexer em
  // nenhuma query de leitura, que já filtram por status='APROVADO').
  const [statusCol] = await query<{ COLUMN_TYPE: string }>(
    `SELECT COLUMN_TYPE FROM information_schema.columns
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'status'`,
    [TABLE]
  );
  if (statusCol && !statusCol.COLUMN_TYPE.includes("REABERTA")) {
    await execute(
      `ALTER TABLE \`${TABLE}\` MODIFY COLUMN status ENUM('PENDENTE','APROVADO','REPROVADO','REABERTA') NOT NULL DEFAULT 'PENDENTE'`
    );
  }

  // Migração defensiva: categoria escolhida pelo analista na aprovação
  // (ver comentário no topo do arquivo). NULL = ainda não decidida, ou
  // registro anterior a esta mudança — cai no palpite automático.
  if (!names.has("categoria")) {
    await execute(
      `ALTER TABLE \`${TABLE}\` ADD COLUMN categoria ENUM('impedimento','recusa') NULL DEFAULT NULL AFTER motivo_reprovacao`
    );
  }

  ensured = true;
}

export interface CriarRecusaInput {
  vistoriaId: number;
  equipamento: string;
  tecnicoId: number;
  tecnicoNome: string;
  motivo: string;
  respostas: Record<string, string>;
  justificativa: string;
  fotoPath?: string | null;
}

export async function criarRecusa(input: CriarRecusaInput): Promise<number> {
  await ensureRecusasTable();
  const { insertId } = await execute(
    `INSERT INTO \`${TABLE}\`
       (vistoria_id, equipamento, tecnico_id, tecnico_nome, motivo, respostas_json, justificativa, foto_path, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE')`,
    [
      input.vistoriaId,
      input.equipamento,
      input.tecnicoId,
      input.tecnicoNome,
      input.motivo,
      JSON.stringify(input.respostas),
      input.justificativa,
      input.fotoPath ?? null,
    ]
  );
  return insertId;
}

export interface RecusaRow {
  id: number;
  vistoria_id: number;
  equipamento: string;
  tecnico_id: number;
  tecnico_nome: string;
  motivo: string;
  respostas_json: string | null;
  justificativa: string;
  foto_path: string | null;
  status: "PENDENTE" | "APROVADO" | "REPROVADO" | "REABERTA";
  motivo_reprovacao: string | null;
  /** Escolha do analista na aprovação — NULL = ainda não decidida/histórico. */
  categoria: RecusaCategoria | null;
  criado_em: string;
  resolvido_em: string | null;
}

export interface Recusa {
  id: number;
  vistoriaId: number;
  equipamento: string;
  tecnicoId: number;
  tecnicoNome: string;
  motivo: string;
  respostas: Record<string, string>;
  justificativa: string;
  fotoPath: string | null;
  status: "PENDENTE" | "APROVADO" | "REPROVADO" | "REABERTA";
  motivoReprovacao: string | null;
  /** Escolha do analista na aprovação — NULL = ainda não decidida/histórico (ver recusaMotivos.ts pro palpite automático). */
  categoria: RecusaCategoria | null;
  criadoEm: string;
  resolvidoEm: string | null;
}

function mapRow(r: RecusaRow): Recusa {
  let respostas: Record<string, string> = {};
  try {
    respostas = r.respostas_json ? JSON.parse(r.respostas_json) : {};
  } catch {
    /* ignora respostas malformadas */
  }
  return {
    id: r.id,
    vistoriaId: r.vistoria_id,
    equipamento: r.equipamento,
    tecnicoId: r.tecnico_id,
    tecnicoNome: r.tecnico_nome,
    motivo: r.motivo,
    respostas,
    justificativa: r.justificativa,
    fotoPath: r.foto_path,
    status: r.status,
    motivoReprovacao: r.motivo_reprovacao,
    categoria: r.categoria,
    criadoEm: r.criado_em,
    resolvidoEm: r.resolvido_em,
  };
}

export async function fetchRecusaPendentePorVistoria(vistoriaId: number): Promise<Recusa | null> {
  await ensureRecusasTable();
  const rows = await query<RecusaRow>(
    `SELECT * FROM \`${TABLE}\` WHERE vistoria_id = ? AND status = 'PENDENTE' ORDER BY criado_em DESC LIMIT 1`,
    [vistoriaId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function fetchRecusaPorId(id: number): Promise<Recusa | null> {
  await ensureRecusasTable();
  const rows = await query<RecusaRow>(`SELECT * FROM \`${TABLE}\` WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * `categoria` só faz sentido em APROVADO — é a resposta do analista pra
 * "essa solicitação se enquadra em impedimento ou recusa?" (ver topo do
 * arquivo). Reprovado não precisa: a vistoria simplesmente volta pro
 * técnico, não entra na estatística de impedimento/recusa.
 */
export async function resolverRecusa(
  id: number,
  status: "APROVADO" | "REPROVADO",
  motivoReprovacao?: string,
  categoria?: RecusaCategoria
): Promise<void> {
  await ensureRecusasTable();
  await execute(
    `UPDATE \`${TABLE}\` SET status = ?, motivo_reprovacao = ?, categoria = ?, resolvido_em = NOW() WHERE id = ?`,
    [
      status,
      status === "REPROVADO" ? (motivoReprovacao ?? "").trim() : null,
      status === "APROVADO" ? categoria ?? null : null,
      id,
    ]
  );
}

/**
 * Reabre uma recusa aprovada — usado pelo "Reatribuir e reabrir" de
 * Rejeitadas. A vistoria já foi reatribuída/situação resetada por
 * reatribuirVistoria(); isso aqui só marca a recusa como não-mais-ativa
 * (some de /painel/rejeitadas, para de contar como rejeitada nas
 * estatísticas/mapa — nenhuma dessas leituras precisa mudar, todas já
 * filtram por status='APROVADO').
 */
export async function reabrirRecusa(id: number): Promise<void> {
  await ensureRecusasTable();
  await execute(`UPDATE \`${TABLE}\` SET status = 'REABERTA' WHERE id = ?`, [id]);
}

export interface FetchRecusasFilters {
  status?: "PENDENTE" | "APROVADO" | "REPROVADO";
  limit?: number;
}

export async function listRecusas(filters: FetchRecusasFilters = {}): Promise<Recusa[]> {
  await ensureRecusasTable();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    where.push("status = ?");
    params.push(filters.status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const rows = await query<RecusaRow>(
    `SELECT * FROM \`${TABLE}\` ${whereSql} ORDER BY criado_em DESC LIMIT ${limit}`,
    params
  );
  return rows.map(mapRow);
}

export interface RecusaMotivoAgregado {
  motivo: string;
  label: string;
  total: number;
}

export interface RecusasStats {
  total: number;
  porCategoria: Record<RecusaCategoria, { total: number; porMotivo: RecusaMotivoAgregado[] }>;
}

/**
 * Impedimentos e recusas agrupados por motivo — pro dashboard ("Impedimentos
 * e motivos, quantidade" / "Recusas e motivo, quantidade"). Mesmo formato de
 * fetchDevolucoesStats() (devolucoes.ts).
 *
 * Só conta PENDENTE + APROVADO — Reprovado significa que o analista NEGOU o
 * pedido do técnico (a vistoria simplesmente volta pra fila normal), não é
 * um impedimento/recusa "de verdade" pra fins de estatística (mesma regra
 * documentada em resolverRecusa() acima).
 *
 * `categoria` só existe quando já foi decidida na aprovação — pendentes
 * (e histórico anterior à mudança de 2026-09-14) caem no palpite automático
 * de RECUSA_MOTIVO_CATEGORIA, mesma regra de leitura já documentada no topo
 * deste arquivo.
 */
export async function fetchRecusasStats(): Promise<RecusasStats> {
  await ensureRecusasTable();
  const [aprovadas, pendentes] = await Promise.all([
    listRecusas({ status: "APROVADO", limit: 500 }),
    listRecusas({ status: "PENDENTE", limit: 500 }),
  ]);
  const itens = [...aprovadas, ...pendentes];

  const contagem: Record<RecusaCategoria, Map<string, number>> = {
    impedimento: new Map(),
    recusa: new Map(),
  };

  for (const r of itens) {
    const categoria: RecusaCategoria =
      r.categoria ?? RECUSA_MOTIVO_CATEGORIA[r.motivo as RecusaMotivo] ?? "recusa";
    const mapa = contagem[categoria];
    mapa.set(r.motivo, (mapa.get(r.motivo) ?? 0) + 1);
  }

  const montarRanking = (mapa: Map<string, number>): RecusaMotivoAgregado[] =>
    [...mapa.entries()]
      .map(([motivo, total]) => ({
        motivo,
        label: RECUSA_MOTIVO_LABEL[motivo as RecusaMotivo] ?? motivo,
        total,
      }))
      .sort((a, b) => b.total - a.total);

  const impedimento = montarRanking(contagem.impedimento);
  const recusa = montarRanking(contagem.recusa);

  return {
    total: itens.length,
    porCategoria: {
      impedimento: { total: impedimento.reduce((a, m) => a + m.total, 0), porMotivo: impedimento },
      recusa: { total: recusa.reduce((a, m) => a + m.total, 0), porMotivo: recusa },
    },
  };
}
