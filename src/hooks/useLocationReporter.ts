"use client";

/**
 * useLocationReporter
 *
 * Envia a posição GPS do técnico para o backend via POST /api/locations
 * a cada INTERVAL_MS (padrão 30s) enquanto:
 *   - a sessão estiver ativa
 *   - a página estiver visível (Page Visibility API)
 *   - a geolocalização estiver disponível e autorizada
 *
 * Sem WebSocket — polling simples conforme especificado.
 */

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth";

const INTERVAL_MS = 30_000;
const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 20_000,
  timeout: 10_000,
};

function getBatteryLevel(): Promise<number | null> {
  // Battery Status API — não disponível em todos os browsers.
  if (typeof navigator === "undefined") return Promise.resolve(null);
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number }>;
  };
  if (typeof nav.getBattery !== "function") return Promise.resolve(null);
  return nav
    .getBattery()
    .then((b) => Math.round(b.level * 100))
    .catch(() => null);
}

export function useLocationReporter() {
  const { session } = useAuthStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Qualquer usuário autenticado transmite posição (admin pode estar em campo também).
    if (!session?.token) {
      console.log("[useLocationReporter] Sem token, não reporta localização.");
      return;
    }

    async function report() {
      // Não reporta se a aba estiver oculta.
      if (typeof document !== "undefined" && document.hidden) {
        console.log("[useLocationReporter] Aba oculta, não reporta localização.");
        return;
      }
      if (!navigator?.geolocation) {
        console.warn("[useLocationReporter] Geolocalização não disponível no navegador.");
        return;
      }

      const pos = await new Promise<GeolocationPosition | null>((res) => {
        navigator.geolocation.getCurrentPosition(
          (p) => res(p),
          (err) => {
            console.warn("[useLocationReporter] Erro ao obter localização:", err);
            res(null);
          },
          GEO_OPTIONS
        );
      });
      if (!pos) {
        console.warn("[useLocationReporter] Não obteve posição, não envia ping.");
        return;
      }

      const battery = await getBatteryLevel();

      const payload = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_meters: pos.coords.accuracy ?? null,
        speed_kmh:
          pos.coords.speed != null
            ? Math.round(pos.coords.speed * 3.6)
            : null,
        battery_level: battery,
      };
      console.log("[useLocationReporter] Enviando localização:", payload);

      try {
        const resp = await fetch("/api/locations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session!.token}`,
          },
          body: JSON.stringify(payload),
        });
        if (resp.ok) {
          console.log("[useLocationReporter] Localização enviada com sucesso.");
        } else {
          const errMsg = await resp.text();
          console.error("[useLocationReporter] Falha ao enviar localização:", errMsg);
        }
      } catch (err) {
        console.error("[useLocationReporter] Erro de rede ao enviar localização:", err);
      }
    }

    report(); // imediato ao montar
    intervalRef.current = setInterval(report, INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session?.token]);
}
