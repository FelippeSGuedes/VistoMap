import "server-only";
import { execute, query } from "@/lib/db";
import {
  DROPDOWN_COLUMNS,
  TABLE_FIELDS,
  TABLE_NE,
  type DropdownKey,
} from "./constants";

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
    f.plugin_fields_pendnciafielddropdowns_id AS pendencia_id,
    f.datadavistoriafield AS data_vistoria
  FROM \`${TABLE_NE}\` ne
  INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
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
  pendencia_id: number | null;
  data_vistoria: string | null;
}

function mapRow(r: RawRow) {
  return {
    id: String(r.id),
    glpiId: `NE-${r.id}`,
    equipamento: r.name,
    cidade: r.municipio ?? "",
    estado: null,
    endereco: r.endereco ?? null,
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
    status: "PENDENTE" as const,
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
    },
    dropdownIds: {
      statusVistoria: r.status_vistoria_id,
      pendencia: r.pendencia_id,
    },
    dataVistoria: r.data_vistoria,
    categoria: "Rede",
    online: r.status_vistoria_id == null,
  };
}

export async function listVistorias() {
  const rows = await query<RawRow>(
    `${SELECT_BASE} ${HAS_COORDS} ORDER BY ne.name LIMIT 500`
  );
  return rows.map(mapRow);
}

export async function getVistoria(id: number) {
  const rows = await query<RawRow>(`${SELECT_BASE} AND ne.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export interface UpdateFieldsInput {
  pspostefield?: string;
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
  plugin_fields_statusvistoriafielddropdowns_id?: number;
  plugin_fields_pendnciafielddropdowns_id?: number;
  dropdowns?: Partial<Record<DropdownKey, number | null>>;
}

const UPDATABLE_COLUMNS = new Set([
  "pspostefield",
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
  "plugin_fields_statusvistoriafielddropdowns_id",
  "plugin_fields_pendnciafielddropdowns_id",
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
