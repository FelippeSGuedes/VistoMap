"use client";

import { useCallback, useEffect, useState } from "react";

export type LocationPermissionState =
  | "unknown"
  | "prompt"
  | "granted"
  | "denied"
  | "unsupported";

export interface GeoCoords {
  lat: number;
  lng: number;
  accuracy: number;
}

const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 15_000,
};

export function useLocationPermission() {
  const [state, setState] = useState<LocationPermissionState>("unknown");
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sondagem inicial via Permissions API (suportada em iOS 16+/Android Chrome).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) {
      setState("unsupported");
      return;
    }
    if (!("permissions" in navigator)) {
      setState("prompt");
      return;
    }

    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setState(status.state as LocationPermissionState);
        status.onchange = () => {
          setState(status.state as LocationPermissionState);
        };
      })
      .catch(() => {
        if (!cancelled) setState("prompt");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Pede a posição atual. Em iOS, isso dispara o prompt nativo do sistema.
   * Em Android Chrome, dispara o banner do navegador.
   */
  const request = useCallback((): Promise<GeoCoords | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unsupported");
      return Promise.resolve(null);
    }
    setRequesting(true);
    setError(null);
    return new Promise<GeoCoords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setRequesting(false);
          setState("granted");
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        (err) => {
          setRequesting(false);
          if (err.code === err.PERMISSION_DENIED) {
            setState("denied");
            setError("Permissão negada");
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            setError("Sinal de GPS indisponível");
          } else if (err.code === err.TIMEOUT) {
            setError("Tempo esgotado — sem sinal");
          } else {
            setError(err.message);
          }
          resolve(null);
        },
        POSITION_OPTIONS
      );
    });
  }, []);

  return { state, requesting, error, request };
}
