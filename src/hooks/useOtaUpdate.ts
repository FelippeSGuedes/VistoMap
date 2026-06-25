"use client";

/**
 * useOtaUpdate
 *
 * Atualiza o bundle web do APK sem reinstalar (OTA), via @capgo/capacitor-updater
 * em modo MANUAL. No-op em browser.
 *
 * Fluxo (no cold-start do app):
 *  1. notifyAppReady() — confirma que o bundle atual carregou. Sem isso o
 *     capgo faz rollback automático (proteção contra bundle quebrado).
 *  2. Busca o manifesto em {origin}/ota/latest.json (silencioso, offline-safe).
 *  3. Se a versão publicada for diferente da ativa, baixa o zip e aplica com
 *     set() — o webview recarrega no bundle novo. O hook remonta e chama
 *     notifyAppReady() de novo, confirmando.
 *
 * Aplica só no cold-start pra não interromper o técnico no meio do trabalho.
 * Sem rede (zona rural) o fetch falha, é capturado, e o app segue no bundle atual.
 */

import { useEffect } from "react";
import { API_BASE } from "@/services/api";

// {origin}/ota — mesmo host que a API, sem o sufixo /app/api.
const OTA_BASE = API_BASE.replace(/\/app\/api\/?$/, "") + "/ota";

interface BundleInfo {
  id: string;
  version: string;
}

interface UpdaterPlugin {
  notifyAppReady: () => Promise<unknown>;
  current: () => Promise<{ bundle: BundleInfo; native: string }>;
  download: (opts: { url: string; version: string }) => Promise<BundleInfo>;
  set: (opts: { id: string }) => Promise<void>;
  /** Agenda o bundle para ser ativado no PRÓXIMO cold-start (sem recarregar agora). */
  next: (opts: { id: string }) => Promise<void>;
}

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  Plugins?: { CapacitorUpdater?: UpdaterPlugin };
}

function getCapacitor(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

export function useOtaUpdate() {
  useEffect(() => {
    const cap = getCapacitor();
    if (!cap?.isNativePlatform?.()) return;

    const Updater = cap.Plugins?.CapacitorUpdater;
    if (!Updater) {
      console.warn("[useOtaUpdate] Plugin CapacitorUpdater indisponível — APK antigo?");
      return;
    }

    let cancelled = false;

    (async () => {
      // 1. Confirma o bundle atual (evita rollback do capgo).
      try {
        await Updater.notifyAppReady();
      } catch (e) {
        console.warn("[useOtaUpdate] notifyAppReady falhou:", e);
      }

      // 2. Checa atualização — silencioso e tolerante a offline.
      try {
        const res = await fetch(`${OTA_BASE}/latest.json?ts=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;

        const manifest = (await res.json()) as { version?: string; url?: string };
        if (!manifest?.version || !manifest?.url) return;

        const cur = await Updater.current();
        if (cur?.bundle?.version === manifest.version) return; // já está na última

        console.log(
          `[useOtaUpdate] Atualização: ${cur?.bundle?.version ?? "?"} → ${manifest.version}`
        );

        // 3. Baixa e agenda para o próximo cold-start (sem recarregar agora).
        const bundle = await Updater.download({
          url: manifest.url,
          version: manifest.version,
        });
        if (cancelled || !bundle?.id) return;
        await Updater.next({ id: bundle.id });
        console.log(`[useOtaUpdate] Bundle ${manifest.version} agendado — ativo no próximo cold-start.`);
      } catch (err) {
        console.warn("[useOtaUpdate] Checagem OTA falhou (offline?):", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
