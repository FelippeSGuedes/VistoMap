"use client";

/**
 * useLocationReporter
 *
 * Envia GPS do tecnico via POST /api/locations.
 *
 * Modos:
 * - Native (Capacitor APK): plugin BackgroundGeolocation com foreground service.
 *   Continua rastreando mesmo com tela bloqueada. Ping aproximadamente a cada
 *   distanceFilter metros OU intervalo via timer interno.
 * - Web (browser): polling navigator.geolocation a cada INTERVAL_MS.
 *   Throttled em background, suspende com tela bloqueada.
 *
 * Detecta runtime via window.Capacitor.isNativePlatform().
 */

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth";
import { useExpedienteStore } from "@/store/expediente";
import { API_BASE } from "@/services/api";

const INTERVAL_MS = 30_000;
const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 20_000,
  timeout: 10_000,
};

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  Plugins?: {
    BackgroundGeolocation?: {
      addWatcher: (
        opts: {
          backgroundMessage?: string;
          backgroundTitle?: string;
          requestPermissions?: boolean;
          stale?: boolean;
          distanceFilter?: number;
        },
        cb: (
          loc: {
            latitude: number;
            longitude: number;
            accuracy: number;
            speed: number | null;
            time: number;
          } | null,
          err?: { code: string; message: string }
        ) => void
      ) => Promise<string>;
      removeWatcher: (opts: { id: string }) => Promise<void>;
    };
  };
}

function getCapacitor(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

function getBatteryLevel(): Promise<number | null> {
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
  const expediente = useExpedienteStore((s) => s.expediente);
  const refreshExpediente = useExpedienteStore((s) => s.refresh);
  const intervalRef = useRef<number | null>(null);
  const watcherIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (session?.token) {
      void refreshExpediente();
    }
  }, [session?.token, refreshExpediente]);

  useEffect(() => {
    if (!session?.token) {
      console.log("[useLocationReporter] Sem token, nao reporta.");
      return;
    }

    if (!expediente?.emAndamento) {
      // Expediente é automático (abre sozinho via refreshExpediente acima,
      // dentro da janela configurada). Enquanto o store ainda não refletir
      // isso (cold start / fora da janela), o rastreio fica suspenso — o
      // efeito reexecuta assim que `expediente` atualizar.
      console.log("[useLocationReporter] Fora de expediente, rastreio suspenso.");
      return;
    }

    const endpoint = `${API_BASE}/locations`;

    async function postLocation(payload: {
      latitude: number;
      longitude: number;
      accuracy_meters: number | null;
      speed_kmh: number | null;
      battery_level: number | null;
    }) {
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session!.token}`,
          },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          const errMsg = await resp.text();
          console.error("[useLocationReporter] Falha POST:", errMsg);
        }
      } catch (err) {
        console.error("[useLocationReporter] Erro rede:", err);
      }
    }

    const cap = getCapacitor();
    const isNative = cap?.isNativePlatform?.() ?? false;

    // ─────── Modo native: BackgroundGeolocation ───────
    if (isNative && cap?.Plugins?.BackgroundGeolocation) {
      const BG = cap.Plugins.BackgroundGeolocation;
      console.log("[useLocationReporter] Modo nativo: BackgroundGeolocation");
      try {
        // addWatcher do @capacitor-community/background-geolocation v1.x
        // retorna string sincrona OU Promise<string> dependendo da versao.
        // Promise.resolve normaliza ambos.
        const watcherReturn = BG.addWatcher(
          {
            backgroundMessage:
              "VistoMap rastreando sua localizacao em tempo real",
            backgroundTitle: "Rastreamento ativo",
            requestPermissions: true,
            stale: false,
            distanceFilter: 30,
          },
          async (loc, err) => {
            if (err) {
              console.warn("[useLocationReporter] BG erro:", err);
              return;
            }
            if (!loc) return;
            const battery = await getBatteryLevel();
            await postLocation({
              latitude: loc.latitude,
              longitude: loc.longitude,
              accuracy_meters: loc.accuracy ?? null,
              speed_kmh:
                loc.speed != null ? Math.round(loc.speed * 3.6) : null,
              battery_level: battery,
            });
          }
        );
        Promise.resolve(watcherReturn)
          .then((id) => {
            if (typeof id === "string") watcherIdRef.current = id;
          })
          .catch((e) => {
            console.error("[useLocationReporter] addWatcher falhou:", e);
          });
      } catch (e) {
        console.error("[useLocationReporter] addWatcher exception:", e);
      }

      return () => {
        if (watcherIdRef.current && BG.removeWatcher) {
          try {
            const r = BG.removeWatcher({ id: watcherIdRef.current });
            Promise.resolve(r).catch(() => {});
          } catch {
            /* ignore */
          }
          watcherIdRef.current = null;
        }
      };
    }

    // ─────── Modo web: polling navigator.geolocation ───────
    async function report() {
      if (!navigator?.geolocation) {
        console.warn("[useLocationReporter] Geolocalizacao indisponivel.");
        return;
      }
      const pos = await new Promise<GeolocationPosition | null>((res) => {
        navigator.geolocation.getCurrentPosition(
          (p) => res(p),
          (err) => {
            console.warn("[useLocationReporter] Erro getCurrentPosition:", err);
            res(null);
          },
          GEO_OPTIONS
        );
      });
      if (!pos) return;
      const battery = await getBatteryLevel();
      await postLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_meters: pos.coords.accuracy ?? null,
        speed_kmh:
          pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : null,
        battery_level: battery,
      });
    }

    report();
    intervalRef.current = window.setInterval(report, INTERVAL_MS);

    // Wake Lock: mantem tela ativa em mobile pra reduzir suspensao da aba.
    type WakeLockSentinel = { release: () => Promise<void> };
    type WakeLockAPI = {
      request: (type: "screen") => Promise<WakeLockSentinel>;
    };
    let wakeLock: WakeLockSentinel | null = null;
    const wl = (navigator as Navigator & { wakeLock?: WakeLockAPI }).wakeLock;
    if (wl) {
      wl.request("screen")
        .then((s) => {
          wakeLock = s;
        })
        .catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && !wakeLock) {
          wl.request("screen")
            .then((s) => {
              wakeLock = s;
            })
            .catch(() => {});
        }
      });
    }

    return () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [expediente?.emAndamento, session?.token, refreshExpediente]);
}
