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
      void import("@/lib/reportClientError").then(({ reportClientError }) =>
        reportClientError(e instanceof Error ? e.message : String(e), "useOtaUpdate/notifyAppReady")
      );
    });
  }, []);
  // Efeito 2 — checa, baixa e aplica. Uma vez por abertura do app (trava
  // por useRef, não por `enabled`) — autenticado ou não.
  const jaRodou = useRef(false);
  useEffect(() => {
    if (jaRodou.current) return;
    jaRodou.current = true;
    void executarAtualizacaoOta({ origem: "automatico" });
  }, []);
}

/* ── diagnóstico ──────────────────────────────────────────────────────────
 *
 * O erro que chega do plugin é só "Failed to download from: <url>" — não
 * distingue conexão caindo no meio, disco cheio, TLS ou timeout. Sem mais
 * nada, o log de produção não concluía coisa alguma (reclamação direta,
 * 2026-10-05: "esse log ta muito simples, não é conclusivo em nada").
 *
 * Os dois campos que mais separam as hipóteses são `ms` e `percent`:
 *   • ms baixo, percent 0      -> recusado de cara (disco, TLS, plugin)
 *   • ms médio, percent 30     -> conexão caiu no meio do download
 *   • ms no teto, percent alto -> lento demais, timeout genuíno
 */
interface Conexao {
  effectiveType?: string;
  downlink?: number;
  type?: string;
  saveData?: boolean;
}

function lerConexao(): Conexao | null {
  try {
    const nav = navigator as Navigator & { connection?: Conexao };
    const c = nav.connection;
    if (!c) return null;
    return {
      effectiveType: c.effectiveType,
      downlink: c.downlink,
      type: c.type,
      saveData: c.saveData,
    };
  } catch {
    return null;
  }
}

/** Espaço livre estimado no device (quota de storage da origem). */
async function lerEspacoLivreMB(): Promise<number | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est || est.quota == null || est.usage == null) return null;
    return Math.round((est.quota - est.usage) / 1048576);
  } catch {
    return null;
  }
}

export type OrigemOta = "automatico" | "manual";

export interface ResultadoOta {
  /** "atualizando" = vai recarregar o WebView; nada mais a fazer. */
  estado: "atualizando" | "ja-atualizado" | "sem-suporte" | "falhou";
  versaoAtual?: string | null;
  versaoNova?: string | null;
  motivo?: string;
}

/**
 * Executa o ciclo de atualização. Exportada pra o botão manual do Perfil.
 *
 * `origem: "manual"` ignora o disjuntor e zera o contador: o disjuntor
 * existe pra impedir LOOP automático, e um toque deliberado do técnico
 * (tipicamente já no wi-fi, depois de ver que falhou) é justamente o caso
 * em que insistir é o certo.
 */
