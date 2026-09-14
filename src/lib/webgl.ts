/**
 * Diagnóstico de WebGL — o mapa depende dele e o mapbox-gl v3 não perdoa.
 *
 * A v3 pede SÓ `webgl2`: o fallback pra WebGL1 que a v2 tinha não existe mais.
 * Sem contexto, ela lança "Failed to initialize WebGL" e a tela inteira morre
 * com uma mensagem que não diz nada pro usuário.
 *
 * Três agravantes que esta camada resolve:
 *
 *  1. `antialias: true` (que a camada 3D precisa pra não serrilhar) entra nos
 *     ATRIBUTOS do contexto. Em GPU fraca, driver na blocklist ou sessão
 *     remota, pedir antialias pode falhar onde um contexto simples passaria.
 *  2. O navegador tem teto de contextos WebGL vivos por aba (~16 no Chrome).
 *     O dashboard sozinho cria 5 mapas; com outras abas abertas o teto chega.
 *  3. GPU que suporta WebGL 1 mas não WebGL 2 — comum em máquina antiga. Aí
 *     não há o que fazer no cliente, e é importante SABER que é isso.
 *
 * Por isso o diagnóstico é reportado pro backend (/api/errors) quando falha:
 * sem esse dado, descobrir por que o mapa não abre no PC de outra pessoa vira
 * adivinhação por telefone.
 */

export type MotivoWebGL = "ok" | "so-sem-antialias" | "so-webgl1" | "sem-webgl";

export interface DiagnosticoWebGL {
  motivo: MotivoWebGL;
  /** true quando dá pra desenhar, ainda que sem antialias. */
  utilizavel: boolean;
  /** Suporta antialias no contexto webgl2? */
  antialias: boolean;
  /** Placa/driver reportados pelo navegador — o que decide blocklist. */
  gpu: string | null;
  /** Quantos contextos o navegador ainda aceita criar (teto ~16 no Chrome). */
  contextosLivres: number | null;
}

function criarContexto(versao: "webgl2" | "webgl", antialias: boolean): WebGLRenderingContext | WebGL2RenderingContext | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  try {
    return canvas.getContext(versao, { antialias, failIfMajorPerformanceCaveat: false }) as
      | WebGLRenderingContext
      | WebGL2RenderingContext
      | null;
  } catch {
    return null;
  }
}

/** Libera na hora: o teste não pode consumir uma das ~16 vagas da aba. */
function solta(gl: WebGLRenderingContext | WebGL2RenderingContext | null): void {
  (gl?.getExtension("WEBGL_lose_context") as { loseContext?: () => void } | null)?.loseContext?.();
}

function lerGpu(gl: WebGLRenderingContext | WebGL2RenderingContext): string | null {
  try {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null;
    if (dbg) return String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
    return String(gl.getParameter(gl.RENDERER));
  } catch {
    return null;
  }
}

/**
 * Quantos contextos ainda cabem. Só roda quando algo já falhou — abrir 16
 * canvases de sonda tem custo e não faz sentido no caminho feliz.
 */
function medirContextosLivres(): number | null {
  if (typeof document === "undefined") return null;
  const abertos: Array<WebGLRenderingContext | WebGL2RenderingContext> = [];
  let n = 0;
  try {
    for (; n < 20; n++) {
      const gl = criarContexto("webgl", false);
      if (!gl) break;
      abertos.push(gl);
    }
  } catch {
    /* o número que deu já serve */
  } finally {
    abertos.forEach(solta);
  }
  return n;
}

