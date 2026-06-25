import axios, { type AxiosInstance } from "axios";
import { getAuthToken } from "./api";
import type {
  MotivoMudanca,
  MudancaPosteResponse,
  Poste,
  PostesProximosResponse,
} from "@/types";

/**
 * Cliente do backend Fastify (/postes/*).
 *
 * Default: mesma origem (proxy reverso roteia /postes → :3001).
 * Override via env NEXT_PUBLIC_POSTES_URL (ex.: http://localhost:3001).
 */

const baseURL =
  process.env.NEXT_PUBLIC_POSTES_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "";

const postesApi: AxiosInstance = axios.create({
  baseURL: baseURL ? `${baseURL}` : "",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// Reaproveita o mesmo token (JWT) do login do Next.
postesApi.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * GET /postes/proximos
 */
export async function fetchPostesProximos(params: {
  lat: number;
  lng: number;
  raio?: number;
  limit?: number;
  municipio?: string;
}): Promise<PostesProximosResponse> {
  const { data } = await postesApi.get<PostesProximosResponse>(
    "/postes/proximos",
    {
      params: {
        lat: params.lat,
        lng: params.lng,
        raio: params.raio ?? 500,
        limit: params.limit ?? 30,
        municipio: params.municipio,
      },
    }
  );
  return data;
}

/**
 * GET /postes/bbox → GeoJSON FeatureCollection (Mapbox-ready).
 */
export interface PostesBboxGeoJSON {
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
}

export async function fetchPostesBbox(params: {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  limit?: number;
}): Promise<PostesBboxGeoJSON> {
  const { data } = await postesApi.get<PostesBboxGeoJSON>("/postes/bbox", {
    params: {
      minLng: params.minLng,
      minLat: params.minLat,
      maxLng: params.maxLng,
      maxLat: params.maxLat,
      limit: params.limit ?? 500,
    },
  });
  return data;
}

export async function fetchPosteById(id: number): Promise<Poste> {
  const { data } = await postesApi.get<Poste>(`/postes/${id}`);
  return data;
}

export interface RegistrarMudancaInput {
  vistoria_id: string;
  lat_antiga: number;
  lng_antiga: number;
  psposte_antigo?: string | null;
  municipio_antigo?: string | null;
  poste_id_antigo?: number | null;
  poste_id_novo: number;
  motivo: MotivoMudanca;
  observacao?: string | null;
}

export async function registrarMudancaPoste(
  input: RegistrarMudancaInput
): Promise<MudancaPosteResponse> {
  const { data } = await postesApi.post<MudancaPosteResponse>(
    "/postes/mudancas",
    input
  );
  return data;
}

/* ─── helpers para Mapbox ─────────────────────────────────────────────────── */

export function postesToGeoJSON(postes: Poste[]): PostesBboxGeoJSON {
  return {
    type: "FeatureCollection",
    features: postes.map((p) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [p.longitudefield, p.latitudefield],
      },
      properties: {
        id: p.id,
        psposte: p.pspostefield,
        municipio: p.municipiofield,
        material: p.materialfield,
        altura: p.alturadopostemfield,
      },
    })),
  };
}
