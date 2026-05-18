import { db } from "./db.js";
import type {
  MotivoMudanca,
  PosteRow,
  PosteWithDistance,
} from "../models/poste.js";

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helpers de cast — Knex/pg entrega numeric como string. Convertemos na borda. */
/* ─────────────────────────────────────────────────────────────────────────── */

function castRow(r: Record<string, unknown>): PosteRow {
  return {
    id: Number(r.id),
    pspostefield: String(r.pspostefield),
    materialfield: (r.materialfield as string | null) ?? null,
    alturadaantenafield: (r.alturadaantenafield as string | null) ?? null,
    municipiofield: String(r.municipiofield),
    municipiofield_norm: String(r.municipiofield_norm),
    latitudefield: Number(r.latitudefield),
    longitudefield: Number(r.longitudefield),
    raw: (r.raw as Record<string, unknown> | null) ?? null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Queries                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

export interface ProximosParams {
  lat: number;
  lng: number;
  raio: number; // metros
  limit: number;
  municipio?: string; // opcional: filtra município normalizado
}

/**
 * Postes dentro de `raio` metros, ordenados por distância (asc).
 * Usa `postes_geog_gist` (índice funcional sobre `(geom::geography)`).
 */
export async function buscarProximos(
  p: ProximosParams
): Promise<PosteWithDistance[]> {
  const rows = await db.raw<{
    rows: Array<Record<string, unknown>>;
  }>(
    `
      SELECT
        id,
        pspostefield,
        materialfield,
        alturadaantenafield,
        municipiofield,
        municipiofield_norm,
        latitudefield,
        longitudefield,
        raw,
        created_at,
        updated_at,
        ST_Distance(geom::geography, ST_MakePoint(?, ?)::geography) AS distancia_m
      FROM postes
      WHERE ST_DWithin(geom::geography, ST_MakePoint(?, ?)::geography, ?)
        ${p.municipio ? `AND municipiofield_norm = upper(public.f_unaccent_immutable(?))` : ""}
      ORDER BY distancia_m
      LIMIT ?
    `,
    p.municipio
      ? [p.lng, p.lat, p.lng, p.lat, p.raio, p.municipio, p.limit]
      : [p.lng, p.lat, p.lng, p.lat, p.raio, p.limit]
  );
  return rows.rows.map((r) => ({
    ...castRow(r),
    distancia_m: Number(r.distancia_m),
  }));
}

export interface BboxParams {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  limit: number;
}

/**
 * Postes dentro de um bounding-box. Retorna GeoJSON FeatureCollection pronto
 * para Mapbox `addSource({type:'geojson', data})`. Montado server-side (1 RTT).
 *
 * Usa `postes_geom_gist` (índice GIST direto sobre geometry).
 */
export async function buscarBboxGeoJSON(p: BboxParams): Promise<{
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: {
      id: number;
      psposte: string;
      municipio: string;
      material: string | null;
      altura: string | null;
    };
  }>;
}> {
  const { rows } = await db.raw<{
    rows: Array<{ geojson: string }>;
  }>(
    `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(geom)::jsonb,
              'properties', jsonb_build_object(
                'id',        id,
                'psposte',   pspostefield,
                'municipio', municipiofield,
                'material',  materialfield,
                'altura',    alturadaantenafield
              )
            )
          ),
          '[]'::jsonb
        )
      ) AS geojson
      FROM (
        SELECT *
        FROM postes
        WHERE geom && ST_MakeEnvelope(?, ?, ?, ?, 4326)
        LIMIT ?
      ) p
    `,
    [p.minLng, p.minLat, p.maxLng, p.maxLat, p.limit]
  );
  return rows[0]?.geojson
    ? // Postgres retorna jsonb como objeto já parsed em pg driver.
      (rows[0]!.geojson as unknown as Awaited<ReturnType<typeof buscarBboxGeoJSON>>)
    : ({ type: "FeatureCollection", features: [] } as ReturnType<
        typeof Object
      > as Awaited<ReturnType<typeof buscarBboxGeoJSON>>);
}

/**
 * Detalhe por id.
 */
export async function buscarPorId(id: number): Promise<PosteRow | null> {
  const { rows } = await db.raw<{
    rows: Array<Record<string, unknown>>;
  }>(
    `
      SELECT
        id, pspostefield, materialfield, alturadaantenafield,
        municipiofield, municipiofield_norm,
        latitudefield, longitudefield, raw, created_at, updated_at
      FROM postes
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );
  return rows[0] ? castRow(rows[0]) : null;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Mudancas                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

export interface RegistrarMudancaInput {
  vistoria_id: string;
  psposte_antigo: string | null;
  municipio_antigo: string | null;
  poste_id_antigo?: number | null;
  poste_id_novo: number;
  usuario_id: string;
  usuario_email?: string | null;
  motivo: MotivoMudanca;
  observacao?: string | null;
  distancia_m: number;
  raio_max_m: number;
  payload_glpi: Record<string, unknown>;
}

export async function registrarMudanca(
  input: RegistrarMudancaInput
): Promise<number> {
  // Busca PSPOSTE/município novos diretamente no banco (não confiar no client).
  const { rows: novoRows } = await db.raw<{
    rows: Array<{ pspostefield: string; municipiofield: string }>;
  }>(
    `SELECT pspostefield, municipiofield FROM postes WHERE id = ? LIMIT 1`,
    [input.poste_id_novo]
  );
  const novo = novoRows[0];
  if (!novo) throw new Error("Poste novo não encontrado");

  const { rows } = await db.raw<{ rows: Array<{ id: number }> }>(
    `
      INSERT INTO mudancas_postes (
        vistoria_id, psposte_antigo, municipio_antigo,
        psposte_novo, municipio_novo,
        poste_id_antigo, poste_id_novo,
        usuario_id, usuario_email,
        motivo, observacao,
        distancia_m, raio_max_m, payload_glpi
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
      RETURNING id
    `,
    [
      input.vistoria_id,
      input.psposte_antigo,
      input.municipio_antigo,
      novo.pspostefield,
      novo.municipiofield,
      input.poste_id_antigo ?? null,
      input.poste_id_novo,
      input.usuario_id,
      input.usuario_email ?? null,
      input.motivo,
      input.observacao ?? null,
      input.distancia_m,
      input.raio_max_m,
      JSON.stringify(input.payload_glpi),
    ]
  );
  return Number(rows[0]?.id ?? 0);
}

/**
 * Distância (m) entre 2 pontos via PostGIS geography (precisão de geodésica).
 */
export async function distanciaGeografica(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number
): Promise<number> {
  const { rows } = await db.raw<{ rows: Array<{ m: string }> }>(
    `SELECT ST_Distance(ST_MakePoint(?, ?)::geography, ST_MakePoint(?, ?)::geography) AS m`,
    [lng1, lat1, lng2, lat2]
  );
  return Number(rows[0]?.m ?? 0);
}
