/**
 * Feedback sonoro/tátil genérico pra ações de captura — usado pelo fluxo
 * guiado de Instalação. Não depende de nada de vistoria; extraído como
 * util genérico pra não duplicar a lógica em cada módulo novo que precisar
 * do mesmo tipo de feedback.
 */
let audioCtx: AudioContext | null = null;

export function chime(freq = 880, duration = 0.15) {
  if (typeof window === "undefined") return;
  try {
    audioCtx ||= new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain).connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    /* ignore */
  }
}

export function buzz(pattern: number | number[] = 60) {
  if (typeof navigator === "undefined") return;
  if ("vibrate" in navigator) navigator.vibrate(pattern);
}
