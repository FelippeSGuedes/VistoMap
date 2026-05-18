import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxy de reverse geocoding via OSM Nominatim.
 *
 * Por que server-side?
 *   - Nominatim exige User-Agent identificando a aplicação.
 *   - Navegadores não deixam o frontend setar User-Agent custom.
 *   - Aqui injetamos `User-Agent: VistoMap/1.0 (contato@vistomap.io)` corretamente.
 *
 * Rate limit: 1 req/s por IP (Nominatim policy).
 * Em produção pesada, considerar:
 *   - cache de respostas (LRU)
 *   - rodar instância própria do Nominatim
 *   - usar Mapbox Geocoding API (tem token + sem rate limit free baixo)
 */

const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ??
  "VistoMap/1.0 (https://github.com/seu-org/vistomap)";

interface NominatimResponse {
  display_name?: string;
  address?: {
    road?: string;
    pedestrian?: string;
    house_number?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    "ISO3166-2-lvl4"?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
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

function pickEstadoSigla(addr?: NominatimResponse["address"]): string {
  if (!addr) return "";
  const lvl = addr["ISO3166-2-lvl4"];
  if (lvl && lvl.startsWith("BR-")) return lvl.slice(3);
  return "";
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

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "json");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");
  url.searchParams.set("accept-language", "pt-BR");

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "pt-BR",
      },
      // Pequeno cache de borda no Next — Nominatim tem rate limit de 1 req/s.
      next: { revalidate: 30 },
    });

    if (!resp.ok) {
      return NextResponse.json(
        { message: `Nominatim respondeu ${resp.status}` },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as NominatimResponse;
    const addr = data.address ?? {};
    const result: EnderecoReverseResponse = {
      rua: addr.road ?? addr.pedestrian ?? "",
      numero: addr.house_number ?? "",
      bairro: addr.neighbourhood ?? addr.suburb ?? "",
      cidade: addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? "",
      estado: addr.state ?? "",
      estado_sigla: pickEstadoSigla(addr),
      cep: addr.postcode ?? "",
      pais: addr.country ?? "",
      display_name: data.display_name ?? "",
    };
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        message: "Falha ao consultar Nominatim",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
