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
 *
 * Migrado de @capacitor-community/background-geolocation (parado na v1.2.26,
 * sem release pra Capacitor 8) pra @capgo/background-geolocation — bump
 * obrigatório junto da subida de API 36/Capacitor 8 pra Play Store. O nome
 * do plugin em runtime continua "BackgroundGeolocation" (mesmo
 * window.Capacitor.Plugins.BackgroundGeolocation de antes), mas o método
 * mudou de addWatcher()/removeWatcher() (retornava um id de watcher) pra
 * start()/stop() (sem id — só um método pra parar, ponto). Confirmado lendo
 * o .d.ts real do pacote publicado, não por suposição de compatibilidade.
 *
 * Entrega nativa redundante (2026-09-01): além do callback JS de sempre
 * (postLocation via fetch), passa `url`+`headers` pro plugin — o código
 * NATIVO passa a fazer o POST diretamente pro mesmo endpoint, em paralelo,
 * sem depender do WebView estar vivo. Fabricantes como Xiaomi/MIUI e
 * Samsung matam processo de app em segundo plano de forma bem mais agressiva
 * que o Android puro; o foreground service (que já existia, é o que mostra
 * a notificação "Rastreamento ativo") tem proteção bem mais forte contra
 * isso do que um processo de WebView comum — se o sistema matar o WebView,
 * o serviço nativo continua rodando (START_STICKY) e reenviando posição
 * sozinho, então o técnico não some do mapa.
 *
 * O ping nativo vem no formato cru do plugin (accuracy/speed em m/s, sem
 * bateria — só o JS sabe ler bateria), não no formato enriquecido que
 * postLocation() monta — por isso o backend (/api/locations) aceita os dois
 * formatos. Duplicidade quando as duas vias estão vivas ao mesmo tempo é
 * aceitável: a tabela de rastreamento não precisa de deduplicação, é sinal
 * de saude, não de bug.
 */

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth";
import { useExpedienteStore } from "@/store/expediente";
import { useLocationPrimingStore } from "@/store/locationPriming";
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
      start: (
        opts: {
          backgroundMessage?: string;
          backgroundTitle?: string;
          requestPermissions?: boolean;
          stale?: boolean;
          distanceFilter?: number;
          /** Entrega nativa direta pro backend — ver comentário no topo do arquivo. */
          url?: string;
          headers?: Record<string, string>;
        },
        cb: (
          loc?: {
            latitude: number;
            longitude: number;
            accuracy: number;
            speed: number | null;
            time: number | null;
          },
          err?: { code?: string; message: string }
        ) => void
      ) => Promise<void>;
      stop: () => Promise<void>;
      /**
       * BUG do plugin (achado em teste real, 2026-09-02): start({requestPermissions:true})
       * só garante a permissão de localização em PRIMEIRO plano (alias "location")
       * — o método start() nunca checa/pede "backgroundLocation" (confirmado lendo
       * o Java do plugin: esse alias só é pedido dentro de requestPermissions(),
       * nunca dentro de start()). Em aparelho que já tinha a localização normal
       * concedida de antes, start() pulava reto pro serviço sem NUNCA pedir
       * "permitir o tempo todo" — o diálogo simplesmente não aparecia. Por isso
       * chamamos isto explicitamente antes de start(), ver mais abaixo.
       */
      requestPermissions?: (opts?: {
        permissions?: ("location" | "backgroundLocation" | "notification")[];
      }) => Promise<Record<string, string>>;
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
  const primingAcknowledged = useLocationPrimingStore((s) => s.acknowledged);
  const intervalRef = useRef<number | null>(null);

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

    // "Declaração em destaque" exigida pelo Google Play antes do pedido de
    // ACCESS_BACKGROUND_LOCATION — mostra a LocationPrimingOverlay e sai;
    // o efeito reexecuta sozinho quando `primingAcknowledged` virar true
    // (está na dependency array abaixo), e aí sim chama BG.start().
    if (isNative && !primingAcknowledged) {
      useLocationPrimingStore.getState().solicitar();
      return;
    }

    // ─────── Modo native: BackgroundGeolocation ───────
    if (isNative && cap?.Plugins?.BackgroundGeolocation) {
      const BG = cap.Plugins.BackgroundGeolocation;
      console.log("[useLocationReporter] Modo nativo: BackgroundGeolocation");
      // Promise.resolve(...) normaliza o retorno de start()/stop(): a
      // tipagem do plugin declara Promise<void>, mas achado em campo
      // (2026-09-01, log real de dispositivo): o bridge do Capacitor pra
      // metodos com callback nem sempre devolve algo com .catch encadeavel
      // de verdade em runtime — encadear .catch() direto ali quebrava com
      // "TypeError: e.start(...).catch is not a function", derrubando a
      // arvore de render (tela de erro do Next.js) mesmo com o GPS nativo
      // funcionando por baixo. Mesma cautela que o codigo antigo ja tinha
      // pra addWatcher() por um motivo parecido.
      const iniciarWatcher = () => {
        try {
          Promise.resolve(
            BG.start(
              {
                backgroundMessage:
                  "VistoMap rastreando sua localizacao em tempo real",
                backgroundTitle: "Rastreamento ativo",
                // false: já pedimos "location" + "backgroundLocation" explicitamente
                // logo abaixo (ver comentário no tipo do plugin, no topo do arquivo).
                requestPermissions: false,
                stale: false,
                distanceFilter: 30,
                url: endpoint,
                headers: { Authorization: `Bearer ${session!.token}` },
              },
              (loc, err) => {
                if (err) {
                  console.warn("[useLocationReporter] BG erro:", err);
                  return;
                }
                if (!loc) return;
                void (async () => {
                  const battery = await getBatteryLevel();
                  await postLocation({
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                    accuracy_meters: loc.accuracy ?? null,
                    speed_kmh:
                      loc.speed != null ? Math.round(loc.speed * 3.6) : null,
                    battery_level: battery,
                  });
                })();
              }
            )
          ).catch((e) => {
            console.error("[useLocationReporter] BG.start falhou:", e);
          });
        } catch (e) {
          console.error("[useLocationReporter] BG.start exception:", e);
        }
      };

      // Pede "location" (primeiro plano) + "backgroundLocation" explicitamente
      // ANTES de start() — ver o comentário longo no tipo BackgroundGeolocation
      // no topo do arquivo: start({requestPermissions:true}) sozinho NUNCA pede
      // "permitir o tempo todo" quando a localização normal já estava concedida
      // de antes, então o diálogo de segundo plano simplesmente não aparecia.
      if (BG.requestPermissions) {
        try {
          Promise.resolve(
            BG.requestPermissions({ permissions: ["location", "backgroundLocation"] })
          )
            .catch((e) => {
              console.warn("[useLocationReporter] requestPermissions falhou:", e);
            })
            .finally(iniciarWatcher);
        } catch (e) {
          console.error("[useLocationReporter] requestPermissions exception:", e);
          iniciarWatcher();
        }
      } else {
        iniciarWatcher();
      }

      return () => {
        try {
          Promise.resolve(BG.stop()).catch(() => {});
        } catch {
          /* ignore */
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
  }, [expediente?.emAndamento, session?.token, refreshExpediente, primingAcknowledged]);
}
