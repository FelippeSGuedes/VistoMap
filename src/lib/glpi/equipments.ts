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
    f.alturadopostemfield AS altura_poste,
    f.endereofield AS endereco,
    f.observaofield AS observacao,
    f.aterramentofield AS aterramento,
    f.plugin_fields_statusvistoriafielddropdowns_id AS status_vistoria_id,
    sv.name AS status_vistoria_name,
    f.plugin_fields_pendnciafielddropdowns_id AS pendencia_id,
    f.datadavistoriafield AS data_vistoria,
    f.materialfield AS tipodematerial,
    f.instalartpfield AS instalartpfield,
    f.danfield AS danfield,
    f.rsrpifield AS rsrpifield,
    f.rsrpllfield AS rsrpllfield,
    d_eq.name AS equipamento,
    d_ti.name AS tipoifield,
    d_tl.name AS tipollfield,
    d_tv.name AS tensovfield,
    COALESCE(aux.is_repeat, 0) AS is_repeat,
    aux.project_status AS aux_project_status
  FROM \`${TABLE_NE}\` ne
  INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
  LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
  LEFT JOIN \`${DROPDOWN_TABLES.equipamento}\` d_eq ON d_eq.id = f.${DROPDOWN_COLUMNS.equipamento}
  LEFT JOIN \`${DROPDOWN_TABLES.tipoifield}\` d_ti ON d_ti.id = f.${DROPDOWN_COLUMNS.tipoifield}
  LEFT JOIN \`${DROPDOWN_TABLES.tipollfield}\` d_tl ON d_tl.id = f.${DROPDOWN_COLUMNS.tipollfield}
  LEFT JOIN \`${DROPDOWN_TABLES.tensovfield}\` d_tv ON d_tv.id = f.${DROPDOWN_COLUMNS.tensovfield}
  LEFT JOIN (
    SELECT p.items_id, p.is_repeat, p.project_status
    FROM \`${TABLE_AUX}\` p
    INNER JOIN (
      SELECT items_id, MAX(id) AS max_id
      FROM \`${TABLE_AUX}\`
      WHERE itemtype = '${ITEMTYPE_NE}'
      GROUP BY items_id
    ) latest ON p.id = latest.max_id
  ) aux ON aux.items_id = ne.id
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
  altura_poste: string | null;
  endereco: string | null;
  observacao: string | null;
  aterramento: string | null;
  status_vistoria_id: number | null;
  status_vistoria_name: string | null;
  pendencia_id: number | null;
  data_vistoria: string | null;
  tipodematerial: string | null;
  instalartpfield: number | string | null;
  danfield: string | null;
  rsrpifield: string | null;
  rsrpllfield: string | null;
  equipamento: string | null;
  tipoifield: string | null;
  tipollfield: string | null;
  tensovfield: string | null;
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
      alturadopostemfield: r.altura_poste ?? "",
      endereofield: r.endereco ?? "",
      observaofield: r.observacao ?? "",
      aterramentofield: r.aterramento ?? "",
      instalartpfield: r.instalartpfield != null ? String(r.instalartpfield) : "",
      danfield: r.danfield ?? "",
      rsrpifield: r.rsrpifield ?? "",
      rsrpllfield: r.rsrpllfield ?? "",
      tipoifield: r.tipoifield ?? "",
      tipollfield: r.tipollfield ?? "",
      tensovfield: r.tensovfield ?? "",
      tipodematerial: r.tipodematerial ?? "",
      equipamentofield: r.equipamento ?? "",
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
  /**
   * Quando true, retorna as vistorias CONCLUÍDAS/finalizadas do técnico
   * (situação Vistoriado/Revisitado OU status Aprovado/Reprovado/Em análise),
   * limitadas aos últimos 60 dias. Default (false) = fila pendente.
   */
  concluidas?: boolean;
}

export async function listVistorias(filters: ListVistoriasFilters = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  // Quando filtramos por técnico, NÃO aplicamos HAS_COORDS: o técnico precisa
  // ver TODAS as vistorias atribuídas a ele, mesmo sem coordenada cadastrada.
  // O mapa (MapView.tsx) já filtra client-side via hasValidCoords — a lista não.
  const coordsFilter = filters.tecnicoId != null ? "" : HAS_COORDS;
  if (filters.tecnicoId != null) {
    where.push("f.users_id_vistoriadorafield = ?");
    params.push(filters.tecnicoId);

    if (filters.concluidas) {
      // Concluídas/finalizadas recentes (últimos 60 dias) — histórico do técnico.
      where.push(`(
        COALESCE(f.plugin_fields_situaodavistoriafielddropdowns_id, 0) IN (3, 6)
        OR COALESCE(f.plugin_fields_statusvistoriafielddropdowns_id, 0) IN (3, 4, 5)
      )`);
      where.push(
        `f.datadavistoriafield IS NOT NULL AND f.datadavistoriafield >= DATE_SUB(NOW(), INTERVAL 60 DAY)`
      );
    } else {
      // Regra operacional: técnico NÃO deve ver vistorias concluídas/aprovadas.
      // Situação: bloqueia Vistoriado(3) e Revisitado(6).
      // Status: bloqueia Aprovado(3), Reprovado(4), Em análise(5).
      // Usa blacklist de IDs em vez de whitelist de nomes para não quebrar
      // quando o GLPI cadastra novos status (ex: 'AGUARDANDO VISTORIA' id=6).
      where.push(`(
        COALESCE(f.plugin_fields_situaodavistoriafielddropdowns_id, 0) NOT IN (3, 6)
        AND COALESCE(f.plugin_fields_statusvistoriafielddropdowns_id, 0) NOT IN (3, 4, 5)
      )`);
    }
  }
  const extraWhere = where.length ? `AND ${where.join(" AND ")}` : "";
  const rows = await query<RawRow>(
    `${SELECT_BASE} ${coordsFilter} ${extraWhere} ORDER BY ne.name LIMIT 500`,
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
  alturadopostemfield?: string;
  materialfield?: string;
  instalartpfield?: string;
  danfield?: string;
  rsrpifield?: string;
  rsrpllfield?: string;
  endereofield?: string;
  observaofield?: string;
  aterramentofield?: string;
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
  "alturadopostemfield",
  "materialfield",
  "instalartpfield",
  "danfield",
  "rsrpifield",
  "rsrpllfield",
  "endereofield",
  "observaofield",
  "aterramentofield",
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
