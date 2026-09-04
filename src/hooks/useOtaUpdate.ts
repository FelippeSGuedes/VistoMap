"use client";

/**
 * useOtaUpdate
 *
 * Atualiza o bundle web do APK sem reinstalar (OTA), via @capgo/capacitor-updater
 * em modo MANUAL. No-op em browser.
 *
 * Fluxo:
 *  1. notifyAppReady() — SEMPRE, no cold-start (mesmo sem sessão). Confirma
 *     que o bundle atual carregou; sem isso o capgo faz rollback automático
 *     (proteção contra bundle quebrado) mesmo que o técnico só esteja
 *     demorando pra digitar a senha na tela de login.
 *  2. Busca o manifesto, baixa e aplica (`set`) — UMA VEZ por abertura do
 *     app, sempre, autenticado ou não (achado 2026-09: gatear isso por
 *     sessão criava um problema de ovo-e-a-galinha — quem ainda não
 *     conseguia logar [ex.: preso no fluxo de ativação de aparelho] nunca
 *     recebia NENHUMA atualização OTA, mesmo sendo a própria correção
 *     necessária pra destravar o login). Roda uma única vez por cold-start
 *     via useRef, bem no começo da montagem — antes que dê tempo real do
 *     usuário focar/digitar em algum campo — em vez de reagir a mudanças de
 *     `enabled`, que é como a versão anterior evitava recarregar o WebView
 *     no meio do usuário digitando a senha.
 *
 * set() em vez de next(): a checagem roda uma vez só (quando `enabled` vira
 * true), que já é o momento seguro pra recarregar — o técnico acabou de
 * abrir/logar no app, não está no meio de uma vistoria. Aplicar na hora evita
 * precisar fechar e abrir o app duas vezes pra receber uma atualização.
 *
 * Trava de loop: se a MESMA versão já foi aplicada 2x nos últimos 10min e o
 * manifesto continua pedindo ela de novo, é sinal de rollback do capgo (bundle
 * não passou no health-check) — para de insistir em vez de ficar
 * baixando/aplicando/recarregando sem parar ("atualizando um milhão de
 * vezes", tela piscando).
 *
 * Sem rede (zona rural) o fetch falha, é capturado, e o app segue no bundle atual.
 */

import { useEffect, useRef } from "react";
import { API_BASE } from "@/services/api";
import { useOtaStore, OTA_JUST_UPDATED_KEY } from "@/store/ota";

/** Marcador de tentativas de aplicar uma versão — trava de loop (ver acima). */
const OTA_ATTEMPT_KEY = "vistomap.ota.lastAttempt";
const OTA_ATTEMPT_MAX = 2;
const OTA_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

interface OtaAttempt {
  version: string;
  count: number;
  ts: number;
}

function readAttempt(): OtaAttempt | null {
  try {
    const raw = window.localStorage.getItem(OTA_ATTEMPT_KEY);
    return raw ? (JSON.parse(raw) as OtaAttempt) : null;
  } catch {
    return null;
  }
}

function writeAttempt(a: OtaAttempt) {
  try {
    window.localStorage.setItem(OTA_ATTEMPT_KEY, JSON.stringify(a));
  } catch {
    /* localStorage indisponível — segue sem persistir a trava */
  }
}

function clearAttempt() {
  try {
    window.localStorage.removeItem(OTA_ATTEMPT_KEY);
  } catch {
    /* ignora */
  }
}

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

type BundleStatus = "success" | "error" | "pending" | "downloading" | "deleted";

