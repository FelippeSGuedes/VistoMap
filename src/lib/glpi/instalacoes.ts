import "server-only";
import { execute, query } from "@/lib/db";
import {
  INSTALACAO_CHECKLIST_COLUMNS,
  INSTALACAO_EMPRESA_COLUMN,
  INSTALACAO_INSTALADOR_COLUMN,
  INSTALACAO_TENSAO_COLUMN,
  STATE_AGUARDANDO_VISTORIA,
  STATE_EM_INSTALACAO,
  STATE_EM_PROCESSO_VISTORIA,
  STATE_INSTALADO,
  STATE_LIBERADO_INSTALACAO,
  TABLE_EMPRESA,
  TABLE_FIELDS,
  TABLE_NE,
  TABLE_STATES,
  TABLE_TENSAO_IDENTIFICADA,
  TABLE_USERS,
  TABLE_VALIDACAO_CPFL,
  VALIDADOR_CPFL_STATUS_COLUMN,
  VALIDADOR_CPFL_USER_COLUMN,
  type InstalacaoChecklistKey,
} from "./constants";

/**
 * Módulo de Instalação — lê o MESMO registro NetworkEquipment/TABLE_FIELDS
 * que a vistoria, mas nunca toca nas colunas que a vistoria usa: só os
 * campos novos (checklist, instalador, validação CPFL) e o campo nativo
 * `states_id` (fora do plugin). Contexto do poste (endereço, material,
 * rede, etc.) é lido em modo leitura, igual ao que a vistoria já preencheu.
 */

const CHECKLIST_SELECT = Object.entries(INSTALACAO_CHECKLIST_COLUMNS)
  .map(([key, col]) => `f.\`${col}\` AS checklist_${key}`)
  .join(",\n    ");

const SELECT_BASE = `
  SELECT
    ne.id AS id,
    ne.name AS name,
    ne.states_id AS status_geral_id,
    st.name AS status_geral_name,

    f.municipiofield AS municipio,
    f.pspostefield AS ps_poste,
    REPLACE(f.latitudefield, ',', '.') + 0.0 AS latitude,
    REPLACE(f.longitudefield, ',', '.') + 0.0 AS longitude,
    f.alturadopostemfield AS altura_poste,
    f.endereofield AS endereco,
    f.observaofield AS observacao,
    f.aterramentofield AS aterramento,
    f.materialfield AS material,
    f.danfield AS dan,
    f.chavefield AS chave,
    f.redeprimriafield AS rede_primaria,
    f.redesecundriafield AS rede_secundaria,
    f.religadorfield AS religador,
    f.transformadorfield AS transformador,
    f.instalartpfield AS instalar_tp,
    f.datadeinstalaofield AS data_instalacao,

    d_eq.name AS equipamento,
    d_fmt.name AS formato,
    d_tv.name AS tensao_contexto,
    d_loc.name AS local_instalacao,
    d_alim.name AS alimentacao,
    empresa.name AS empresa,

    f.${INSTALACAO_TENSAO_COLUMN} AS tensao_identificada_id,
    d_tid.name AS tensao_identificada,

    f.${INSTALACAO_INSTALADOR_COLUMN} AS instalador_id,
    TRIM(CONCAT(COALESCE(inst.firstname, ''), ' ', COALESCE(inst.realname, ''))) AS instalador_nome_completo,
    inst.name AS instalador_login,

    f.${VALIDADOR_CPFL_STATUS_COLUMN} AS validador_cpfl_status_id,
    val_status.name AS validador_cpfl_status,
    f.${VALIDADOR_CPFL_USER_COLUMN} AS validador_cpfl_user_id,
    TRIM(CONCAT(COALESCE(val.firstname, ''), ' ', COALESCE(val.realname, ''))) AS validador_cpfl_nome_completo,
    val.name AS validador_cpfl_login,

    ${CHECKLIST_SELECT}

  FROM \`${TABLE_NE}\` ne
  INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
  LEFT JOIN \`${TABLE_STATES}\` st ON st.id = ne.states_id
  LEFT JOIN \`glpi_plugin_fields_equipamentofielddropdowns\` d_eq ON d_eq.id = f.plugin_fields_equipamentofielddropdowns_id
  LEFT JOIN \`glpi_plugin_fields_formatofielddropdowns\` d_fmt ON d_fmt.id = f.plugin_fields_formatofielddropdowns_id
  LEFT JOIN \`glpi_plugin_fields_tensovfielddropdowns\` d_tv ON d_tv.id = f.plugin_fields_tensovfielddropdowns_id
  LEFT JOIN \`glpi_plugin_fields_localdeinstalaofielddropdowns\` d_loc ON d_loc.id = f.plugin_fields_localdeinstalaofielddropdowns_id
  LEFT JOIN \`glpi_plugin_fields_alimentaodoequipamentofielddropdowns\` d_alim ON d_alim.id = f.plugin_fields_alimentaodoequipamentofielddropdowns_id
  LEFT JOIN \`${TABLE_EMPRESA}\` empresa ON empresa.id = f.${INSTALACAO_EMPRESA_COLUMN}
  LEFT JOIN \`${TABLE_TENSAO_IDENTIFICADA}\` d_tid ON d_tid.id = f.${INSTALACAO_TENSAO_COLUMN}
  LEFT JOIN \`${TABLE_USERS}\` inst ON inst.id = f.${INSTALACAO_INSTALADOR_COLUMN}
  LEFT JOIN \`${TABLE_VALIDACAO_CPFL}\` val_status ON val_status.id = f.${VALIDADOR_CPFL_STATUS_COLUMN}
  LEFT JOIN \`${TABLE_USERS}\` val ON val.id = f.${VALIDADOR_CPFL_USER_COLUMN}
  WHERE ne.is_deleted = 0
`;

