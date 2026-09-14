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

export function novoMapa(
  opcoes: mapboxgl.MapOptions,
  rota: string
): ResultadoMapa {
  const diagnostico = diagnosticarWebGL();

  if (!diagnostico.utilizavel) {
    relatarFalhaWebGL(rota, diagnostico);
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
    return { map: null, diagnostico };
  }
}