interface BundleInfo {
  id: string;
  version: string;
  status?: BundleStatus;
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
  /** Lista os bundles já baixados no dispositivo (capgo v5+). */
  list?: () => Promise<{ bundles: BundleInfo[] }>;
  /** Remove um bundle baixado (limpeza de versões antigas/quebradas). */
  delete?: (opts: { id: string }) => Promise<void>;
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

/**
 * Timeout defensivo pra qualquer chamada nativa/rede do fluxo OTA — sem
 * isso, sinal fraco em campo pode deixar `Updater.download()`/`set()` (ou
 * o fetch do manifesto) pendurados pra sempre: a promise nunca resolve nem
 * rejeita, a tela cheia de atualização fica presa e o técnico não consegue
 * nem fechar o overlay nem usar o app (relatado como "atualização
 * infinita" — reabrir o app só reinicia o mesmo ciclo travado).
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} excedeu ${ms}ms`)), ms);
    p.then(
      (v) => { window.clearTimeout(t); resolve(v); },
      (e) => { window.clearTimeout(t); reject(e); }
    );
  });
}

/**
 * `enabled` não é mais usado pra gatear a checagem (ver comentário acima) —
 * mantido só pra não mudar a assinatura/chamada em providers.tsx à toa.
 */
export function useOtaUpdate(enabled: boolean) {
  void enabled;
  // Efeito 1 — SEMPRE, uma vez no cold-start (mesmo na tela de login):
  // confirma o bundle atual pro capgo não fazer rollback por timeout, e
  // mostra a ponte "Atualizado ✓" se acabamos de reiniciar por causa de um
  // bundle aplicado no ciclo anterior.
  useEffect(() => {
    const ota = useOtaStore.getState();

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
    if (!Updater) return;

    Updater.notifyAppReady().catch((e) => {
      console.warn("[useOtaUpdate] notifyAppReady falhou:", e);
    });
  }, []);

  // Efeito 2 — checa manifesto, baixa e aplica. Uma vez só por abertura do
  // app (trava por useRef, não por `enabled`) — autenticado ou não.
  const jaRodou = useRef(false);
  useEffect(() => {
    if (jaRodou.current) return;
    jaRodou.current = true;

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
      try {
        const manifestController = new AbortController();
        const manifestTimer = window.setTimeout(() => manifestController.abort(), 10_000);
        let res: Response;
        try {
          res = await fetch(`${OTA_BASE}/latest.json?ts=${Date.now()}`, {
            cache: "no-store",
            signal: manifestController.signal,
          });
        } finally {
          window.clearTimeout(manifestTimer);
        }
        if (!res.ok) return;

        const manifest = (await res.json()) as { version?: string; url?: string };
        if (!manifest?.version || !manifest?.url) return;

        const cur = await withTimeout(Updater.current(), 8_000, "Updater.current()");
        const deVersao = cur?.bundle?.version ?? null;
        if (deVersao === manifest.version) {
          clearAttempt(); // rodando na versão certa — qualquer trava antiga não vale mais.
          return;
        }

        // Trava de loop: já tentamos aplicar ESSA versão demais vezes recentemente
        // e o manifesto continua pedindo ela — provável rollback do capgo (bundle
        // não passa no health-check). Para de insistir em vez de ficar em loop de
        // baixar/aplicar/recarregar sem parar.
        const attempt = readAttempt();
        if (
          attempt &&
          attempt.version === manifest.version &&
          attempt.count >= OTA_ATTEMPT_MAX &&
          Date.now() - attempt.ts < OTA_ATTEMPT_WINDOW_MS
        ) {
          console.warn(
            `[useOtaUpdate] Versão ${manifest.version} falhou ${attempt.count}x nos últimos 10min — pausando tentativas.`
          );
          // Visível (aviso pequeno, não bloqueia o app) em vez de silencioso —
          // sem isso o técnico não tinha nenhum sinal de que o app sabia da
          // atualização e ia tentar de novo sozinho, e "resetar os dados"
          // virava o único jeito de sentir que fez alguma coisa.
          useOtaStore.getState().pausada(manifest.version);
          window.setTimeout(() => {
            if (useOtaStore.getState().phase === "pausada") useOtaStore.getState().reset();
          }, 6_000);
          return;
        }

        console.log(`[useOtaUpdate] Atualização: ${deVersao ?? "?"} → ${manifest.version}`);

        // Abre a tela de atualização e escuta o progresso real do download.
        useOtaStore.getState().iniciarDownload(deVersao, manifest.version);

        // Registra a tentativa JÁ AQUI (antes de qualquer chamada de rede) —
        // não só antes do reload. Antes, uma falha no download/list (sinal
        // fraco) nunca incrementava o contador, então a trava de loop só
        // pegava rollback do capgo, não conexão ruim — reabrir o app depois
        // de um download travado reiniciava o ciclo do zero indefinidamente.
        writeAttempt({
          version: manifest.version,
          count: attempt?.version === manifest.version ? attempt.count + 1 : 1,
          ts: Date.now(),
        });

        // 3a. Reaproveita um bundle DESTA MESMA versão que já esteja baixado
        //     e íntegro (status success). Evita rebaixar 16 MB a cada abertura
        //     numa rede ruim — que era o que fazia o app "atualizar várias
        //     vezes" e às vezes travar sem conseguir puxar. Só re-aplica (set).
        let bundle: BundleInfo | null = null;
        try {
          const lista = await withTimeout(Updater.list?.() ?? Promise.resolve(undefined), 8_000, "Updater.list()");
          const existente = lista?.bundles?.find(
            (b) => b.version === manifest.version && b.id && b.status !== "error"
          );
          if (existente && (existente.status === "success" || existente.status === "pending")) {
            bundle = existente;
            console.log(`[useOtaUpdate] Bundle ${manifest.version} já baixado — reaproveitando.`);
          }
        } catch {
          /* list() indisponível/travou — segue pro download */
        }

        // 3b. Se não tinha baixado ainda, baixa com progresso real.
        //
        // BUG (relatado por técnico de campo, 2026-09-01): update "demora
        // muito, às vezes não puxa, tem que resetar os dados". Causa: este
        // timeout era 60_000ms (60s), calibrado pra bundle de ~16MB — os
        // bundles reais hoje pesam 37-61MB (conferido nos publicados pelo CI
        // nesta mesma data). Em sinal fraco de campo, 60s não é tempo
        // suficiente pra baixar 40-60MB de jeito NENHUM — o download falhava
        // por timeout genuíno (não "rede quebrou", só "não deu tempo"),
        // disparava a trava de loop (OTA_ATTEMPT_MAX) depois de só 2
        // tentativas, e o app ficava 10min sem sequer tentar de novo — daí
        // "às vezes não puxa" e o hábito de resetar os dados (que zera a
        // trava, mas também apaga a fila offline com vistorias não
        // sincronizadas — risco que o técnico provavelmente não percebe).
        //
        // 5min é generoso o bastante pra 60MB mesmo em sinal ruim, mas ainda
        // finito — nunca volta a ser o "trava pra sempre" que esse timeout
        // existia pra evitar.
        const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
        if (!bundle) {
          try {
            progressHandle = (await Updater.addListener?.("download", (e) => {
              if (typeof e?.percent === "number") {
                useOtaStore.getState().setProgresso(e.percent);
              }
            })) as PluginListenerHandle | null;
          } catch {
            /* sem evento de progresso — a barra usa fallback animado na overlay */
          }
          bundle = await withTimeout(
            Updater.download({ url: manifest.url, version: manifest.version }),
            DOWNLOAD_TIMEOUT_MS,
            "Updater.download()"
          );
        }

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

        await withTimeout(Updater.set({ id: bundle.id }), 15_000, "Updater.set()");
        console.log(`[useOtaUpdate] Bundle ${manifest.version} aplicado — recarregando.`);
      } catch (err) {
        console.warn("[useOtaUpdate] Checagem OTA falhou (offline?):", err);
        const st = useOtaStore.getState();
        if (st.phase === "baixando" || st.phase === "aplicando") {
          // set() pode ter travado antes do reload real acontecer — limpa o
          // marcador "acabei de atualizar" pra não mostrar "Atualizado ✓"
          // falso na próxima abertura (o reload nunca aconteceu de verdade).
          try {
            window.localStorage.removeItem(OTA_JUST_UPDATED_KEY);
          } catch {
            /* ignora */
          }
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
