import { api } from "./api";

export interface EnderecoReverso {
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

/**
 * Resolve um par lat/lng em endereço estruturado via OSM Nominatim
 * (proxy server-side em /api/geocoding/reverse).
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<EnderecoReverso> {
  const { data } = await api.get<EnderecoReverso>("/geocoding/reverse", {
    params: { lat, lng },
    timeout: 12_000,
  });
  return data;
}
