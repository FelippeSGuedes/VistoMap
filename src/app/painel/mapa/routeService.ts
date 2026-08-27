"use client";

/**
 * routeService — busca/cacheia rotas reais (Mapbox Directions API) por
 * técnico, e faz a matemática de progresso/rumo ao longo da rota via
 * Turf.js. Sem dependência de Three.js/Mapbox GL aqui — só fetch + geo.
 */

import along from "@turf/along";
import bearing from "@turf/bearing";
import length from "@turf/length";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import { lineString, point } from "@turf/helpers";
import { getMapboxToken } from "@/services/maps";

export interface LngLat {
  lng: number;
  lat: number;
}

export interface RouteResult {
  coordinates: [number, number][];
  distanceM: number;
  fetchedAt: number;
  destLng: number;
  destLat: number;
}

const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;
const ROUTE_MIN_REFETCH_MS = 15_000; // não martela a API a cada poll de 5s
const ROUTE_DEVIATION_M = 80; // desvio grande da rota cacheada força refetch
const SAME_DEST_TOLERANCE_M = 30;

const cache = new Map<number, RouteResult>();
const inflight = new Map<number, Promise<RouteResult | null>>();

export function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Última rota conhecida pro técnico, sem disparar fetch nenhum. */
export function peekRoute(usersId: number): RouteResult | null {
  return cache.get(usersId) ?? null;
}

/**
 * Devolve a rota atual pro técnico, buscando na Directions API só quando
 * necessário (destino mudou, desvio grande, ou cache expirado) — nunca a
 * cada poll de 5s. Chamadas concorrentes pro mesmo técnico reusam a
 * mesma promise em voo.
 */
export async function getRouteFor(usersId: number, from: LngLat, to: LngLat): Promise<RouteResult | null> {
  const cached = cache.get(usersId);
  const sameDest = !!cached && haversineM({ lng: cached.destLng, lat: cached.destLat }, to) < SAME_DEST_TOLERANCE_M;
  const fresh = !!cached && Date.now() - cached.fetchedAt < ROUTE_CACHE_TTL_MS;
  const tooSoon = !!cached && Date.now() - cached.fetchedAt < ROUTE_MIN_REFETCH_MS;
  const deviated = !!cached && sameDest && projectOntoRoute(cached, from).offRouteM > ROUTE_DEVIATION_M;

  if (cached && sameDest && fresh && !deviated) return cached;
  if (cached && sameDest && tooSoon && !deviated) return cached;

  const existingInflight = inflight.get(usersId);
  if (existingInflight) return existingInflight;

  const p = fetchDirections(from, to)
    .then((r) => {
      if (r) cache.set(usersId, r);
      return r;
    })
    .finally(() => inflight.delete(usersId));
  inflight.set(usersId, p);
  return p;
}

async function fetchDirections(from: LngLat, to: LngLat): Promise<RouteResult | null> {
  const token = getMapboxToken();
  if (!token) return null;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?geometries=geojson&overview=full&access_token=${token}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = await r.json();
    const route = json.routes?.[0];
    if (!route) return null;
    return {
      coordinates: route.geometry.coordinates,
      distanceM: route.distance,
      fetchedAt: Date.now(),
      destLng: to.lng,
      destLat: to.lat,
    };
  } catch {
    return null; // rede fora / bloqueado — chamador cai pro fallback (beacon idle)
  }
}

/** Projeta um ponto real (GPS) na rota — distância acumulada até ali + desvio da linha. */
export function projectOntoRoute(route: RouteResult, p: LngLat): { distAlongM: number; offRouteM: number } {
  const snapped = nearestPointOnLine(lineString(route.coordinates), point([p.lng, p.lat]), { units: "meters" });
  return {
    distAlongM: snapped.properties.location ?? 0,
    offRouteM: snapped.properties.dist ?? 0,
  };
}

/** Ponto (lng/lat) + rumo (radianos) numa distância percorrida da rota. */
export function sampleRouteAt(route: RouteResult, distM: number): { lng: number; lat: number; headingRad: number } {
  const line = lineString(route.coordinates);
  const d = Math.max(0, Math.min(distM, route.distanceM));
  const here = along(line, d, { units: "meters" });
  const aheadD = Math.min(route.distanceM, d + 2);
  const ahead = aheadD > d ? along(line, aheadD, { units: "meters" }) : here;
  const brgDeg = aheadD > d ? bearing(here, ahead) : 0;
  return {
    lng: here.geometry.coordinates[0],
    lat: here.geometry.coordinates[1],
    headingRad: (brgDeg * Math.PI) / 180,
  };
}

/**
 * Coordenadas da rota a partir de `distM`, descartando o trecho já
 * percorrido — o que sobra é só o caminho À FRENTE do técnico.
 *
 * É o comportamento de Waze/Maps: a linha mostra para onde você ainda vai,
 * não por onde já passou. Sem isso o painel desenhava a perna inteira desde
 * o ponto onde a rota foi calculada, e a parte de trás dava a impressão de
 * um trajeto muito maior do que o deslocamento real em curso.
 *
 * O primeiro ponto é interpolado na posição exata do técnico, pra linha
 * começar exatamente sob o veículo e não no próximo vértice da rota.
 */
export function routeAheadCoordinates(route: RouteResult, distM: number): [number, number][] {
  const coords = route.coordinates;
  if (coords.length < 2 || distM <= 0) return coords;

  const line = lineString(coords);
  const restante = Math.max(0, route.distanceM - distM);
  if (restante < 1) return [coords[coords.length - 1], coords[coords.length - 1]];

  const aqui = along(line, distM, { units: "meters" });
  const inicio = aqui.geometry.coordinates as [number, number];

  // Mantém só os vértices que ficam ADIANTE da posição atual. Percorre
  // acumulando distância em vez de usar índice, porque os vértices da
  // Directions API não são equidistantes.
  const adiante: [number, number][] = [inicio];
  let acumulado = 0;
  for (let i = 1; i < coords.length; i++) {
    acumulado += haversineM(
      { lng: coords[i - 1][0], lat: coords[i - 1][1] },
      { lng: coords[i][0], lat: coords[i][1] }
    );
    if (acumulado > distM) adiante.push(coords[i]);
  }
  return adiante.length >= 2 ? adiante : [inicio, coords[coords.length - 1]];
}

/** Comprimento total de uma rota recém-buscada, em metros (sanity check). */
export function routeLengthM(route: RouteResult): number {
  return length(lineString(route.coordinates), { units: "meters" });
}
