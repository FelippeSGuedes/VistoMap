"use client";

import { useMemo } from "react";
import type { FilterState, Vistoria } from "@/types";
import { PRIORITY_RANK, haversineKm } from "@/utils/format";

interface Args {
  vistorias: Vistoria[];
  filters: FilterState;
  origin?: { lat: number; lng: number } | null;
}

export function useFilteredVistorias({ vistorias, filters, origin }: Args) {
  return useMemo(() => {
    const enriched = vistorias.map((v) => ({
      ...v,
      distanciaKm: origin
        ? haversineKm(origin, { lat: v.latitude, lng: v.longitude })
        : v.distanciaKm,
    }));

    const filtered = enriched.filter((v) => {
      if (filters.query) {
        const q = filters.query.toLowerCase();
        const blob = `${v.equipamento} ${v.cidade} ${v.glpiId} ${v.endereco ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (filters.status.length && !filters.status.includes(v.status)) return false;
      if (filters.prioridade.length && !filters.prioridade.includes(v.prioridade)) return false;
      if (filters.categorias.length && v.categoria && !filters.categorias.includes(v.categoria))
        return false;
      if (
        filters.distanciaMaxKm &&
        v.distanciaKm != null &&
        v.distanciaKm > filters.distanciaMaxKm
      )
        return false;
      return true;
    });

    filtered.sort((a, b) => {
      switch (filters.ordenacao) {
        case "prioridade":
          return PRIORITY_RANK[b.prioridade] - PRIORITY_RANK[a.prioridade];
        case "data":
          return (
            new Date(a.agendadaPara ?? 0).getTime() -
            new Date(b.agendadaPara ?? 0).getTime()
          );
        case "distancia":
        default:
          return (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity);
      }
    });

    return filtered;
  }, [vistorias, filters, origin]);
}