/** Roda antes de criar o mapa — barato no caminho feliz. */
export function diagnosticarWebGL(): DiagnosticoWebGL {
  const com = criarContexto("webgl2", true);
  if (com) {
    const gpu = lerGpu(com);
    solta(com);
    return { motivo: "ok", utilizavel: true, antialias: true, gpu, contextosLivres: null };
  }

  const sem = criarContexto("webgl2", false);
  if (sem) {
    const gpu = lerGpu(sem);
    solta(sem);
    return { motivo: "so-sem-antialias", utilizavel: true, antialias: false, gpu, contextosLivres: null };
  }

  // Nem webgl2 simples: distingue "GPU velha demais" de "sem WebGL nenhum",
  // porque a saída é diferente (uma não tem solução no cliente).
  const um = criarContexto("webgl", false);
  const gpu = um ? lerGpu(um) : null;
  solta(um);
  return {
    motivo: um ? "so-webgl1" : "sem-webgl",
    utilizavel: false,
    antialias: false,
    gpu,
    contextosLivres: medirContextosLivres(),
  };
}

/**
 * Manda o diagnóstico pro backend. Fire-and-forget e nunca lança — é o que
 * permite ver, em /painel/status, POR QUE o mapa não abriu na máquina de
 * alguém, em vez de depender do relato.
 */
export function relatarFalhaWebGL(rota: string, diag: DiagnosticoWebGL): void {
  try {
    void import("@/lib/reportClientError").then(({ reportClientError }) => {
      reportClientError(`Mapa não abriu — WebGL indisponível (${diag.motivo})`, rota, {
        motivo: diag.motivo,
        gpu: diag.gpu,
        contextosLivres: diag.contextosLivres,
        userAgent: typeof navigator === "undefined" ? null : navigator.userAgent,
        telaPx: typeof window === "undefined" ? null : `${window.innerWidth}x${window.innerHeight}`,
        pixelRatio: typeof window === "undefined" ? null : window.devicePixelRatio,
      });
    });
  } catch {
    /* reportar erro não pode gerar outro erro */
  }
}

/** Texto pro usuário — sem jargão e com o caminho da solução. */
export function explicarFalhaWebGL(diag?: DiagnosticoWebGL): { titulo: string; passos: string[] } {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const caminho = /Edg\//.test(ua)
    ? "edge://settings/system"
    : /Firefox\//.test(ua)
    ? "about:preferences (Desempenho)"
    : "chrome://settings/system";

  // Contextos esgotados tem solução imediata e diferente — vem primeiro.
  if (diag?.contextosLivres != null && diag.contextosLivres === 0) {
    return {
      titulo: "O navegador atingiu o limite de mapas abertos",
      passos: [
        "Feche as outras abas que estejam com mapa aberto — o navegador permite um número limitado de mapas ao mesmo tempo.",
        "Recarregue esta página.",
        "Se continuar, feche e abra o navegador.",
      ],
    };
  }

  if (diag?.motivo === "so-webgl1") {
    return {
      titulo: "A placa de vídeo deste computador é antiga demais para o mapa",
      passos: [
        "O navegador aqui só oferece WebGL 1, e o mapa precisa de WebGL 2.",
        `Tente atualizar o driver de vídeo e conferir se a aceleração de hardware está ligada em ${caminho}.`,
        "Se o computador for antigo, o mapa não vai abrir nele — as demais telas do painel funcionam normalmente.",
        diag.gpu ? `Placa detectada: ${diag.gpu}` : "",
      ].filter(Boolean),
    };
  }

  return {
    titulo: "O navegador não está conseguindo desenhar o mapa",
    passos: [
      `Abra ${caminho} e ligue "Usar aceleração de hardware quando disponível". Depois feche e abra o navegador.`,
      "Se já estiver ligada, feche as outras abas com mapa aberto — o navegador limita quantos mapas podem existir ao mesmo tempo.",
      "Em acesso remoto (VDI/RDP) a placa de vídeo costuma não ser repassada; nesse caso o mapa só funciona na máquina local.",
      "Persistindo, atualize o driver de vídeo — o navegador bloqueia drivers antigos por segurança.",
      diag?.gpu ? `Placa detectada: ${diag.gpu}` : "",
    ].filter(Boolean),
  };
}
