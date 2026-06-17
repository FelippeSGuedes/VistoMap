"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: number;
}

export interface GeolocationState {
  position: GeoPosition | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 15_000,
};

// Cache MODULE-SCOPE: compartilhado entre todas as instancias do hook.
// Evita re-prompt em navegacoes entre paginas: 1a chamada pede permissao,
// proximas X segundos reaproveitam o ultimo fix.
const CACHE_FRESH_MS = 60_000; // 1 min — bom pra UX, ruim pra precisao em movimento rapido
let cachedPosition: GeoPosition | null = null;
let inFlightPromise: Promise<GeoPosition | null> | null = null;
let permissionState: PermissionState | "unsupported" | null = null;

async function probePermission(): Promise<PermissionState | "unsupported"> {
  if (typeof navigator === "undefined" || !("permissions" in navigator)) {
    return "unsupported";
  }
  try {
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });
    permissionState = status.state;
    status.onchange = () => {
      permissionState = status.state;
    };
    return status.state;
  } catch {
    return "unsupported";
  }
}

export function useGeolocation(autoStart = false, watch = false) {
  const [state, setState] = useState<GeolocationState>({
    position: cachedPosition,
    loading: false,
    error: null,
  });
  const watchId = useRef<number | null>(null);

  const refresh = useCallback((force = false) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        position: null,
        loading: false,
        error: "Geolocalização indisponível neste dispositivo.",
      });
      return Promise.resolve(null);
    }

    // Cache hit recente → reusa sem chamar getCurrentPosition (sem prompt)
    if (
      !force &&
      cachedPosition &&
      Date.now() - cachedPosition.capturedAt < CACHE_FRESH_MS
    ) {
      setState({ position: cachedPosition, loading: false, error: null });
      return Promise.resolve(cachedPosition);
    }

    // Dedup: se ja ha um getCurrentPosition em andamento, aguarda ele
    if (inFlightPromise) {
      setState((s) => ({ ...s, loading: true, error: null }));
      return inFlightPromise.then((p) => {
        if (p) setState({ position: p, loading: false, error: null });
        return p;
      });
    }

    setState((s) => ({ ...s, loading: true, error: null }));
    inFlightPromise = new Promise<GeoPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next: GeoPosition = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            capturedAt: Date.now(),
          };
          cachedPosition = next;
          permissionState = "granted";
          setState({ position: next, loading: false, error: null });
          resolve(next);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            permissionState = "denied";
          }
          setState({
            position: cachedPosition, // mantem ultima conhecida se houver
            loading: false,
            error: err.message || "Não foi possível obter a localização.",
          });
          resolve(null);
        },
        DEFAULT_OPTIONS
      );
    }).finally(() => {
      inFlightPromise = null;
    });
    return inFlightPromise;
  }, []);

  useEffect(() => {
    if (!autoStart) return;
    // Probe permission ANTES de chamar getCurrentPosition pra evitar prompt
    // quando ja temos cache fresco OU quando permissao ja foi negada.
    const start = async () => {
      const perm = permissionState ?? (await probePermission());
      if (perm === "denied") {
        setState({
          position: cachedPosition,
          loading: false,
          error: "Permissão de localização negada nas configurações.",
        });
        return;
      }
      void refresh();
    };
    void start();
    return () => {
      if (watchId.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [autoStart, refresh]);

  // Watch contínuo: atualiza a posição em tempo real (mapa/rota se movem
  // sozinhos). Só ligar quando a permissão já está concedida — evita prompt.
  useEffect(() => {
    if (!watch) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const next: GeoPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: Date.now(),
        };
        cachedPosition = next;
        permissionState = "granted";
        setState({ position: next, loading: false, error: null });
      },
      () => {
        /* mantém a última posição conhecida; não derruba a UI */
      },
      { enableHighAccuracy: true, maximumAge: 4_000, timeout: 20_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [watch]);

  return { ...state, refresh };
}