const HAS_COORDS = `
  AND f.latitudefield IS NOT NULL AND f.longitudefield IS NOT NULL
  AND TRIM(f.latitudefield) <> '' AND TRIM(f.longitudefield) <> ''
  AND REPLACE(f.latitudefield, ',', '.') + 0.0 <> 0
  AND REPLACE(f.longitudefield, ',', '.') + 0.0 <> 0
`;

interface RawRow {
  id: number;
  name: string;
  status_geral_id: number | null;
  status_geral_name: string | null;
  municipio: string | null;
  ps_poste: string | null;
  latitude: number | null;
  longitude: number | null;
  altura_poste: string | null;
  endereco: string | null;
  observacao: string | null;
  aterramento: string | null;
  material: string | null;
  dan: string | null;
  chave: number | string | null;
  rede_primaria: number | string | null;
  rede_secundaria: number | string | null;
  religador: number | string | null;
  transformador: number | string | null;
  instalar_tp: number | string | null;
  data_instalacao: string | null;
  equipamento: string | null;
  formato: string | null;
  tensao_contexto: string | null;
  local_instalacao: string | null;
  alimentacao: string | null;
  empresa: string | null;
  tensao_identificada_id: number | null;
  tensao_identificada: string | null;
  instalador_id: number | null;
  instalador_nome_completo: string | null;
  instalador_login: string | null;
  validador_cpfl_status_id: number | null;
  validador_cpfl_status: string | null;
  validador_cpfl_user_id: number | null;
  validador_cpfl_nome_completo: string | null;
  validador_cpfl_login: string | null;
  checklist_cintaInstalada: number | null;
  checklist_equipamentoFixado: number | null;
  checklist_cabeamentoOrganizado: number | null;
  checklist_alimentacaoValidada: number | null;
  checklist_equipamentoEnergizado: number | null;
  checklist_registroFotografico: number | null;
}

function yesNo(v: number | null): boolean | null {
  if (v == null) return null;
  return Number(v) === 1;
}

function nomeOuLogin(nomeCompleto: string | null, login: string | null): string | null {
  const nome = (nomeCompleto ?? "").trim();
  return nome || login || null;
}

function mapRow(r: RawRow) {
  return {
    id: String(r.id),
    glpiId: `NE-${r.id}`,
    equipamento: r.name,
    tipoEquipamento: r.equipamento,
    statusGeralId: r.status_geral_id,
    statusGeralNome: r.status_geral_name,
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
    // Contexto herdado da vistoria — leitura, nunca editado por aqui.
    contexto: {
      municipio: r.municipio ?? "",
      estado: "São Paulo",
      psPoste: r.ps_poste ?? "",
      alturaPoste: r.altura_poste ?? "",
      endereco: r.endereco ?? "",
      observacao: r.observacao ?? "",
      aterramento: yesNo(typeof r.aterramento === "string" ? Number(r.aterramento) : r.aterramento),
      material: r.material ?? "",
      formato: r.formato ?? "",
      alimentacao: r.alimentacao ?? "",
      tensao: r.tensao_contexto ?? "",
      localInstalacao: r.local_instalacao ?? "",
      dan: r.dan ?? "",
      chave: yesNo(typeof r.chave === "string" ? Number(r.chave) : r.chave),
      redePrimaria: yesNo(typeof r.rede_primaria === "string" ? Number(r.rede_primaria) : r.rede_primaria),
      redeSecundaria: yesNo(typeof r.rede_secundaria === "string" ? Number(r.rede_secundaria) : r.rede_secundaria),
      religador: yesNo(typeof r.religador === "string" ? Number(r.religador) : r.religador),
      transformador: yesNo(typeof r.transformador === "string" ? Number(r.transformador) : r.transformador),
      instalarTp: yesNo(typeof r.instalar_tp === "string" ? Number(r.instalar_tp) : r.instalar_tp),
    },
    empresa: r.empresa,
    instalador: r.instalador_id
      ? { id: r.instalador_id, nome: nomeOuLogin(r.instalador_nome_completo, r.instalador_login) ?? "" }
      : null,
    dataInstalacao: r.data_instalacao,
    checklist: {
      cintaInstalada: yesNo(r.checklist_cintaInstalada),
      equipamentoFixado: yesNo(r.checklist_equipamentoFixado),
      cabeamentoOrganizado: yesNo(r.checklist_cabeamentoOrganizado),
      alimentacaoValidada: yesNo(r.checklist_alimentacaoValidada),
      equipamentoEnergizado: yesNo(r.checklist_equipamentoEnergizado),
      registroFotografico: yesNo(r.checklist_registroFotografico),
      tensaoIdentificadaId: r.tensao_identificada_id,
      tensaoIdentificada: r.tensao_identificada,
    },
    validadorCpfl: r.validador_cpfl_user_id
      ? {
          id: r.validador_cpfl_user_id,
          nome: nomeOuLogin(r.validador_cpfl_nome_completo, r.validador_cpfl_login) ?? "",
          statusId: r.validador_cpfl_status_id,
          status: r.validador_cpfl_status,
        }
      : null,
  };
}

