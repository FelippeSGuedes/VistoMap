import type { VistoriaPriority, VistoriaStatus } from "@/types";

export const STATUS_LABEL: Record<VistoriaStatus, string> = {
  PENDENTE: "Pendente",
  EM_CAMPO: "Em campo",
  FINALIZADA: "Finalizada",
  REPROVADA: "Reprovada",
  APROVADA: "Aprovada",
};

export const STATUS_COLOR: Record<VistoriaStatus, string> = {
  PENDENTE: "#FFD166",
  EM_CAMPO: "#3B82F6",
  FINALIZADA: "#06D6A0",
  REPROVADA: "#EF4444",
  APROVADA: "#073B4C",
};

export const PRIORITY_LABEL: Record<VistoriaPriority, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  CRITICA: "Crítica",
};

export const PRIORITY_RANK: Record<VistoriaPriority, number> = {
  BAIXA: 0,
  MEDIA: 1,
  ALTA: 2,
  CRITICA: 3,
};

export function formatDistanceKm(km?: number) {
  if (km == null) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

export function formatRelativeDate(iso?: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  const diff = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60));
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (Math.abs(diff) < 24) return rtf.format(diff, "hour");
  return rtf.format(Math.round(diff / 24), "day");
}

export function formatLatLng(lat?: number, lng?: number) {
  if (lat == null || lng == null) return "—";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(
    navigator.userAgent
  );
}
