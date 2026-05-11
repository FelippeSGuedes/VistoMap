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

export function useGeolocation(autoStart = false) {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    loading: false,
    error: null,
  });
  const watchId = useRef<number | null>(null);

  const refresh = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        position: null,
        loading: false,
        error: "Geolocalização indisponível neste dispositivo.",
      });
      return Promise.resolve(null);
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    return new Promise<GeoPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next: GeoPosition = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            capturedAt: Date.now(),
          };
          setState({ position: next, loading: false, error: null });
          resolve(next);
        },
        (err) => {
          setState({
            position: null,
            loading: false,
            error: err.message || "Não foi possível obter a localização.",
          });
          resolve(null);
        },
        DEFAULT_OPTIONS
      );
    });
  }, []);

  useEffect(() => {
    if (!autoStart) return;
    refresh();
    return () => {
      if (watchId.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [autoStart, refresh]);

  return { ...state, refresh };
}
