import mapboxgl from "mapbox-gl";
import { diagnosticarWebGL, relatarFalhaWebGL, type DiagnosticoWebGL } from "./webgl";

/**
 * Criação de mapa à prova de máquina sem WebGL.
 *
 * `new mapboxgl.Map(...)` LANÇA quando o navegador não entrega um contexto
 * webgl2, e como isso acontece dentro de um useEffect a exceção sobe pro error
 * boundary e derruba a página inteira — inclusive telas onde o mapa é só um
 * pedaço (o dashboard tem cinco).
 *
 * Aqui a falha vira um retorno `null`: quem chama decide se mostra um aviso no
 * lugar do mapa ou se a tela inteira explica. E o diagnóstico vai pro backend,
 * porque o problema quase sempre acontece na máquina de outra pessoa.
 */
export interface ResultadoMapa {
  map: mapboxgl.Map | null;
  diagnostico: DiagnosticoWebGL;
}

/**
 * Sem mapa, o container ficaria como uma caixa vazia sem explicação — e o
 * dashboard tem cinco. Escrever o aviso aqui cobre TODAS as telas de uma vez,
 * sem mexer em nenhum ponto de chamada.
 */
function avisarNoLugarDoMapa(container: mapboxgl.MapOptions["container"], motivo: string): void {
  const el = typeof container === "string" ? document.getElementById(container) : container;
  if (!el || !(el instanceof HTMLElement)) return;
  if (el.querySelector("[data-vm-sem-mapa]")) return;
  const aviso = document.createElement("div");
  aviso.setAttribute("data-vm-sem-mapa", "");
  aviso.style.cssText =
    "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:6px;padding:16px;text-align:center;" +
    "font:500 12px/1.4 system-ui,sans-serif;color:var(--vm-faint,#9CA3AF);" +
    "background:var(--vm-tile,rgba(127,127,127,0.06));border-radius:12px;";
  aviso.innerHTML =
    '<span style="font-size:18px;line-height:1">🗺️</span>' +
    '<strong style="font-weight:600;color:var(--vm-muted,#6B7280)">Mapa indisponível neste computador</strong>' +
    `<span>${motivo}</span>`;
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  el.appendChild(aviso);
}

export function novoMapa(
  opcoes: mapboxgl.MapOptions,
  rota: string
): ResultadoMapa {
  const diagnostico = diagnosticarWebGL();

  if (!diagnostico.utilizavel) {
    relatarFalhaWebGL(rota, diagnostico);
    avisarNoLugarDoMapa(
      opcoes.container,
      diagnostico.motivo === "so-webgl1"
        ? "A placa de vídeo só suporta WebGL 1 e o mapa precisa de WebGL 2."
        : "Ative a aceleração de hardware do navegador e recarregue."
    );
    return { map: null, diagnostico };
  }

  // O antialias é o atributo que mais falha em GPU fraca. Se o diagnóstico já
  // disse que só passa sem ele, desce pro modo compatível em vez de insistir
  // e perder o mapa inteiro — 3D levemente serrilhado > mapa nenhum.
  const antialias = opcoes.antialias === true && diagnostico.antialias;

  try {
    return { map: new mapboxgl.Map({ ...opcoes, antialias }), diagnostico };
  } catch (err) {
    // Passou no teste e mesmo assim falhou: quase sempre é o teto de contextos
    // da aba, que muda entre o teste e a criação real.
    console.error(`[vm] mapa não inicializou em ${rota}`, err);
    relatarFalhaWebGL(rota, diagnostico);
    avisarNoLugarDoMapa(opcoes.container, "Feche outras abas com mapa aberto e recarregue.");
    return { map: null, diagnostico };
  }
}
