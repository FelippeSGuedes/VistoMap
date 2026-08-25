"use client";

import { useCallback, useEffect, useState } from "react";

export type LocationPermissionState =
  | "unknown"
  | "prompt"
  | "granted"
  | "denied"
  | "unsupported"
  | "insecure";

export interface GeoCoords {
  lat: number;
  lng: number;
  accuracy: number;
}

const HIGH_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 15_000,
};

// GPS de alta precisão pode não fechar um fix em 15s (comum em local
// fechado/sinal fraco) — em vez de só falhar, cai pra localização
// aproximada (rede/wifi), bem mais rápida de resolver.
const FALLBACK_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 30_000,
  timeout: 10_000,
};

function getPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

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
    // Geolocation requer secure context (HTTPS ou localhost).
    // Em HTTP qualquer, o navegador bloqueia silenciosamente e retorna "denied".
    if (typeof window.isSecureContext === "boolean" && !window.isSecureContext) {
      setState("insecure");
      setError("Geolocalização exige HTTPS. Acesse o app por uma URL https://");
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
  const request = useCallback(async (): Promise<GeoCoords | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unsupported");
      return null;
    }
    setRequesting(true);
    setError(null);
    try {
      const pos = await getPosition(HIGH_ACCURACY_OPTIONS);
      setRequesting(false);
      setState("granted");
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      if (geoErr.code === geoErr.PERMISSION_DENIED) {
        setRequesting(false);
        setState("denied");
        setError("Permissão negada");
        return null;
      }
      // Timeout ou sinal indisponível com alta precisão — tenta de novo
      // com localização aproximada antes de desistir.
      try {
        const pos = await getPosition(FALLBACK_OPTIONS);
        setRequesting(false);
        setState("granted");
        return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      } catch (err2) {
        setRequesting(false);
        const geoErr2 = err2 as GeolocationPositionError;
        if (geoErr2.code === geoErr2.PERMISSION_DENIED) {
          setState("denied");
          setError("Permissão negada");
        } else if (geoErr2.code === geoErr2.POSITION_UNAVAILABLE) {
          setError("Sinal de GPS indisponível");
        } else if (geoErr2.code === geoErr2.TIMEOUT) {
          setError("Tempo esgotado — sem sinal");
        } else {
          setError(geoErr2.message);
        }
        return null;
      }
    }
  }, []);

  return { state, requesting, error, request };
}
