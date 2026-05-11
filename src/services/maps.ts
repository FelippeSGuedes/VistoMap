import { isMobileDevice } from "@/utils/format";

export const DEFAULT_CENTER: [number, number] = [-46.6333, -23.5505];
export const DEFAULT_ZOOM = 11;
export const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";
export const MAP_STYLE_DARK = "mapbox://styles/mapbox/dark-v11";

export function buildWazeUrl(lat: number, lng: number) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export function buildGoogleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function openNavigation(lat: number, lng: number) {
  if (typeof window === "undefined") return;
  const url = isMobileDevice() ? buildWazeUrl(lat, lng) : buildGoogleMapsUrl(lat, lng);
  window.open(url, "_blank", "noopener,noreferrer");
}

export function getMapboxToken(): string {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
}