export type Instalacao = ReturnType<typeof mapRow>;

export interface ListInstalacoesFilters {
  /** Quando informado, inclui também as EM_INSTALACAO travadas por esse instalador. */
  instaladorId?: number;
}

/**
 * Lista postes liberados pra instalação (states_id = LIBERADO) mais os que
 * o instalador atual já assumiu (EM_INSTALACAO, travado pra ele). Nunca
 * mostra o que está pendente de vistoria nem já instalado.
 */
export async function listInstalacoes(filters: ListInstalacoesFilters = {}) {
  const params: unknown[] = [STATE_LIBERADO_INSTALACAO, STATE_EM_INSTALACAO];
  let where = `AND ne.states_id IN (?, ?)`;
  if (filters.instaladorId != null) {
    where += ` AND (ne.states_id = ? OR f.${INSTALACAO_INSTALADOR_COLUMN} = ?)`;
    params.push(STATE_LIBERADO_INSTALACAO, filters.instaladorId);
  }
  const rows = await query<RawRow>(
    `${SELECT_BASE} ${HAS_COORDS} ${where} ORDER BY ne.name LIMIT 500`,
    params
  );
  return rows.map(mapRow);
}

export async function getInstalacao(id: number) {
  const rows = await query<RawRow>(`${SELECT_BASE} AND ne.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

/** IDs de status geral (states_id) que representam algo pendente de instalar. */
export const STATUS_GERAL = {
  emProcessoVistoria: STATE_EM_PROCESSO_VISTORIA,
  aguardandoVistoria: STATE_AGUARDANDO_VISTORIA,
  liberado: STATE_LIBERADO_INSTALACAO,
  emInstalacao: STATE_EM_INSTALACAO,
  instalado: STATE_INSTALADO,
} as const;

/**
 * "Assume" o poste: só avança se ainda estiver LIBERADO (evita corrida entre
 * dois instaladores pegando o mesmo poste — condição no WHERE, não checagem
 * separada). Retorna true se travou com sucesso.
 */
export async function assumirInstalacao(
  networkEquipmentId: number,
  instaladorId: number
): Promise<boolean> {
  const result = await execute(
    `UPDATE \`${TABLE_FIELDS}\` f
       INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id
        SET f.${INSTALACAO_INSTALADOR_COLUMN} = ?,
            ne.states_id = ?
      WHERE f.items_id = ?
        AND ne.states_id = ?`,
    [instaladorId, STATE_EM_INSTALACAO, networkEquipmentId, STATE_LIBERADO_INSTALACAO]
  );
  return result.affectedRows > 0;
}

export interface FinalizarInstalacaoInput {
  checklist: Partial<Record<InstalacaoChecklistKey, boolean>>;
  tensaoIdentificadaId: number;
}

/** Grava o checklist, marca INSTALADO e preenche a data de instalação (hoje). */
export async function finalizarInstalacao(
  networkEquipmentId: number,
  input: FinalizarInstalacaoInput
): Promise<number> {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(input.checklist)) {
    if (value == null) continue;
    const column = INSTALACAO_CHECKLIST_COLUMNS[key as InstalacaoChecklistKey];
    if (!column) continue;
    sets.push(`f.\`${column}\` = ?`);
    params.push(value ? 1 : 0);
  }
  sets.push(`f.${INSTALACAO_TENSAO_COLUMN} = ?`);
  params.push(input.tensaoIdentificadaId);
  sets.push(`f.datadeinstalaofield = NOW()`);

  params.push(networkEquipmentId, STATE_EM_INSTALACAO);
  const sql = `
    UPDATE \`${TABLE_FIELDS}\` f
    INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id
       SET ${sets.join(", ")}, ne.states_id = ${STATE_INSTALADO}
     WHERE f.items_id = ? AND ne.states_id = ?
  `;
  const result = await execute(sql, params);
  return result.affectedRows;
}

/** Quantos postes o instalador já instalou (INSTALADO), nos últimos 30 dias. */
export async function countInstaladasPorMim(instaladorId: number): Promise<number> {
  const rows = await query<{ cpt: number }>(
    `SELECT COUNT(*) AS cpt
       FROM \`${TABLE_FIELDS}\` f
       INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id
      WHERE ne.is_deleted = 0
        AND ne.states_id = ?
        AND f.${INSTALACAO_INSTALADOR_COLUMN} = ?
        AND f.datadeinstalaofield >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [STATE_INSTALADO, instaladorId]
  );
  return Number(rows[0]?.cpt ?? 0);
}
