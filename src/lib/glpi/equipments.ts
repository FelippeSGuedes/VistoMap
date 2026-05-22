import "server-only";
import { execute, query } from "@/lib/db";
import {
  DROPDOWN_COLUMNS,
  DROPDOWN_TABLES,
  ITEMTYPE_NE,
  STATE_NAME_TO_STATUS,
  TABLE_AUX,
  TABLE_FIELDS,
  TABLE_NE,
  TABLE_STATUS_VISTORIA,
  type DropdownKey,
} from "./constants";
import type { VistoriaStatus } from "@/types";

const SELECT_BASE = `
  SELECT
    ne.id AS id,
    ne.name AS name,
    f.municipiofield AS municipio,
    f.pspostefield AS ps_poste,
    REPLACE(f.latitudefield, ',', '.') + 0.0 AS latitude,
    REPLACE(f.longitudefield, ',', '.') + 0.0 AS longitude,
    f.alturadaantenafield AS altura_antena,
    f.endereofield AS endereco,
    f.observaofield AS observacao,
    f.aterramentofield AS aterramento,
    f.intensidadedesinalfield AS intensidade_sinal,
    f.velocidadefield AS velocidade,
    f.motivofield AS motivo,
    f.plugin_fields_statusvistoriafielddropdowns_id AS status_vistoria_id,
    sv.name AS status_vistoria_name,
    f.plugin_fields_pendnciafielddropdowns_id AS pendencia_id,
    f.datadavistoriafield AS data_vistoria,
    d_ta.name AS tipodeantena,
    d_gd.name AS ganhodbi,
    d_mo.name AS mododeoperacao,
    d_op.name AS operadorafourg,
    d_tm.name AS tipodematerial,
    d_tn.name AS tensao,
    d_al.name AS alimentacaodoequipamento,
    d_li.name AS localdeinstalacao,
    COALESCE(aux.is_repeat, 0) AS is_repeat,
    aux.project_status AS aux_project_status
  FROM \`${TABLE_NE}\` ne
  INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
  LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
  LEFT JOIN \`${DROPDOWN_TABLES.tipodeantena}\` d_ta ON d_ta.id = f.${DROPDOWN_COLUMNS.tipodeantena}
  LEFT JOIN \`${DROPDOWN_TABLES.ganhodbi}\` d_gd ON d_gd.id = f.${DROPDOWN_COLUMNS.ganhodbi}
  LEFT JOIN \`${DROPDOWN_TABLES.mododeoperacao}\` d_mo ON d_mo.id = f.${DROPDOWN_COLUMNS.mododeoperacao}
  LEFT JOIN \`${DROPDOWN_TABLES.operadorafourg}\` d_op ON d_op.id = f.${DROPDOWN_COLUMNS.operadorafourg}
  LEFT JOIN \`${DROPDOWN_TABLES.tipodematerial}\` d_tm ON d_tm.id = f.${DROPDOWN_COLUMNS.tipodematerial}
  LEFT JOIN \`${DROPDOWN_TABLES.tensao}\` d_tn ON d_tn.id = f.${DROPDOWN_COLUMNS.tensao}
  LEFT JOIN \`${DROPDOWN_TABLES.alimentacaodoequipamento}\` d_al ON d_al.id = f.${DROPDOWN_COLUMNS.alimentacaodoequipamento}
  LEFT JOIN \`${DROPDOWN_TABLES.localdeinstalacao}\` d_li ON d_li.id = f.${DROPDOWN_COLUMNS.localdeinstalacao}
  LEFT JOIN \`${TABLE_AUX}\` aux ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
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
  municipio: string | null;
  ps_poste: string | null;
  latitude: number | null;
  longitude: number | null;
  altura_antena: string | null;
  endereco: string | null;
  observacao: string | null;
  aterramento: string | null;
  intensidade_sinal: string | null;
  velocidade: string | null;
  motivo: string | null;
  status_vistoria_id: number | null;
  status_vistoria_name: string | null;
  pendencia_id: number | null;
  data_vistoria: string | null;
  tipodeantena: string | null;
  ganhodbi: string | null;
  mododeoperacao: string | null;
  operadorafourg: string | null;
  tipodematerial: string | null;
  tensao: string | null;
  alimentacaodoequipamento: string | null;
  localdeinstalacao: string | null;
  is_repeat: number | string | null;
  aux_project_status: string | null;
}

function resolveStatus(name: string | null): VistoriaStatus {
  if (!name) return "PENDENTE";
  const mapped = STATE_NAME_TO_STATUS[name] ?? STATE_NAME_TO_STATUS[name.trim()];
  return (mapped as VistoriaStatus | undefined) ?? "PENDENTE";
}

function mapRow(r: RawRow) {
  const isRepeat = Number(r.is_repeat ?? 0) === 1;
  return {
    id: String(r.id),
    glpiId: `NE-${r.id}`,
    equipamento: r.name,
    cidade: r.municipio ?? "",
    estado: null,
    endereco: r.endereco ?? null,
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
    status: resolveStatus(r.status_vistoria_name),
    isRepeat,
    prioridade: "MEDIA" as const,
    tecnico: { id: "0", nome: "—", email: "" },
    fields: {
      pspostefield: r.ps_poste ?? "",
      alturadaantenafield: r.altura_antena ?? "",
      endereofield: r.endereco ?? "",
      observaofield: r.observacao ?? "",
      aterramentofield: r.aterramento ?? "",
      intensidadedesinalfield: r.intensidade_sinal ?? "",
      velocidadefield: r.velocidade ?? "",
      motivofield: r.motivo ?? "",
      tipodeantena: r.tipodeantena ?? "",
      ganhodbi: r.ganhodbi ?? "",
      mododeoperacao: r.mododeoperacao ?? "",
      operadorafourg: r.operadorafourg ?? "",
      tipodematerial: r.tipodematerial ?? "",
      tensao: r.tensao ?? "",
      alimentacaodoequipamento: r.alimentacaodoequipamento ?? "",
      localdeinstalacao: r.localdeinstalacao ?? "",
    },
    dropdownIds: {
      statusVistoria: r.status_vistoria_id,
      pendencia: r.pendencia_id,
    },
    dataVistoria: r.data_vistoria,
    categoria: "Rede",
    online: r.status_vistoria_id == null,
    auxProjectStatus: r.aux_project_status,
  };
}

export interface ListVistoriasFilters {
  /** Filtra por técnico atribuído (users_id_vistoriadorafield). Admin omite. */
  tecnicoId?: number;
}

export async function listVistorias(filters: ListVistoriasFilters = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.tecnicoId != null) {
    where.push("f.users_id_vistoriadorafield = ?");
    params.push(filters.tecnicoId);
  }
  const extraWhere = where.length ? `AND ${where.join(" AND ")}` : "";
  const rows = await query<RawRow>(
    `${SELECT_BASE} ${HAS_COORDS} ${extraWhere} ORDER BY ne.name LIMIT 500`,
    params
  );
  return rows.map(mapRow);
}

export async function getVistoria(id: number) {
  const rows = await query<RawRow>(`${SELECT_BASE} AND ne.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export interface UpdateFieldsInput {
  pspostefield?: string;
  municipiofield?: string;
  latitudefield?: number | string;
  longitudefield?: number | string;
  alturadaantenafield?: string;
  endereofield?: string;
  observaofield?: string;
  aterramentofield?: string;
  intensidadedesinalfield?: string;
  velocidadefield?: string;
  motivofield?: string;
  datadavistoriafield?: string;
  dataenvioconcessionriafield?: string;
  dataaprovaoconcessionriafield?: string;
  plugin_fields_statusvistoriafielddropdowns_id?: number;
  plugin_fields_pendnciafielddropdowns_id?: number;
  plugin_fields_situaodavistoriafielddropdowns_id?: number;
  dropdowns?: Partial<Record<DropdownKey, number | null>>;
}

