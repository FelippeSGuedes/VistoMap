/**
 * Diagnóstico de WebGL — o mapa depende dele e o mapbox-gl v3 não perdoa.
 *
 * A v3 pede SÓ `webgl2`: não existe mais o fallback pra WebGL1 que a v2 tinha.
 * Se o navegador não entregar, ele lança "Failed to initialize WebGL" e a tela
 * inteira morre com uma mensagem que não diz nada pro usuário.
 *
 * Dois agravantes que esta camada resolve:
 *
 *  1. `antialias: true` (que a camada 3D precisa pra não serrilhar) entra nos
 *     atributos do contexto. Em GPU fraca, driver na blocklist ou sessão
 *     remota, pedir antialias pode falhar onde um contexto simples passaria —
 *     então vale tentar de novo sem ele antes de desistir.
 *  2. Navegador tem teto de contextos WebGL vivos por aba (~16 no Chrome).
 *     Com várias telas de mapa abertas, o teto é atingido e a mensagem é
 *     exatamente a mesma — por isso o diagnóstico separa os dois casos.
 */

export type MotivoWebGL = "sem-webgl2" | "so-sem-antialias" | "ok";

export interface DiagnosticoWebGL {
  motivo: MotivoWebGL;
  /** true quando dá pra desenhar, ainda que sem antialias. */
  utilizavel: boolean;
}

function tentaContexto(antialias: boolean): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2", { antialias, failIfMajorPerformanceCaveat: false });
  } catch {
    return false;
  }
  if (!gl) return false;
  // Libera na hora: este teste não pode consumir uma das ~16 vagas da aba.
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
}

/** Roda antes de criar o mapa — barato e sem efeito colateral. */
export function diagnosticarWebGL(): DiagnosticoWebGL {
  if (tentaContexto(true)) return { motivo: "ok", utilizavel: true };
  if (tentaContexto(false)) return { motivo: "so-sem-antialias", utilizavel: true };
  return { motivo: "sem-webgl2", utilizavel: false };
}

/** Texto pro usuário — sem jargão e com o caminho da solução. */
export function explicarFalhaWebGL(): { titulo: string; passos: string[] } {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const ehEdge = /Edg\//.test(ua);
  const ehFirefox = /Firefox\//.test(ua);
  const caminho = ehEdge
    ? "edge://settings/system"
    : ehFirefox
    ? "about:preferences (Desempenho)"
    : "chrome://settings/system";

  return {
    titulo: "O navegador não está conseguindo desenhar o mapa",
    passos: [
      `Abra ${caminho} e ligue "Usar aceleração de hardware quando disponível". Depois feche e abra o navegador.`,
      "Se já estiver ligada, feche as outras abas com mapa aberto — o navegador limita quantos mapas podem existir ao mesmo tempo.",
      "Em acesso remoto (VDI/RDP) a placa de vídeo costuma não ser repassada; nesse caso o mapa só funciona na máquina local.",
      "Persistindo, atualize o driver de vídeo — o navegador bloqueia drivers antigos por segurança.",
    ],
  };
}
