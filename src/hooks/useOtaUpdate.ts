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
import { useOtaStore, OTA_JUST_UPDATED_KEY } from "@/store/ota";

/**
 * {origin}/ota — mesmo host que a API, na raiz (nginx serve /ota como path
 * top-level, não sob /app). Deriva da ORIGEM de API_BASE via URL(), não de
 * um replace() de sufixo esperado — se API_BASE algum dia vier com um path
 * inesperado (ex.: sem o /api final, por erro de config), um replace()
 * baseado em sufixo simplesmente não bate e deixa o path errado passar
 * batido (isso já aconteceu — foi assim que uma config quebrada consertou
 * a URL da API mas quebrou silenciosamente a URL do OTA, criando um bundle
 * que nunca mais conseguia se autoatualizar). new URL().origin ignora
 * completamente o path de API_BASE, então é imune a esse tipo de bug.
 */
function computeOtaBase(): string {
  try {
    return new URL(API_BASE).origin + "/ota";
  } catch {
    // API_BASE relativo (web/painel, sem host) — OTA não se aplica lá mesmo.
    return "/ota";
  }
}
const OTA_BASE = computeOtaBase();

interface BundleInfo {
  id: string;
  version: string;
}

interface PluginListenerHandle {
  remove: () => Promise<void>;
}

interface DownloadEvent {
  /** 0..100 — progresso real do download do zip. */
  percent: number;
  bundle?: BundleInfo;
}

interface UpdaterPlugin {
  notifyAppReady: () => Promise<unknown>;
  current: () => Promise<{ bundle: BundleInfo; native: string }>;
  download: (opts: { url: string; version: string }) => Promise<BundleInfo>;
  /** Aplica o bundle AGORA — recarrega o WebView imediatamente. */
  set: (opts: { id: string }) => Promise<void>;
  /** Evento de progresso do download (capgo emite `download`). */
  addListener?: (
    event: "download",
    cb: (e: DownloadEvent) => void
  ) => Promise<PluginListenerHandle> | PluginListenerHandle;
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
    const ota = useOtaStore.getState();

    // Ponte pós-reload: se acabamos de aplicar um bundle (marcador gravado
    // antes do reload), a PRIMEIRA coisa que o app novo faz é mostrar a tela
    // "Atualizado ✓" por um instante e sumir — cobre o flash cinza do reload.
    try {
      const justUpdated = window.localStorage.getItem(OTA_JUST_UPDATED_KEY);
      if (justUpdated) {
        window.localStorage.removeItem(OTA_JUST_UPDATED_KEY);
        ota.concluido(justUpdated);
        window.setTimeout(() => useOtaStore.getState().reset(), 1600);
      }
    } catch {
      /* localStorage indisponível — segue sem a ponte */
    }

    const cap = getCapacitor();
    if (!cap?.isNativePlatform?.()) return;

    const Updater = cap.Plugins?.CapacitorUpdater;
    if (!Updater) {
      console.warn("[useOtaUpdate] Plugin CapacitorUpdater indisponível — APK antigo?");
      return;
    }

    let cancelled = false;
    let progressHandle: PluginListenerHandle | null = null;

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
        const deVersao = cur?.bundle?.version ?? null;
        if (deVersao === manifest.version) return; // já está na última

        console.log(`[useOtaUpdate] Atualização: ${deVersao ?? "?"} → ${manifest.version}`);

        // Abre a tela de atualização e escuta o progresso real do download.
        useOtaStore.getState().iniciarDownload(deVersao, manifest.version);
        try {
          progressHandle = (await Updater.addListener?.("download", (e) => {
            if (typeof e?.percent === "number") {
              useOtaStore.getState().setProgresso(e.percent);
            }
          })) as PluginListenerHandle | null;
        } catch {
          /* sem evento de progresso — a barra usa fallback animado na overlay */
        }

        // 3. Baixa e aplica JÁ — recarrega o WebView nesta mesma abertura.
        const bundle = await Updater.download({
          url: manifest.url,
          version: manifest.version,
        });
        if (cancelled || !bundle?.id) {
          useOtaStore.getState().reset();
          return;
        }

        // Marca "acabei de atualizar" ANTES do reload (a store é apagada no
        // reload; o localStorage sobrevive e reidrata a tela de "concluído").
        useOtaStore.getState().aplicando();
        try {
          window.localStorage.setItem(OTA_JUST_UPDATED_KEY, manifest.version);
        } catch {
          /* segue mesmo sem o marcador */
        }

        await Updater.set({ id: bundle.id });
        console.log(`[useOtaUpdate] Bundle ${manifest.version} aplicado — recarregando.`);
      } catch (err) {
        console.warn("[useOtaUpdate] Checagem OTA falhou (offline?):", err);
        const st = useOtaStore.getState();
        if (st.phase === "baixando") {
          st.erro();
          window.setTimeout(() => useOtaStore.getState().reset(), 2600);
        }
      } finally {
        try {
          await progressHandle?.remove();
        } catch {
          /* ignora */
        }
      }
    })();

    return () => {
      cancelled = true;
      progressHandle?.remove().catch(() => {});
    };
  }, []);
}