const UPDATABLE_COLUMNS = new Set([
  "pspostefield",
  "municipiofield",
  "latitudefield",
  "longitudefield",
  "alturadaantenafield",
  "endereofield",
  "observaofield",
  "aterramentofield",
  "intensidadedesinalfield",
  "velocidadefield",
  "motivofield",
  "datadavistoriafield",
  "dataenvioconcessionriafield",
  "dataaprovaoconcessionriafield",
  "plugin_fields_statusvistoriafielddropdowns_id",
  "plugin_fields_pendnciafielddropdowns_id",
  "plugin_fields_situaodavistoriafielddropdowns_id",
]);

export async function updateVistoriaFields(
  networkEquipmentId: number,
  input: UpdateFieldsInput
): Promise<number> {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(input)) {
    if (key === "dropdowns" || value == null) continue;
    if (!UPDATABLE_COLUMNS.has(key)) continue;
    sets.push(`\`${key}\` = ?`);
    params.push(value);
  }

  if (input.dropdowns) {
    for (const [dkey, dvalue] of Object.entries(input.dropdowns)) {
      if (dvalue == null) continue;
      const column = DROPDOWN_COLUMNS[dkey as DropdownKey];
      if (!column) continue;
      sets.push(`\`${column}\` = ?`);
      params.push(dvalue);
    }
  }

  if (sets.length === 0) return 0;

  params.push(networkEquipmentId);
  const sql = `UPDATE \`${TABLE_FIELDS}\` SET ${sets.join(", ")} WHERE items_id = ?`;
  const result = await execute(sql, params);
  return result.affectedRows;
}
