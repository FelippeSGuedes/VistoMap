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

async function registrarMudancaPosteOnline(
  input: RegistrarMudancaInput
): Promise<MudancaPosteResponse> {
  const { data } = await postesApi.post<MudancaPosteResponse>(
    "/postes/mudancas",
    input
  );
  return data;
}

/**
 * Registra a mudança de poste — offline-first, mesmo padrão de
 * iniciar/finalizar vistoria: sem rede (ou falha de rede/timeout), enfileira
 * localmente e devolve uma resposta "provisória" montada com os dados do
 * poste já selecionado (o técnico já tem tudo isso na tela — não precisa
 * do servidor pra continuar o formulário). Sincroniza quando a rede voltar.
 *
 * Erros de REGRA (4xx que não seja rede) sobem pro caller tratar.
 */
export async function registrarMudancaPoste(
  input: RegistrarMudancaInput,
  posteNovo: Poste
): Promise<MudancaPosteResponse & { queued?: true }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return queueMudancaPoste(input, posteNovo);
  }
  try {
    return await registrarMudancaPosteOnline(input);
  } catch (err) {
    const e = err as { code?: string; message?: string; response?: { status?: number } };
    const status = e.response?.status;
    const isNetwork =
      e.code === "ERR_NETWORK" ||
      e.code === "ECONNABORTED" ||
      /network|timeout|offline/i.test(e.message ?? "");
    const is5xx = status != null && status >= 500;
    if ((!e.response && isNetwork) || is5xx) {
      return queueMudancaPoste(input, posteNovo);
    }
    throw err;
  }
}

async function queueMudancaPoste(
  input: RegistrarMudancaInput,
  posteNovo: Poste
): Promise<MudancaPosteResponse & { queued: true }> {
  const { enqueue } = await import("@/lib/offlineQueue");
  const { notifyQueueChanged } = await import("@/hooks/useNetworkStatus");
  const token = getAuthToken() ?? "";

  await enqueue({
    type: "mudar-poste",
    vistoriaId: input.vistoria_id,
    payload: { ...input, token } as Record<string, unknown>,
  });
  notifyQueueChanged();
  void import("@/lib/syncRunner").then((m) => m.runDrain()).catch(() => {});

  const descricao =
    `Mudança de poste (sincronizada depois — sem conexão no momento): ` +
    `${input.psposte_antigo ?? "?"} → ${posteNovo.pspostefield} ` +
    `(${input.municipio_antigo ?? "?"} → ${posteNovo.municipiofield}). Motivo: ${input.motivo}` +
    (input.observacao ? ` — ${input.observacao}` : "");

  return {
    ok: true,
    mudanca_id: -1,
    distancia_m: 0,
    raio_max_m: 0,
    poste_novo: posteNovo,
    descricao_glpi: descricao,
    payload_glpi: {
      vistoria_id: input.vistoria_id,
      pspostefield: posteNovo.pspostefield,
      municipiofield: posteNovo.municipiofield,
      materialfield: posteNovo.materialfield,
      alturadopostemfield: posteNovo.alturadopostemfield,
      latitudefield: posteNovo.latitudefield,
      longitudefield: posteNovo.longitudefield,
      observaofield_append: descricao,
    },
    queued: true,
  };
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