export async function executarAtualizacaoOta(
  { origem }: { origem: OrigemOta }
): Promise<ResultadoOta> {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform?.()) {
    return {
      estado: "sem-suporte",
      motivo: "A atualização automática só existe no aplicativo instalado.",
    };
  }
  const Updater = cap.Plugins?.CapacitorUpdater;
  if (!Updater) {
    return {
      estado: "sem-suporte",
      motivo: "Esta versão do APK não tem o módulo de atualização.",
    };
  }

  let progressHandle: PluginListenerHandle | null = null;
  let ultimoPercent = 0;
  let versaoAtual: string | null = null;
  let versaoNova: string | null = null;
  const t0 = Date.now();

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
    if (!res.ok) {
      return { estado: "falhou", motivo: `O servidor respondeu ${res.status} ao consultar a versão.` };
    }

    const manifest = (await res.json()) as { version?: string; url?: string };
    if (!manifest?.version || !manifest?.url) {
      return { estado: "falhou", motivo: "O manifesto de atualização veio incompleto." };
    }
    versaoNova = manifest.version;

    const cur = await withTimeout(Updater.current(), 8_000, "Updater.current()");
    versaoAtual = cur?.bundle?.version ?? null;
    if (versaoAtual === manifest.version) {
      clearAttempt(); // rodando na versão certa — trava antiga não vale mais
      return { estado: "ja-atualizado", versaoAtual, versaoNova };
    }

    // Disjuntor: a MESMA versão falhou demais há pouco e o manifesto segue
    // pedindo ela. Para de insistir sozinho — mas nunca barra pedido manual.
    const attempt = readAttempt();
    if (
      origem === "automatico" &&
      attempt &&
      attempt.version === manifest.version &&
      attempt.count >= OTA_ATTEMPT_MAX &&
      Date.now() - attempt.ts < OTA_ATTEMPT_WINDOW_MS
    ) {
      console.warn(
        `[useOtaUpdate] Versão ${manifest.version} falhou ${attempt.count}x nos últimos 10min — pausando tentativas.`
      );
      void import("@/lib/reportClientError").then(({ reportClientError }) =>
        reportClientError(
          `Disjuntor OTA acionado — versão ${manifest.version} falhou ${attempt.count}x`,
          "useOtaUpdate/circuitBreaker",
          {
            deVersao: versaoAtual,
            paraVersao: manifest.version,
            tentativas: attempt.count,
            conexao: lerConexao(),
          }
        )
      );
      // Aviso pequeno, não bloqueia o app — o técnico precisa saber que o
      // app SABE da atualização, senão "resetar os dados" vira o único jeito
      // de sentir que fez alguma coisa (e isso apaga a fila offline).
      useOtaStore.getState().pausada(manifest.version);
      window.setTimeout(() => {
        if (useOtaStore.getState().phase === "pausada") useOtaStore.getState().reset();
      }, 6_000);
      return {
        estado: "falhou",
        versaoAtual,
        versaoNova,
        motivo: "Tentativas pausadas após falhas seguidas. Toque em Atualizar para forçar.",
      };
    }
    if (origem === "manual") clearAttempt();

    console.log(`[useOtaUpdate] Atualização (${origem}): ${versaoAtual ?? "?"} → ${manifest.version}`);
    useOtaStore.getState().iniciarDownload(versaoAtual, manifest.version);

    // Conta a tentativa JÁ AQUI, antes de qualquer rede — falha de download
    // em sinal fraco também precisa contar, senão reabrir o app reinicia o
    // ciclo do zero indefinidamente.
    writeAttempt({
      version: manifest.version,
      count: attempt?.version === manifest.version ? attempt.count + 1 : 1,
      ts: Date.now(),
    });

    // Reaproveita um bundle DESTA versão já baixado e íntegro — evita
    // rebaixar tudo de novo numa rede ruim.
    let bundle: BundleInfo | null = null;
    try {
      const lista = await withTimeout(Updater.list?.() ?? Promise.resolve(undefined), 8_000, "Updater.list()");
      const existente = lista?.bundles?.find((b) => b.version === manifest.version && b.id);
      if (existente?.status === "success" || existente?.status === "pending") {
        bundle = existente;
        console.log(`[useOtaUpdate] Bundle ${manifest.version} já baixado — reaproveitando.`);
      } else if (existente?.status === "error") {
        // Download anterior ficou parcial/corrompido: apaga ANTES de tentar
        // de novo, senão o downloader nativo tenta retomar dele e trava no
        // mesmo ponto de sempre.
        console.log(`[useOtaUpdate] Bundle ${manifest.version} com status "error" — apagando antes de rebaixar.`);
        await Updater.delete?.({ id: existente.id }).catch(() => {});
      }
    } catch {
      /* list() indisponível — segue pro download */
    }

    // 5min: calibrado depois de um timeout de 60s causar falha genuína em
    // bundles grandes no campo. Generoso, mas finito.
    const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
    if (!bundle) {
      try {
        progressHandle = (await Updater.addListener?.("download", (e) => {
          if (typeof e?.percent === "number") {
            ultimoPercent = Math.max(ultimoPercent, Math.round(e.percent));
            useOtaStore.getState().setProgresso(e.percent);
          }
        })) as PluginListenerHandle | null;
      } catch {
        /* sem evento de progresso — a overlay usa barra animada */
      }
      bundle = await withTimeout(
        Updater.download({ url: manifest.url, version: manifest.version }),
        DOWNLOAD_TIMEOUT_MS,
        "Updater.download()"
      );
    }

    if (!bundle?.id) {
      useOtaStore.getState().reset();
      return { estado: "falhou", versaoAtual, versaoNova, motivo: "O download não retornou um pacote válido." };
    }

    // Marca ANTES do reload: a store morre no reload, o localStorage não.
    useOtaStore.getState().aplicando();
    try {
      window.localStorage.setItem(OTA_JUST_UPDATED_KEY, manifest.version);
    } catch {
      /* segue sem o marcador */
    }

    await withTimeout(Updater.set({ id: bundle.id }), 15_000, "Updater.set()");
    console.log(`[useOtaUpdate] Bundle ${manifest.version} aplicado — recarregando.`);
    return { estado: "atualizando", versaoAtual, versaoNova };
  } catch (err) {
    console.warn("[useOtaUpdate] Checagem OTA falhou:", err);
    const st = useOtaStore.getState();
    const ms = Date.now() - t0;
    const espacoLivreMB = await lerEspacoLivreMB();
    void import("@/lib/reportClientError").then(({ reportClientError }) =>
      reportClientError(
        err instanceof Error ? err.message : String(err),
        "useOtaUpdate/checagem",
        {
          origem,
          fase: st.phase,
          deVersao: versaoAtual ?? st.deVersao,
          paraVersao: versaoNova ?? st.paraVersao,
          // Os campos que tornam o log conclusivo — ver bloco "diagnóstico".
          ms,
          percent: ultimoPercent,
          online: typeof navigator !== "undefined" ? navigator.onLine : null,
          conexao: lerConexao(),
          espacoLivreMB,
        }
      )
    );
    if (st.phase === "baixando" || st.phase === "aplicando") {
      // set() pode ter travado antes do reload — limpa o marcador pra não
      // mostrar "Atualizado ✓" falso na próxima abertura.
      try {
        window.localStorage.removeItem(OTA_JUST_UPDATED_KEY);
      } catch {
        /* ignora */
      }
      st.erro();
      window.setTimeout(() => useOtaStore.getState().reset(), 2600);
    }
    return {
      estado: "falhou",
      versaoAtual,
      versaoNova,
      motivo: traduzErro(err, ultimoPercent, ms),
    };
  } finally {
    try {
      await progressHandle?.remove();
    } catch {
      /* ignora */
    }
  }
}

