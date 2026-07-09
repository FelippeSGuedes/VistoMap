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
 *     set() — reinicia o WebView JÁ nesta mesma abertura do app (não precisa
 *     fechar/abrir de novo). O hook remonta no bundle novo e confirma com
 *     notifyAppReady() outra vez.
 *
 * set() em vez de next(): checagem só roda no cold-start (mount deste hook),
 * que já é o momento seguro pra recarregar — o técnico está abrindo o app
 * agora, não no meio de uma vistoria. Aplicar na hora evita o técnico precisar
 * fechar e abrir o app duas vezes pra receber uma atualização.
 *
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
  /** Aplica o bundle AGORA — recarrega o WebView imediatamente. */
  set: (opts: { id: string }) => Promise<void>;
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

        // 3. Baixa e aplica JÁ — recarrega o WebView nesta mesma abertura.
        const bundle = await Updater.download({
          url: manifest.url,
          version: manifest.version,
        });
        if (cancelled || !bundle?.id) return;
        await Updater.set({ id: bundle.id });
        console.log(`[useOtaUpdate] Bundle ${manifest.version} aplicado — recarregando.`);
      } catch (err) {
        console.warn("[useOtaUpdate] Checagem OTA falhou (offline?):", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
