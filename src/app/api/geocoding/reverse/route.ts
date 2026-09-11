import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxy de reverse geocoding via Mapbox Geocoding API.
 *
 * Trocado do Nominatim (OSM) em 2026-09-11: Nominatim limita a 1 req/s e
 * proíbe uso em massa nos termos de uso — inviável pra rodar automático em
 * toda vistoria (desde a mudança de "Detectar via GPS" manual pra busca
 * automática pela Lat/Lng do poste) e pra migração retroativa dos pontos
 * já vistoriados. Mapbox reaproveita o MESMO token público já usado pro
 * mapa (NEXT_PUBLIC_MAPBOX_TOKEN, já usado server-side em roteirizacao.ts
 * pra Directions), com limite de requisição bem mais alto.
 *
 * Mantém a MESMA forma de resposta do Nominatim (EnderecoReverseResponse)
 * de propósito — services/geocoding.ts e quem consome não precisam mudar.
 */

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

interface MapboxContextItem {
  id: string;
  text: string;
  short_code?: string;
}

interface MapboxFeature {
  place_name?: string;
  text?: string;
  address?: string;
  context?: MapboxContextItem[];
}

interface MapboxResponse {
  features?: MapboxFeature[];
}

export interface EnderecoReverseResponse {
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  estado_sigla: string;
  cep: string;
  pais: string;
  display_name: string;
}

function contextValue(context: MapboxContextItem[] | undefined, prefix: string): MapboxContextItem | undefined {
  return context?.find((c) => c.id.startsWith(prefix));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng") ?? searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { message: "Parâmetros lat/lng obrigatórios e numéricos" },
      { status: 400 }
    );
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      { message: "lat/lng fora de range" },
      { status: 400 }
    );
  }
  if (!TOKEN) {
    return NextResponse.json(
      { message: "NEXT_PUBLIC_MAPBOX_TOKEN não configurado" },
      { status: 500 }
    );
  }

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
    `?access_token=${TOKEN}&language=pt-BR&types=address`;

  try {
    const resp = await fetch(url, { next: { revalidate: 30 } });

    if (!resp.ok) {
      return NextResponse.json(
        { message: `Mapbox Geocoding respondeu ${resp.status}` },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as MapboxResponse;
    const feature = data.features?.[0];
    const context = feature?.context;

    const bairro = contextValue(context, "neighborhood");
    const cidade = contextValue(context, "place");
    const estado = contextValue(context, "region");
    const cep = contextValue(context, "postcode");
    const pais = contextValue(context, "country");

    const result: EnderecoReverseResponse = {
      rua: feature?.text ?? "",
      numero: feature?.address ?? "",
      bairro: bairro?.text ?? "",
      cidade: cidade?.text ?? "",
      estado: estado?.text ?? "",
      estado_sigla: estado?.short_code?.replace(/^BR-/, "") ?? "",
      cep: cep?.text ?? "",
      pais: pais?.text ?? "",
      display_name: feature?.place_name ?? "",
    };
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        message: "Falha ao consultar Mapbox Geocoding",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
