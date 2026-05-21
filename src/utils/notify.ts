/**
 * notify() — wrapper de notificação local enriquecida.
 *
 * Combina:
 *  • Notification API do browser (com fallback silencioso quando bloqueado)
 *  • Som curto via WebAudio (chime) — não depende de arquivo externo
 *  • Vibração via Vibration API (mobile)
 *
 * Útil pra avisar técnico sobre eventos enquanto a aba está aberta:
 *  - novas vistorias atribuídas
 *  - sincronização concluída
 *  - mensagens do admin (futuro)
 */

export type NotifyTone = "info" | "success" | "warn" | "alert";

interface NotifyOptions {
  title: string;
  body?: string;
  /** URL relativa de ícone (32×32). Default: favicon. */
  icon?: string;
  tone?: NotifyTone;
  /** ID único — notifications com mesmo tag substituem em vez de empilhar. */
  tag?: string;
  /** Callback ao clicar na notificação. */
  onClick?: () => void;
  /** Não toca som/vibração. */
  silent?: boolean;
}

let audioCtx: AudioContext | null = null;

function chime(tone: NotifyTone) {
  if (typeof window === "undefined") return;
  try {
    audioCtx ||= new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    // Dois tons em sequência — cria sensação de "ping" enterprise.
    const seq: Array<[number, number]> =
      tone === "alert"
        ? [
            [660, 0.0],
            [520, 0.18],
          ]
        : tone === "warn"
        ? [
            [520, 0.0],
            [620, 0.14],
          ]
        : tone === "success"
        ? [
            [880, 0.0],
            [1175, 0.12],
          ]
        : [
            [800, 0.0],
            [1000, 0.12],
          ];
    for (const [freq, delay] of seq) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g).connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + delay;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }
  } catch {
    /* ignore */
  }
}

function buzz(tone: NotifyTone) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  const pattern: number[] =
    tone === "alert"
      ? [80, 60, 80, 60, 120]
      : tone === "warn"
      ? [60, 40, 60]
      : tone === "success"
      ? [40]
      : [50];
  navigator.vibrate(pattern);
}

/**
 * Dispara notificação se permissão concedida. Sempre dispara som+vibração
 * (a menos que silent=true), funciona como feedback mesmo sem Notification.
 */
export function notify(opts: NotifyOptions): boolean {
  const tone = opts.tone ?? "info";
  if (!opts.silent) {
    chime(tone);
    buzz(tone);
  }

  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return false;
  }
  if (Notification.permission !== "granted") return false;

  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      icon: opts.icon ?? "/logo_favicon.PNG",
      tag: opts.tag,
      badge: "/logo_favicon.PNG",
      // @ts-expect-error renotify existe em Chrome/Android mas não no DOM lib
      renotify: !!opts.tag,
      silent: false,
    });
    if (opts.onClick) {
      n.onclick = () => {
        window.focus();
        opts.onClick?.();
        n.close();
      };
    }
    // Auto-close depois de 8s pra não poluir.
    window.setTimeout(() => {
      try {
        n.close();
      } catch {
        /* ignore */
      }
    }, 8000);
    return true;
  } catch {
    return false;
  }
}

/** Variante "in-app" — só som+vibra, sem permissão. Pra eventos discretos. */
export function notifySilent(tone: NotifyTone = "info") {
  chime(tone);
  buzz(tone);
}