/** Transforma o erro cru do plugin em algo sobre o que o técnico possa agir. */
function traduzErro(err: unknown, percent: number, ms: number): string {
  const msg = err instanceof Error ? err.message : String(err);
  const seg = Math.round(ms / 1000);
  if (/Failed to download/i.test(msg)) {
    if (percent === 0) {
      return `A conexão recusou o download logo no início (${seg}s). Tente de novo, de preferência no Wi-Fi.`;
    }
    return `A conexão caiu com ${percent}% baixado (${seg}s). Tente de novo, de preferência no Wi-Fi.`;
  }
  if (/timeout|expirou/i.test(msg)) {
    return `Demorou demais (${seg}s, ${percent}% baixado). Procure um sinal melhor e tente de novo.`;
  }
  return `${msg} (${seg}s, ${percent}% baixado)`;
}

/** Versão do bundle em execução — pra mostrar no Perfil. */
export async function lerVersaoOtaAtual(): Promise<string | null> {
  const cap = getCapacitor();
  const Updater = cap?.Plugins?.CapacitorUpdater;
  if (!cap?.isNativePlatform?.() || !Updater) return null;
  try {
    const cur = await withTimeout(Updater.current(), 8_000, "Updater.current()");
    return cur?.bundle?.version ?? null;
  } catch {
    return null;
  }
}
