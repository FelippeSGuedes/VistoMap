"use client";

/**
 * TechModel3DLayer — camada 3D (Three.js) dentro do Mapbox GL JS que
 * desenha UM objeto por técnico visível: um carrinho procedural (geometria
 * Three.js pura, rodas animadas) seguindo a rota real quando em
 * deslocamento, ou um "beacon" (anel + núcleo) quando parado/em vistoria.
 *
 * O carro já foi tentado como modelo importado (car.glb, ~17MB, exportado
 * via IA/Tripo) — teve dois problemas sérios em produção: material
 * metálico sem environment map renderiza preto, e COM environment map
 * (RoomEnvironment) vira espelho refletindo as paredes do ambiente
 * sintético (parece manchas/geometria quebrada num ícone pequeno). Depois
 * disso descobrimos que o mesh tinha ~502 mil faces — pesado demais pra um
 * ícone de mapa e arriscado pra precisão de float na escala minúscula do
 * Mercator. Um carrinho geométrico (caixas + cilindros) resolve tudo isso:
 * não depende de luz/reflexo pra parecer certo, não tem arquivo pra
 * carregar, e tem controle total sobre a animação (rodas giram conforme a
 * distância real percorrida na rota).
 *
 * Evolução da POC (Fase 0, 1 objeto só) — mudança de arquitetura: antes a
 * posição do único objeto ia embutida direto na matriz da câmera
 * (`camera.projectionMatrix = mapboxMatrix * (translate·scale)`), o que só
 * funciona pra 1 objeto. Agora a câmera recebe a matriz do Mapbox CRUA, e
 * cada objeto ganha posição/rotação/escala própria via
 * uma matriz própria montada a cada frame (ver render()), igual várias libs
 * de integração Mapbox+Three.js fazem pra múltiplos modelos numa cena só.
 *
 * Pré-requisito OBRIGATÓRIO no mapa hospedeiro: projeção "mercator" (ver
 * chamadas de map.setProjection() em page.tsx).
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import mapboxgl from "mapbox-gl";
import { asset } from "@/utils/asset";
import { sampleRouteAt, projectOntoRoute, type RouteResult } from "./routeService";

export const TECH_MODEL_LAYER_ID = "vm-tech-3d-model";

const TWEEN_MS = 800; // mesma duração do animateMarkerTo (page.tsx)
const MODEL_COLOR = 0x00d4a0; // mesmo teal-neon usado no resto da identidade visual

// Ligar só ao investigar a camada 3D — alguns destes logs disparam por
// técnico a cada poll e poluem o console em produção.
const DEBUG_LOG = false;

// Dimensões do carrinho, em metros REAIS de carro de passeio — depois
// multiplicadas por CAR_EXAGGERATION.
//
// Um carro em tamanho real (3.9m) é pequeno demais pra ler como ícone de
// mapa: no print onde os dois apareciam juntos, o beacon (20m de diâmetro)
// renderizava sólido e nítido enquanto o carro do lado era uma manchinha
// escura de poucos pixels. Marcador de veículo em mapa 3D é sempre
// exagerado — o objetivo é ser reconhecível no zoom de operação, não estar
// em escala com as ruas.
//
// Eixo local: X = largura, Y = comprimento ("frente" = +Y antes da rotação
// de heading), Z = altura (Z é o "up" do embedding do Mapbox, não o Y do
// Three.js padrão — ver a montagem de matriz em render()).
const CAR_EXAGGERATION = 3.5;
const CAR_WIDTH = 1.85 * CAR_EXAGGERATION;
const CAR_BODY_LENGTH = 3.9 * CAR_EXAGGERATION;
const CAR_BODY_HEIGHT = 0.85 * CAR_EXAGGERATION;
const CAR_CABIN_WIDTH = 1.55 * CAR_EXAGGERATION;
const CAR_CABIN_LENGTH = 2.1 * CAR_EXAGGERATION;
const CAR_CABIN_HEIGHT = 0.62 * CAR_EXAGGERATION;
const CAR_WHEEL_RADIUS = 0.33 * CAR_EXAGGERATION;
const CAR_WHEEL_WIDTH = 0.24 * CAR_EXAGGERATION;

// ---------------------------------------------------------------------------
// Tamanho na tela.
//
// O veículo é modelado em tamanho REAL (uma picape de ~5m). Isso o deixa
// proporcional à rua no zoom de operação, mas some quando o mapa é afastado:
// a 5m de comprimento ele vira menos de um pixel numa visão de cidade, e aí
// não dá pra achar o técnico.
//
// Solução padrão de marcador: a partir do momento em que o veículo ficaria
// menor que CAR_MIN_PX na tela, ele para de encolher e passa a crescer em
// metros na mesma proporção em que o zoom diminui — mantendo tamanho
// constante em pixels. Perto = realista; longe = marcador sempre visível.
// ---------------------------------------------------------------------------
const CAR_REAL_LENGTH_M = 5;
const CAR_MIN_PX = 46;

/** Idem pro beacon do técnico parado (diâmetro do anel). */
const IDLE_MIN_PX = 90;
/**
 * Teto de ampliacao da figura — ver fatorTamanhoMinimo().
 *
 * Era 5, o que deixava quem estava longe quase invisivel. O teto baixo era
 * remendo pra distorcao de medir pixels-por-metro no centro do mapa; com a
 * medicao feita na posicao de cada tecnico, o fator ja sai correto e o teto
 * volta a ser so uma trava de seguranca contra valores extremos.
 */
const PIN_MAX_FATOR = 40;


// car.glb é o modelo real (modelado pelo usuário). O carrinho geométrico
// continua no código como fallback: aparece enquanto os 17MB carregam e
// fica permanentemente se o download falhar. Virar `false` aqui volta pro
// carrinho geométrico sem mexer em mais nada.
const USE_CAR_MODEL = true;

// GLTF é Y-up; o embedding do Mapbox é Z-up. Depois desta rotação o modelo
// mede (medido no arquivo, escala 1): 0.487 largura x 1.000 comprimento x
// 0.411 altura, com o comprimento no eixo Y local.
//
// A frente do modelo fica em glTF +Z (ele NÃO segue a convenção de -Z) —
// determinado medindo o arquivo, ver o comentário sobre heading em render().
// Essa rotação leva +Z pra -Y local, que é o norte do Mercator, e é por isso
// que o heading entra sem offset.
//
// Se um dia o modelo for trocado por outro e o veículo andar de ré, o ajuste
// é CAR_MODEL_FLIP — mas confira a frente do novo arquivo antes, em vez de
// tentar por tentativa e erro.
const CAR_BASE_ROTATION_X = Math.PI / 2;
const CAR_MODEL_FLIP = false;

/** Piso de luminosidade (HSL) das cores do car.glb — nada renderiza preto. */
const CAR_MIN_LIGHTNESS = 0.3;

/** true = modelo sem iluminação (só a textura). Ver prepareCarTemplate(). */
const CAR_UNLIT = true;

// Reaproveitados a cada frame só pra não alocar Matrix4 por técnico por
// frame (render() roda a 60fps enquanto há tween ativo).
const SCRATCH_SCALE = new THREE.Matrix4();
const SCRATCH_ROT = new THREE.Matrix4();
const SCRATCH_MODELO = new THREE.Matrix4();
const SCRATCH_ROT2 = new THREE.Matrix4();

// ---------------------------------------------------------------------------
// Template do car.glb — MÓDULO, não instância.
//
// switchLayer() cria uma TechModel3DLayer NOVA a cada style.load (entrar no
// 3D, trocar pra satélite e voltar, alternar tema). Com o template preso à
// instância, cada uma dessas trocas rebaixava/reprocessava os 17MB e 502 mil
// faces do zero — e durante todo esse tempo os técnicos apareciam com o
// carrinho geométrico de fallback. Era isso que dava a impressão de que o
// modelo "não voltou": ele voltava, e a troca de estilo seguinte o derrubava.
// No escopo do módulo o download e o parse acontecem UMA vez por página.
// ---------------------------------------------------------------------------
let sharedCarTemplate: THREE.Object3D | null = null;
let sharedCarPromise: Promise<THREE.Object3D> | null = null;

function prepareCarTemplate(root: THREE.Object3D): THREE.Object3D {
  root.rotation.x = CAR_BASE_ROTATION_X;
  if (CAR_MODEL_FLIP) root.rotation.y = Math.PI;
  root.updateMatrixWorld(true);

  // Escala derivada do próprio modelo, não chutada: o GLB veio normalizado
  // num cubo unitário (não em metros), então medir e ajustar pro comprimento
  // alvo é o único jeito estável — se o modelo for reexportado com outra
  // escala, isso continua certo.
  const size = new THREE.Vector3();
  new THREE.Box3().setFromObject(root).getSize(size);
  root.scale.setScalar(CAR_REAL_LENGTH_M / (size.y || 1));

  // Ajuste de material. O car.glb é uma picape TEXTURIZADA (basecolor +
  // metallicRoughness + normal embutidos) e SEM baseColorFactor — ou seja,
  // toda a cor vem da textura e m.color é branco.
  //
  // Isso quebrava a "rede de segurança contra preto" que existia aqui antes:
  // ela levantava m.color (inútil, já era branco) e somava emissive da
  // própria cor, o que virava um véu branco de 22% por cima da textura e
  // lavava a pintura inteira num cinza chapado. A rede só faz sentido em
  // material de cor sólida; com textura ela só atrapalha.
  const hsl = { h: 0, s: 0, l: 0 };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    // CAMINHO SEM ILUMINAÇÃO (padrão).
    //
    // MeshBasicMaterial não calcula luz nenhuma: mostra a textura de cor como
    // ela é. Isso foi introduzido pra descartar de uma vez a hipótese de
    // iluminação — e descartou: com ele os polígonos pretos CONTINUARAM,
    // provando que metalness, normais, tangentes, luz hemisférica e sinal do
    // determinante nunca foram a causa dos recortes.
    //
    // Fica como padrão mesmo assim: num ícone de mapa é aceitável e até
    // desejável, porque o veículo fica igualmente legível em qualquer ângulo
    // e nunca escurece contra o asfalto claro. CAR_UNLIT=false volta ao PBR.
    if (CAR_UNLIT) {
      const flat = mats.map((mat) => {
        const src = mat as THREE.MeshStandardMaterial;
        const basic = new THREE.MeshBasicMaterial({
          map: src.map ?? null,
          color: src.map ? 0xffffff : src.color.clone(),

          // DoubleSide porque a malha gerada por IA (Tripo) não é watertight:
          // tem faces com orientação invertida, que o descarte de faces
          // traseiras eliminava — apareciam como buracos na carroceria e nas
          // portas. Com profundidade ligada, desenhar os dois lados é seguro:
          // o depth buffer resolve a ordem corretamente.
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: true,
        });
        if (DEBUG_LOG) {
          // eslint-disable-next-line no-console
          console.log(`[vm-3d] material sem luz: textura=${!!src.map}`);
        }
        return basic;
      });
      mesh.material = flat.length === 1 ? flat[0] : flat;
      return;
    }

    mats.forEach((mat) => {
      const m = mat as THREE.MeshPhysicalMaterial;
      if (!m.isMeshStandardMaterial) return;

      // O GLB declara KHR_materials_volume, que o Three.js traduz em material
      // de vidro (thickness/transmission). Numa carroceria opaca isso deixa a
      // superfície leitosa e sem forma definida.
      if ("transmission" in m) m.transmission = 0;
      if ("thickness" in m) m.thickness = 0;

      // Superfície 100% dielétrica (sem metal nenhum). Metalness alto sem
      // environment map renderiza PRETO, e dar reflexo (RoomEnvironment) fez
      // o carro virar espelho refletindo as paredes do ambiente sintético —
      // sem env map, fosco é o único caminho que funciona.
      //
      // Só baixar m.metalness não bastava: o GLB traz metallicRoughnessTexture,
      // e nesse caso m.metalness/m.roughness são apenas MULTIPLICADORES da
      // textura, que reintroduz metal pixel a pixel. Por isso os mapas são
      // removidos, não só os escalares — foi o que manteve a picape preta
      // mesmo com o clamp em 0.4.
      m.metalness = 0;
      m.metalnessMap = null;
      m.roughness = 0.75;
      m.roughnessMap = null;
      m.envMapIntensity = 0;
      m.flatShading = false; // ver comentário em onAdd — quebra com matriz espelhada

      // Sem normal map: MESMA armadilha do flatShading. O GLB traz só
      // POSITION/NORMAL/TEXCOORD_0 — não tem TANGENT. Sem tangentes o
      // Three.js deriva o sistema tangente no shader por derivadas de tela,
      // e com a matriz espelhada do Mercator (Y negativo, determinante < 0)
      // esse frame sai invertido: a normal aponta pra dentro, a luz bate por
      // trás e a superfície renderiza PRETA. Foi o que deixou a picape
      // "escondida atrás de uma camada preta" mesmo com a textura de cor
      // aplicada corretamente. Sem o normal map perde-se relevo fino, mas a
      // pintura (que é o que identifica o veículo no mapa) aparece.
      m.normalMap = null;

      if (m.map) {
        m.emissiveIntensity = 0; // deixa a textura falar por si
      } else {
        // Sem textura: aí sim vale o piso de luminosidade, pra um material
        // de cor sólida escura não sumir em preto.
        m.color.getHSL(hsl);
        if (hsl.l < CAR_MIN_LIGHTNESS) m.color.setHSL(hsl.h, hsl.s, CAR_MIN_LIGHTNESS);
        m.emissive.copy(m.color);
        m.emissiveIntensity = 0.22;
      }
      m.needsUpdate = true;

      if (DEBUG_LOG) {
        // eslint-disable-next-line no-console
        console.log(
          `[vm-3d] material "${m.name || "(sem nome)"}": corTextura=${!!m.map} ` +
          `normalMap=${!!m.normalMap} corBase=#${m.color.getHexString()} ` +
          `metalness=${m.metalness} roughness=${m.roughness}`
        );
      }
    });
  });

  if (DEBUG_LOG) {
    const finalSize = new THREE.Vector3();
    new THREE.Box3().setFromObject(root).getSize(finalSize);
    // eslint-disable-next-line no-console
    console.log(
      `[vm-3d] car.glb pronto (1x por página) — ${finalSize.x.toFixed(1)} x ` +
      `${finalSize.y.toFixed(1)} x ${finalSize.z.toFixed(1)} m`
    );
  }
  return root;
}

// ---------------------------------------------------------------------------
// Template do person.glb — mesmo padrão do carro: módulo, não instância, pra
// não rebaixar/reprocessar a cada troca de estilo de mapa.
// ---------------------------------------------------------------------------
let sharedPersonTemplate: THREE.Object3D | null = null;
let sharedPersonPromise: Promise<THREE.Object3D> | null = null;

function preparePersonTemplate(root: THREE.Object3D): THREE.Object3D {
  // Convenção glTF padrão: Y pra cima → Z pra cima (vertical do Mapbox).
  //
  // Aqui eu tinha tentado adivinhar a orientação com a heurística "o eixo mais
  // longo é a altura". Ela deitou o capacete, e por um motivo instrutivo: a
  // regra vale pra uma PESSOA, mas um capacete é MAIS LARGO QUE ALTO — o eixo
  // mais longo dele é um diâmetro horizontal. Medir a caixa não diz qual eixo
  // é "cima"; só a convenção do formato diz. As dimensões do arquivo
  // (1.44 x 1.02 x 1.90) batem com Y-up: altura 1.02, footprint 1.44 x 1.90.
  root.rotation.x = Math.PI / 2;

  root.updateMatrixWorld(true);
  const cx = new THREE.Box3().setFromObject(root);
  const tam = new THREE.Vector3();
  cx.getSize(tam);
  root.scale.setScalar(PERSON_ALTURA_M / (tam.z || 1));

  // Assenta a base no chão: o modelo vem centrado na origem, então metade
  // dele ficaria enterrada abaixo do plano do mapa.
  root.updateMatrixWorld(true);
  const cx2 = new THREE.Box3().setFromObject(root);
  root.position.z -= cx2.min.z;

  root.traverse((o) => {
    const malha = o as THREE.Mesh;
    if (!malha.isMesh) return;
    // Sem NORMAL no arquivo, a iluminação não tem o que calcular e a figura
    // sai chapada/preta. Calcular aqui é barato e roda uma vez só.
    if (!malha.geometry.getAttribute("normal")) malha.geometry.computeVertexNormals();
  });

  if (DEBUG_LOG) {
    const f = new THREE.Vector3();
    new THREE.Box3().setFromObject(root).getSize(f);
    // eslint-disable-next-line no-console
    console.log(`[vm-3d] person1.glb pronto — ${f.x.toFixed(1)} x ${f.y.toFixed(1)} x ${f.z.toFixed(1)} m`);
  }
  return root;
}

function loadPersonTemplateOnce(): Promise<THREE.Object3D> {
  if (sharedPersonPromise) return sharedPersonPromise;
  sharedPersonPromise = new Promise<THREE.Object3D>((resolve, reject) => {
    new GLTFLoader().load(
      asset("/person1.glb"),
      (gltf) => {
        sharedPersonTemplate = preparePersonTemplate(gltf.scene);
        resolve(sharedPersonTemplate);
      },
      undefined,
      (err) => {
        sharedPersonPromise = null;
        reject(err);
      }
    );
  });
  return sharedPersonPromise;
}

function loadCarTemplateOnce(): Promise<THREE.Object3D> {
  if (sharedCarPromise) return sharedCarPromise;
  sharedCarPromise = new Promise<THREE.Object3D>((resolve, reject) => {
    new GLTFLoader().load(
      asset("/car.glb"),
      (gltf) => {
        sharedCarTemplate = prepareCarTemplate(gltf.scene);
        resolve(sharedCarTemplate);
      },
      undefined,
      (err) => {
        // Deixa tentar de novo numa próxima camada em vez de travar o
        // fallback pra sempre numa falha de rede pontual.
        sharedCarPromise = null;
        reject(err);
      }
    );
  });
  return sharedCarPromise;
}

// Corpo escuro (verde-petróleo) lido em produção como uma mancha preta sem
// contraste com o asfalto claro, num objeto baixo visto de ângulo raso —
// mesmo padrão que apareceu em toda tentativa anterior (material metálico,
// ambiente sintético, material fosco escuro). Corpo agora usa o MESMO teal
// do beacon, com emissive pra nunca depender do ângulo de luz pra ficar
// visível — beacon já usa MeshBasicMaterial (sempre na cor cheia) pelo
// mesmo motivo.
const CAR_BODY_COLOR = MODEL_COLOR;
const CAR_CABIN_COLOR = 0x0a1f1c; // vidro escuro — contraste contra o corpo teal
const CAR_WHEEL_COLOR = 0x161616;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function tweenFrac(tweenStart: number): number {
  const t = Math.min((performance.now() - tweenStart) / TWEEN_MS, 1);
  return easeOutCubic(t);
}

interface MercatorXY {
  x: number;
  y: number;
}

export interface TechEntrySpec {
  usersId: number;
  nome: string;
  lng: number;
  lat: number;
  /** Velocidade do GPS, km/h — alimenta a extrapolação entre posições. */
  speedKmh: number | null;
  /** Cor do status operacional do técnico (o painel é dono da semântica). */
  corHex: string;
  /** Presente = "carro seguindo rota"; null = "pin parado". */
  route: RouteResult | null;
}

// ---------------------------------------------------------------------------
// Pin do técnico parado.
//
// Com o modo 3D virando o padrão do painel, o marcador de quem está parado
// deixa de ser um detalhe e passa a ser metade do que se vê no mapa — então
// precisa estar no mesmo nível de acabamento da picape, não o anel simples
// que existia antes.
//
// Anatomia, de baixo pra cima:
//   - disco no chão, marcando o ponto exato;
//   - anel de radar que se expande e some, em loop — chama o olho sem poluir;
//   - haste vertical semitransparente: com o mapa inclinado, é ela que diz a
//     que ponto do chão a cabeça flutuante pertence (sem isso o marcador
//     "flutua" ambíguo sobre o mapa);
//   - cabeça facetada com leve sobe-e-desce e giro lento.
//
// Tudo na cor do status operacional, que o painel já define (statusColor).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Modelo do técnico parado (person.glb).
//
// Substitui o "farol de operação" anterior (plataforma hexagonal + coluna de
// luz + núcleo girando + anel orbital): cinco elementos animados num marcador
// viravam ficção científica num painel operacional. Aqui a figura carrega o
// significado e o cenário em volta é mínimo — um disco no chão pra ancorar e
// um pulso discreto pra localizar de longe.
//
// O GLB vem SEM material e SEM NORMAIS (só POSITION). Ambos são resolvidos no
// carregamento: normais calculadas na hora (sem elas a iluminação não tem
// como funcionar) e cor aplicada por código, que é o que permite a figura
// acompanhar o status do técnico em vez de ter cor fixa na textura.
// ---------------------------------------------------------------------------
// Altura do marcador. person1.glb e uma FIGURA EM PE (proporcao 1 : 0.39 :
// 0.36 no arquivo), diferente do capacete anterior que era mais largo que
// alto. Um pouco acima do natural pra ter presenca ao lado da picape de 5 m
// sem virar um gigante.
const PERSON_ALTURA_M = 3.6;
const USE_PERSON_MODEL = true;

const PIN_BASE_R = 3.4;       // raio da plataforma hexagonal
const PIN_COLUNA_H = 9;       // altura da coluna de luz
const PIN_NUCLEO_Z = 10.6;    // altura do núcleo flutuante
const PIN_NUCLEO_R = 1.9;
const PIN_ORBITA_R = 3.0;
const PIN_PULSO_MS = 2800;    // ciclo de um pulso de radar
const PIN_BOB_MS = 2600;      // sobe-e-desce do núcleo
/** Diâmetro de referência do pin pro piso de tamanho em pixels. */
/** Referencia do piso em pixels: a ALTURA da figura, que e o que se ve. */
const PIN_FOOTPRINT_M = PERSON_ALTURA_M;

// ---------------------------------------------------------------------------
// Movimento: extrapolação por velocidade ("dead reckoning").
//
// Sem isso o carro dava um pulo de 800ms e ficava parado ~4s até o próximo
// poll — o "anda-congela-anda" que tirava todo o realismo. E, pior, sempre
// mostrava onde o técnico ESTEVE: o celular só reporta a cada 30m percorridos
// (uns 3s a 40km/h) ou a cada 30s parado, e o painel ainda soma o próprio
// ciclo de 5s.
//
// Agora o progresso na rota avança CONTINUAMENTE, quadro a quadro, usando a
// velocidade que o próprio GPS já reporta. Quando chega posição nova, a
// diferença é absorvida gradualmente (controle proporcional) em vez de
// saltar. É a mesma ideia de navegação do Waze/Uber.
//
// A velocidade decai exponencialmente com o tempo desde a última posição
// nova. Isso resolve sozinho o caso do técnico parar num semáforo: como o
// filtro de distância do app para de emitir quando ele não anda, a idade
// cresce, a velocidade estimada cai e o carro desacelera até parar — em vez
// de sair viajando sozinho e depois ser puxado de volta.
// ---------------------------------------------------------------------------

/** Meia-vida da confiança na velocidade, em ms. */
const SPEED_DECAY_TAU_MS = 7000;
/** Quanto do erro de posição é corrigido por segundo (0..1 por segundo). */
const CORRECTION_GAIN = 1.6;
/** Acima disto (metros) não vale corrigir suave — salta (rota nova, teleporte). */
const SNAP_ERROR_M = 200;

interface TechEntry {
  usersId: number;
  kind: "car" | "idle";
  object3d: THREE.Group; // container — posição/rotação/escala setadas a cada frame
  visual: THREE.Object3D | null; // filho atual (carrinho ou beacon)
  visualIsCar: boolean;
  wheels: THREE.Mesh[] | null; // só quando visual = carrinho — girados por distância percorrida
  route: RouteResult | null;

  /** Progresso EXIBIDO na rota (m). Avança todo frame; ver dead reckoning. */
  distM: number;
  /** Progresso medido na última posição de GPS recebida (m). */
  alvoDistM: number;
  /** Velocidade estimada, m/s — do GPS, com decaimento por idade. */
  speedMps: number;
  /** Quando chegou a última posição REALMENTE nova (performance.now()). */
  ultimaPosicaoEm: number;

  fromXY: MercatorXY; // tween linear — kind="idle" (ou "car" sem rota resolvida ainda)
  toXY: MercatorXY;
  z: number;
  tweenStart: number;

  nome: string;
  corHex: string;
  /** Etiqueta flutuante com o nome, reposicionada a cada frame. */
  label: mapboxgl.Marker | null;
  /** Última coordenada recebida — detecta se o poll trouxe posição nova. */
  ultimoLng?: number;
  ultimoLat?: number;
  /** Partes animadas do pin parado (ver buildIdlePin). */
  pinPulsos?: THREE.Mesh[];
  pinNucleo?: THREE.Object3D;
  pinOrbita?: THREE.Object3D;
  pinColuna?: THREE.Mesh;
}

/** "Brendon Henrique Barbosa" → "Brendon". Etiqueta precisa caber no mapa. */
function primeiroNome(nome: string): string {
  return (nome ?? "").trim().split(/\s+/)[0] || "Técnico";
}

/**
 * Libera geometria e material de um PIN parado.
 *
 * Só do pin: ele cria geometria/material próprios por técnico, porque a cor
 * vem do status. Sem descartar ao trocar o visual, cada mudança de status
 * vazaria buffers de GPU — e o status muda o tempo todo (parado ⇄ em
 * operação ⇄ em vistoria).
 *
 * NUNCA chamar num clone do carro: os clones compartilham geometria e
 * material com o template do módulo, e liberá-los apagaria o modelo pra
 * todos os outros técnicos. Por isso o chamador só invoca isto quando sabe
 * que o visual anterior era o pin.
 */
function descartaPin(raiz: THREE.Object3D): void {
  raiz.traverse((o) => {
    const malha = o as THREE.Mesh;
    if (!malha.isMesh) return;
    malha.geometry?.dispose();
    const mats = Array.isArray(malha.material) ? malha.material : [malha.material];
    mats.forEach((m) => m?.dispose());
  });
}

export class TechModel3DLayer implements mapboxgl.CustomLayerInterface {
  id = TECH_MODEL_LAYER_ID;
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map?: mapboxgl.Map;
  private camera!: THREE.Camera;
  private scene!: THREE.Scene;
  private renderer!: THREE.WebGLRenderer;
  private entries = new Map<number, TechEntry>();
  private loggedFirstRenderFor = new Set<number>();
  private ultimoFrameEm = performance.now();

  /** Callback do painel pra abrir o técnico ao clicar na etiqueta. */
  onSelect?: (usersId: number) => void;


  // Geometria/material compartilhados entre todas as instâncias (procedural,
  // barato de reusar; só descartados no onRemove).

  private carBodyGeo!: THREE.BoxGeometry;
  private carBodyMat!: THREE.MeshStandardMaterial;
  private carCabinGeo!: THREE.BoxGeometry;
  private carCabinMat!: THREE.MeshStandardMaterial;
  private carWheelGeo!: THREE.CylinderGeometry;
  private carWheelMat!: THREE.MeshStandardMaterial;

  onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext): void {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();

    // Luz simples — materiais são MeshStandardMaterial com metalness baixo
    // (foscos), não dependem de reflexo/environment map pra parecer certo.
    //
    // HemisphereLight interpola céu/chão pelo ângulo entre a normal e o eixo
    // dado pela sua POSITION, cujo padrão é (0,1,0) — o "up" do Three.js.
    // Aqui o eixo vertical é Z (embedding do Mapbox), então no padrão a luz
    // tratava o SUL como céu e o NORTE como chão: superfícies viradas pro
    // norte recebiam só a cor escura de chão, criando grandes manchas
    // pretas que não tinham nada a ver com a forma do objeto.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.6);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(0, -70, 100).normalize();
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(0, 70, 40).normalize();
    this.scene.add(fill);

    // Profundidade LIGADA. Ela chegou a ser desligada como paliativo quando
    // eu achava que os recortes vinham de precisão de depth — não vinham,
    // vinham de precisão de COORDENADA (ver o comentário longo em render()).
    // Com a transformação na matriz da câmera, o depth buffer volta a
    // funcionar e é ele que dá a auto-oclusão correta do veículo.
    const semDepth = { depthTest: true, depthWrite: true };

    // NÃO usar flatShading aqui: ele deriva a normal de cada face no shader
    // (dFdx/dFdy do vértice em view-space), e a matriz do Mercator é
    // espelhada (Y negativo). Com determinante negativo a normal derivada
    // sai apontando pra DENTRO do objeto, a luz bate por trás e tudo
    // renderiza preto — foi exatamente o que aconteceu em produção. E era
    // desnecessário: BoxGeometry já traz normal própria por face (24
    // vértices, não 8), então topo e laterais sombreiam diferente sozinhos.
    this.carBodyGeo = new THREE.BoxGeometry(CAR_WIDTH, CAR_BODY_LENGTH, CAR_BODY_HEIGHT);
    this.carBodyMat = new THREE.MeshStandardMaterial({
      color: CAR_BODY_COLOR,
      metalness: 0.2,
      roughness: 0.6,
      emissive: CAR_BODY_COLOR,
      emissiveIntensity: 0.35, // não deixa o corpo escurecer demais em ângulo/luz ruim
      ...semDepth,
    });
    this.carCabinGeo = new THREE.BoxGeometry(CAR_CABIN_WIDTH, CAR_CABIN_LENGTH, CAR_CABIN_HEIGHT);
    this.carCabinMat = new THREE.MeshStandardMaterial({
      color: CAR_CABIN_COLOR,
      metalness: 0.1,
      roughness: 0.45,
      ...semDepth,
    });
    // Eixo do cilindro rotacionado pra X (lateral) — permite girar em
    // rotation.x pra "rolar" pra frente/trás sem precisar de outra transform.
    this.carWheelGeo = new THREE.CylinderGeometry(CAR_WHEEL_RADIUS, CAR_WHEEL_RADIUS, CAR_WHEEL_WIDTH, 14);
    this.carWheelGeo.rotateZ(Math.PI / 2);
    this.carWheelMat = new THREE.MeshStandardMaterial({ color: CAR_WHEEL_COLOR, metalness: 0.15, roughness: 0.85, ...semDepth });

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;

    if (DEBUG_LOG) {
      // eslint-disable-next-line no-console
      console.log("[vm-3d] onAdd (multi-entry) rodou", {
        canvasSize: { w: map.getCanvas().width, h: map.getCanvas().height },
        projection: map.getProjection?.(),
      });
    }

    if (USE_CAR_MODEL && !sharedCarTemplate) {
      loadCarTemplateOnce()
        .then(() => {
          // Troca quem já estava mostrando o carrinho geométrico enquanto
          // o modelo carregava.
          this.entries.forEach((e) => {
            if (e.kind === "car") {
              e.visualIsCar = false; // força ensureVisual a reconstruir
              this.ensureVisual(e);
            }
          });
          this.map?.triggerRepaint();
        })
        .catch((err) => {
          // Fica no carrinho geométrico — não quebra a tela.
          // eslint-disable-next-line no-console
          console.error("[vm-3d] falha ao carregar car.glb, seguindo com o carrinho geométrico", err);
        });
    }

    if (USE_PERSON_MODEL && !sharedPersonTemplate) {
      loadPersonTemplateOnce()
        .then(() => {
          // Troca quem já estava com o marcador provisório.
          this.entries.forEach((e) => {
            if (e.kind !== "car") {
              e.visualIsCar = true; // força ensureVisual a reconstruir o pin
              this.ensureVisual(e);
            }
          });
          this.map?.triggerRepaint();
        })
        .catch((err) => {
          // Fica na cápsula simples — não quebra a tela.
          // eslint-disable-next-line no-console
          console.error("[vm-3d] falha ao carregar person1.glb, seguindo com o marcador simples", err);
        });
    }
  }

  private buildCarModel(): { object3d: THREE.Object3D; wheels: THREE.Mesh[] } {
    // car.glb quando já carregou; o carrinho geométrico abaixo é o
    // placeholder durante o download e o fallback se ele falhar. As rodas
    // animadas são só do carrinho — no modelo importado elas fazem parte
    // da malha e não dá pra girar separado.
    if (DEBUG_LOG) {
      // eslint-disable-next-line no-console
      console.log(`[vm-3d] visual do carro: ${sharedCarTemplate ? "car.glb" : "fallback geométrico"}`);
    }
    if (sharedCarTemplate) {
      return { object3d: sharedCarTemplate.clone(true), wheels: [] };
    }

    const group = new THREE.Group();

    const body = new THREE.Mesh(this.carBodyGeo, this.carBodyMat);
    body.position.z = CAR_WHEEL_RADIUS + CAR_BODY_HEIGHT / 2;
    group.add(body);

    const cabin = new THREE.Mesh(this.carCabinGeo, this.carCabinMat);
    cabin.position.set(0, -CAR_BODY_LENGTH * 0.06, CAR_WHEEL_RADIUS + CAR_BODY_HEIGHT + CAR_CABIN_HEIGHT / 2);
    group.add(cabin);

    const wx = CAR_WIDTH / 2 + CAR_WHEEL_WIDTH / 2 - 0.02;
    const wy = CAR_BODY_LENGTH / 2 - CAR_WHEEL_RADIUS * 1.15;
    const wheelOffsets: Array<[number, number]> = [
      [-wx, wy], [wx, wy], [-wx, -wy], [wx, -wy],
    ];
    const wheels = wheelOffsets.map(([x, y]) => {
      const wheel = new THREE.Mesh(this.carWheelGeo, this.carWheelMat);
      wheel.position.set(x, y, CAR_WHEEL_RADIUS);
      group.add(wheel);
      return wheel;
    });

    return { object3d: group, wheels };
  }

  /**
   * Pin do técnico parado (ver a anatomia comentada junto das constantes
   * PIN_*). Devolve o grupo e as partes que o render() anima.
   *
   * Nota de convenção, que já custou caro aqui: Z é o eixo VERTICAL neste
   * embedding, não o Y do Three.js. CircleGeometry/RingGeometry já nascem no
   * plano XY, que aqui é o chão — então deitam sozinhos, sem rotação. O
   * cilindro da haste é a exceção: ele nasce ao longo do Y e precisa girar.
   */
  private buildIdlePin(corHex: string): {
    object3d: THREE.Object3D;
    pulsos: THREE.Mesh[];
    nucleo: THREE.Object3D;
    orbita: THREE.Object3D;
    coluna: THREE.Mesh;
  } {
    const group = new THREE.Group();
    const cor = new THREE.Color(corHex);

    // Disco no chão: ancora a figura num ponto exato. Sem ele o modelo
    // "flutua" ambíguo quando o mapa está inclinado.
    const disco = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 28),
      new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.9 })
    );
    disco.position.z = 0.05;
    group.add(disco);

    // UM pulso, discreto — o suficiente pra localizar de longe sem virar
    // enfeite. A versão anterior tinha dois pulsos, coluna de luz, núcleo
    // girando e anel orbital: virou ruído.
    // Anel começa FORA do disco: antes ele nascia exatamente na borda (mesmo
    // raio), então a fase inicial — a mais opaca — ficava escondida atrás do
    // disco e o efeito parecia não existir.
    const pulso = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.4, 40),
      new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.6, depthWrite: false })
    );
    pulso.position.z = 0.04;
    group.add(pulso);

    // A figura. Enquanto o GLB não chega, um marcador simples segura o lugar
    // — não some nem pisca quando o modelo termina de carregar.
    let figura: THREE.Object3D;
    if (sharedPersonTemplate) {
      figura = sharedPersonTemplate.clone(true);
      figura.traverse((o) => {
        const malha = o as THREE.Mesh;
        if (!malha.isMesh) return;
        // Material por técnico: é o que faz a figura acompanhar a cor do
        // status. O GLB veio sem material nenhum, então nada se perde.
        // TEXTURA PRESERVADA. Diferente do modelo anterior (que vinha sem
        // material nenhum e por isso era pintado), person1.glb traz basecolor
        // e mapas próprios — sobrescrever a cor apagaria o modelo inteiro.
        //
        // Só o metal é zerado: metalness alto sem environment map renderiza
        // PRETO, e foi isso que custou várias rodadas com a picape. Com
        // metalness 0 a superfície é dielétrica e não depende de reflexo pra
        // ter cor. Os mapas de metal/rugosidade saem junto, senão a textura
        // reintroduz metal pixel a pixel e o escalar não resolve.
        //
        // O status não se perde por não estar na figura: vive no disco, no
        // pulso e no pontinho da etiqueta com o nome.
        const m = malha.material as THREE.MeshStandardMaterial;
        if (m && m.isMeshStandardMaterial) {
          m.metalness = 0;
          m.metalnessMap = null;
          m.roughness = 0.7;
          m.roughnessMap = null;
          m.envMapIntensity = 0;
          m.needsUpdate = true;
        }
      });
    } else {
      figura = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.55, 1.1, 4, 12),
        new THREE.MeshStandardMaterial({ color: cor, metalness: 0, roughness: 0.8 })
      );
      figura.rotation.x = Math.PI / 2;
      figura.position.z = 1.2;
    }
    // Suporte que recebe o billboard. A figura fica DENTRO dele pra nao
    // perder a rotacao de base do template (glTF Y-up → Z-up), e o suporte
    // tem a matriz montada na mao a cada frame em render().
    const suporte = new THREE.Group();
    suporte.matrixAutoUpdate = false;
    suporte.add(figura);
    group.add(suporte);

    return { object3d: group, pulsos: [pulso], nucleo: suporte, orbita: group, coluna: pulso };
  }

  /** Garante que o filho visual da entry bate com o kind atual (troca só quando muda). */
  private ensureVisual(e: TechEntry, corMudou = false): void {
    const wantCar = e.kind === "car";
    // O pin parado é construído na cor do status, então uma mudança de status
    // também exige reconstruir — não basta trocar entre carro e pin.
    if (wantCar === e.visualIsCar && e.visual && !(corMudou && !wantCar)) return;
    if (e.visual) {
      e.object3d.remove(e.visual);
      // Só o pin tem recursos próprios; o carro compartilha os do template.
      if (!e.visualIsCar) descartaPin(e.visual);
    }
    if (wantCar) {
      const { object3d, wheels } = this.buildCarModel();
      e.visual = object3d;
      e.wheels = wheels;
      e.pinPulsos = undefined;
      e.pinNucleo = undefined;
      e.pinOrbita = undefined;
      e.pinColuna = undefined;
    } else {
      const { object3d, pulsos, nucleo, orbita, coluna } = this.buildIdlePin(e.corHex);
      e.visual = object3d;
      e.wheels = null;
      e.pinPulsos = pulsos;
      e.pinNucleo = nucleo;
      e.pinOrbita = orbita;
      e.pinColuna = coluna;
    }
    e.visualIsCar = wantCar;
    e.object3d.add(e.visual);
  }

  private createEntry(spec: TechEntrySpec): TechEntry {
    const m = mapboxgl.MercatorCoordinate.fromLngLat([spec.lng, spec.lat], 0);
    const object3d = new THREE.Group();
    // A matriz do container é montada na mão a cada frame (ordem T·S·R —
    // ver render()), então o Three.js não deve recompô-la a partir de
    // position/rotation/scale.
    object3d.matrixAutoUpdate = false;
    this.scene.add(object3d);
    if (DEBUG_LOG) {
      // eslint-disable-next-line no-console
      console.log("[vm-3d] createEntry", {
        usersId: spec.usersId,
        kind: spec.route ? "car" : "idle",
        lng: spec.lng,
        lat: spec.lat,
        temRota: !!spec.route,
        pontosDaRota: spec.route?.coordinates?.length,
      });
    }
    const agora = performance.now();
    const e: TechEntry = {
      usersId: spec.usersId,
      nome: spec.nome,
      corHex: spec.corHex,
      kind: spec.route ? "car" : "idle",
      object3d,
      visual: null,
      visualIsCar: false,
      wheels: null,
      route: spec.route,
      distM: 0,
      alvoDistM: 0,
      speedMps: Math.max(0, (spec.speedKmh ?? 0) / 3.6),
      ultimaPosicaoEm: agora,
      fromXY: { x: m.x, y: m.y },
      toXY: { x: m.x, y: m.y },
      z: m.z ?? 0,
      tweenStart: agora,
      label: null,
    };
    if (spec.route) {
      const { distAlongM } = projectOntoRoute(spec.route, { lng: spec.lng, lat: spec.lat });
      e.distM = distAlongM;
      e.alvoDistM = distAlongM;
    }
    this.ensureVisual(e);
    this.ensureLabel(e);
    return e;
  }

  private updateEntry(e: TechEntry, spec: TechEntrySpec): void {
    const newKind: "car" | "idle" = spec.route ? "car" : "idle";
    const routeChanged = e.route !== spec.route; // routeService devolve o MESMO objeto em cache; só muda por refetch
    const corMudou = e.corHex !== spec.corHex;
    e.kind = newKind;
    e.route = spec.route;
    e.nome = spec.nome;
    e.corHex = spec.corHex;
    this.ensureVisual(e, corMudou);
    this.ensureLabel(e);

    // Posição REALMENTE nova? O poll roda a cada 5s, mas o celular só reporta
    // a cada 30m percorridos ou 30s parado — a maioria dos ciclos repete a
    // mesma coordenada. Só um dado novo renova a confiança na velocidade;
    // sem esta checagem, a idade zeraria a cada poll e o carro nunca
    // desaceleraria ao parar.
    const posicaoMudou =
      Math.abs(spec.lng - (e.ultimoLng ?? NaN)) > 1e-7 ||
      Math.abs(spec.lat - (e.ultimoLat ?? NaN)) > 1e-7;
    if (posicaoMudou || e.ultimoLng == null) {
      e.ultimaPosicaoEm = performance.now();
      e.ultimoLng = spec.lng;
      e.ultimoLat = spec.lat;
      if (spec.speedKmh != null) e.speedMps = Math.max(0, spec.speedKmh / 3.6);
    }

    if (newKind === "car" && spec.route) {
      const { distAlongM } = projectOntoRoute(spec.route, { lng: spec.lng, lat: spec.lat });
      if (routeChanged) {
        // Geometria nova: não há como comparar progresso entre rotas
        // diferentes, então recomeça no ponto medido.
        e.distM = distAlongM;
        e.alvoDistM = distAlongM;
      } else {
        // Progresso monotônico — nunca anda de ré por ruído de GPS.
        e.alvoDistM = Math.max(e.alvoDistM, distAlongM);
      }
    } else {
      const frac = tweenFrac(e.tweenStart);
      e.fromXY = {
        x: e.fromXY.x + (e.toXY.x - e.fromXY.x) * frac,
        y: e.fromXY.y + (e.toXY.y - e.fromXY.y) * frac,
      };
      const m = mapboxgl.MercatorCoordinate.fromLngLat([spec.lng, spec.lat], 0);
      e.toXY = { x: m.x, y: m.y };
      e.tweenStart = performance.now();
    }
  }

  /** Etiqueta flutuante com o nome; clicar seleciona o técnico. */
  private ensureLabel(e: TechEntry): void {
    if (!this.map) return;
    // Etiqueta pra TODO mundo agora. Antes só quem dirigia tinha nome, porque
    // o modo Padrão (com os pins 2D) cobria os parados. Com o 3D virando o
    // padrão do painel, quem está parado ficaria anônimo — perda direta de
    // informação em relação ao que o mapa mostrava antes.
    if (e.label) {
      const el = e.label.getElement().querySelector("[data-nome]");
      if (el && el.textContent !== primeiroNome(e.nome)) el.textContent = primeiroNome(e.nome);
      const dot = e.label.getElement().querySelector("[data-cor]") as HTMLElement | null;
      if (dot && dot.style.background !== e.corHex) dot.style.background = e.corHex;
      return;
    }

    const el = document.createElement("div");
    el.className = "vm-3d-label";
    el.style.cssText =
      "display:flex;align-items:center;gap:6px;padding:3px 9px;border-radius:9999px;" +
      "background:rgba(9,22,22,.88);color:#fff;font:600 11px/1.2 system-ui,sans-serif;" +
      "white-space:nowrap;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);" +
      "border:1px solid rgba(0,212,160,.55)";
    const ponto = document.createElement("span");
    ponto.setAttribute("data-cor", "");
    ponto.style.cssText = `width:6px;height:6px;border-radius:9999px;background:${e.corHex}`;
    const nome = document.createElement("span");
    nome.setAttribute("data-nome", "");
    nome.textContent = primeiroNome(e.nome);
    el.append(ponto, nome);
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.onSelect?.(e.usersId);
    });

    e.label = new mapboxgl.Marker({ element: el, anchor: "bottom", offset: [0, -18] })
      .setLngLat([0, 0])
      .addTo(this.map);
  }

  /** Progresso exibido (m) do técnico na rota — usado pra desenhar a linha em sincronia. */
  progressoAtual(usersId: number): number | null {
    const e = this.entries.get(usersId);
    return e && e.kind === "car" ? e.distM : null;
  }

  /** Chamado a cada sync de técnicos (poll) — cria/atualiza/remove entradas. */
  syncEntries(specs: TechEntrySpec[]): void {
    const seen = new Set<number>();
    specs.forEach((spec) => {
      seen.add(spec.usersId);
      const existing = this.entries.get(spec.usersId);
      if (existing) {
        this.updateEntry(existing, spec);
      } else {
        this.entries.set(spec.usersId, this.createEntry(spec));
      }
    });
    this.entries.forEach((e, id) => {
      if (!seen.has(id)) {
        this.scene.remove(e.object3d);
        e.label?.remove();
        this.entries.delete(id);
      }
    });
    this.map?.triggerRepaint();
  }

  /**
   * Quantos pixels de tela equivalem a 1 metro no zoom atual.
   *
   * Medido projetando dois pontos separados por 1 metro, em vez de aplicar a
   * fórmula de metros-por-pixel na mão: usa só API pública e não depende de
   * eu acertar a convenção de tamanho de tile do Mapbox.
   */
  private pixelsPorMetroEm(lng: number, lat: number): number {
    const map = this.map;
    if (!map) return 1;
    const grausPorMetro = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
    const a = map.project([lng, lat]);
    const b = map.project([lng + grausPorMetro, lat]);
    return Math.hypot(b.x - a.x, b.y - a.y) || 1;
  }

  /**
   * Fator que impede o objeto de ficar menor que `minPx` na tela.
   *
   * `maxFator` existe por causa de objeto ALTO. Pra picape, que e baixa e
   * deitada, ampliar sem limite e inofensivo: ela cresce no plano do chao.
   * Uma figura EM PE ampliada 30x vira uma torre de dezenas de metros subindo
   * pelo ceu — foi o "gigantesco" relatado. O teto sacrifica visibilidade num
   * zoom de cidade inteira, onde individuo nao se distingue mesmo, pra nao
   * produzir monstruosidade no caminho.
   */
  private fatorTamanhoMinimo(
    comprimentoM: number,
    minPx: number,
    pxPorMetro: number,
    maxFator = Infinity
  ): number {
    const px = comprimentoM * pxPorMetro;
    if (px >= minPx) return 1;
    return Math.min(minPx / px, maxFator);
  }

  render(gl: WebGLRenderingContext, matrix: number[]): void {
    let anyTweenActive = false;

    // BILLBOARD da figura parada: bearing e pitch do mapa.
    //
    // A figura ESTA em pe — verificado na pagina de comparacao. O que se ve
    // como "deitada" e ENCURTAMENTO DE PERSPECTIVA: em pitch 55 a altura dela
    // na tela cai pra ~57% da real (cos 55°). Ela esta vertical e aparece
    // esmagada.
    //
    // Fazer a figura encarar a camera devolve a altura cheia. Rz(bearing)
    // alinha no plano horizontal; Rx(+(90°-pitch)) inclina o topo NA DIRECAO
    // da camera, que fica num angulo de elevacao de (90° - pitch).
    //
    // HISTORICO, pra nao se repetir: implementei isso, errei o SINAL do Rx
    // (aparecia de cabeca pra baixo), corrigi o sinal, e entao removi o
    // recurso INTEIRO junto com o problema — jogando fora a versao ja
    // corrigida. O sinal atual foi validado numericamente em pitch
    // 0/30/50/60/85: a frente da figura bate com a direcao da camera em
    // todos, e o topo nunca inverte.
    const bearingRad = ((this.map?.getBearing() ?? 0) * Math.PI) / 180;
    const pitchRad = ((this.map?.getPitch() ?? 0) * Math.PI) / 180;

    // A medição de pixels-por-metro é POR TÉCNICO (ver o laço abaixo), não
    // uma por frame no centro do mapa como era antes. O argumento de então —
    // "o zoom é global e a latitude varia pouco" — ignorava a PERSPECTIVA:
    // com o mapa inclinado, um metro perto da base da tela ocupa muitos
    // pixels e perto do horizonte ocupa pouquíssimos. Usando o valor do
    // centro pra todos, quem estava longe encolhia até quase sumir e quem
    // estava perto crescia demais. Pareciam dois bugs; era um só.

    // Prepara o estado de GL uma vez só; o laço abaixo desenha por objeto.
    //
    // resetState() do Three.js zera bastante coisa que o Mapbox tinha
    // configurado — inclusive faz bindFramebuffer(FRAMEBUFFER, null), zera
    // viewport/scissor e não restaura o depthRange que o Mapbox aperta pra
    // ordenar as próprias camadas. As três linhas abaixo desfazem isso.
    //
    // Nota honesta pra quem vier depois: a reassociação do framebuffer foi
    // adicionada quando eu achava que ELA era a causa dos polígonos
    // recortados. Não era — a causa foi precisão de coordenada (ver o
    // comentário no laço). Comprovado em /painel/teste3d, onde com
    // profundidade ligada o resultado é idêntico com e sem esta linha
    // (?fbo=0). Fica como salvaguarda, pra o caso de o Mapbox renderizar
    // num framebuffer próprio em alguma configuração (terreno, globo).
    const fboDoMapbox = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    this.renderer.resetState();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboDoMapbox);
    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.depthRange(0, 1);

    // LIMPA O DEPTH BUFFER antes de desenhar.
    //
    // Sem isto, o que fica rente ao chão some: o Mapbox escreve a
    // profundidade do terreno usando a faixa comprimida DELE, e nós
    // devolvemos a faixa cheia acima. Os valores deixam de ser comparáveis e
    // o rasterizador descarta o que está colado no solo — na prática, o disco
    // do marcador desaparecia por completo e as PERNAS da figura saíam
    // apagadas, enquanto o tronco (mais alto) passava.
    //
    // Com o buffer limpo, nossos objetos disputam profundidade só entre si:
    // continuam sólidos e corretamente auto-ocluídos, e ficam sempre visíveis
    // por cima do mapa — que é o comportamento certo pra um marcador, que não
    // deve sumir atrás de prédio extrudado.
    //
    // O custo: camadas desenhadas DEPOIS da nossa perdem a referência de
    // profundidade do mapa. Na prática é inofensivo aqui, porque a camada 3D
    // é a última adicionada (ver a ordem em switchLayer).
    this.renderer.clearDepth();

    this.entries.forEach((e) => { e.object3d.visible = false; });

    const agora = performance.now();
    const dt = Math.min(0.25, Math.max(0, (agora - this.ultimoFrameEm) / 1000));
    this.ultimoFrameEm = agora;

    this.entries.forEach((e) => {
      const frac = tweenFrac(e.tweenStart);
      if (frac < 1) anyTweenActive = true;

      let x: number, y: number, z: number, headingRad: number | null;
      let lngAtual: number, latAtual: number;

      if (e.kind === "car" && e.route) {
        // DEAD RECKONING: avança sozinho na velocidade estimada e absorve o
        // erro contra a última medição de forma gradual, em vez de saltar.
        //
        // A confiança na velocidade decai com a idade da última posição nova
        // — é isso que faz o carro desacelerar até parar quando o técnico
        // encosta, sem precisar esperar 30s pelo próximo report dizendo
        // "velocidade zero".
        const idade = agora - e.ultimaPosicaoEm;
        const confianca = Math.exp(-idade / SPEED_DECAY_TAU_MS);
        const erro = e.alvoDistM - e.distM;

        if (Math.abs(erro) > SNAP_ERROR_M) {
          e.distM = e.alvoDistM;
        } else {
          e.distM += e.speedMps * confianca * dt + erro * CORRECTION_GAIN * dt;
          // Nunca passa do destino nem anda de ré.
          e.distM = Math.max(0, Math.min(e.distM, e.route.distanceM));
        }

        // Enquanto o carro não alcançou a medição, ou ainda tem velocidade
        // relevante, o mapa precisa continuar redesenhando.
        if (Math.abs(erro) > 0.5 || e.speedMps * confianca > 0.2) anyTweenActive = true;

        const sample = sampleRouteAt(e.route, e.distM);
        const m = mapboxgl.MercatorCoordinate.fromLngLat([sample.lng, sample.lat], 0);
        x = m.x;
        y = m.y;
        z = m.z ?? 0;
        lngAtual = sample.lng;
        latAtual = sample.lat;
        headingRad = sample.headingRad;

        // Rodas giram conforme a distância real percorrida (não por tempo)
        // — para quando o técnico para, acelera quando o progresso acelera.
        if (e.wheels) {
          const spin = (e.distM / CAR_WHEEL_RADIUS) % (Math.PI * 2);
          for (const wheel of e.wheels) wheel.rotation.x = spin;
        }

        e.label?.setLngLat([sample.lng, sample.lat]);
      } else {
        x = e.fromXY.x + (e.toXY.x - e.fromXY.x) * frac;
        y = e.fromXY.y + (e.toXY.y - e.fromXY.y) * frac;
        z = e.z;
        headingRad = null;

        // Pin parado: anel de radar expandindo em loop e cabeça com leve
        // sobe-e-desce. Mantém o marcador "vivo" sem depender de o técnico
        // se mexer — importante agora que o 3D é o modo padrão e boa parte
        // do mapa é gente parada.
        // Pulsos defasados em meio ciclo: some quando expande, e a opacidade
        // cai com o quadrado do avanço pra sumir rápido no fim e não deixar
        // um anel largo e pálido pairando.
        // Um pulso só, saindo do disco e sumindo. Discreto de proposito:
        // a figura e que informa, o pulso so ajuda a localizar de longe.
        e.pinPulsos?.forEach((pl) => {
          const t = (agora / PIN_PULSO_MS) % 1;
          const sc = 1 + t * 2.6;
          pl.scale.set(sc, sc, 1);
          // Queda LINEAR, não quadrática: ao quadrado o anel já estava quase
          // transparente na metade do ciclo, e o efeito passava despercebido.
          (pl.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - t);
        });

        // A figura fica PARADA de proposito — ela representa alguem parado.
        // Girar ou flutuar o modelo daria a leitura errada, alem de ter sido
        // exatamente o excesso que fez a versao anterior parecer enfeite.

        anyTweenActive = true; // animação contínua do pin

        const ll = new mapboxgl.MercatorCoordinate(x, y, z).toLngLat();
        lngAtual = ll.lng;
        latAtual = ll.lat;
        e.label?.setLngLat([ll.lng, ll.lat]);

      }

      const scale = new mapboxgl.MercatorCoordinate(x, y, z).meterInMercatorCoordinateUnits();

      // PRECISÃO: a transformação vai na matriz da CÂMERA, não na do objeto.
      //
      // Este é o ponto que quebrava tudo. Colocar a posição no objeto
      // significa entregar ao shader uma matriz com translação em Mercator
      // (~0.29) e escala ~2.6e-8. O Three.js envia matrizes pra GPU em
      // float32, onde o incremento representável perto de 0.29 é ~3e-8 —
      // enquanto o veículo INTEIRO ocupa ~3.4e-7. Ou seja, o objeto todo
      // cabia em cerca de dez passos de precisão: os vértices eram
      // arredondados nessa grade grosseira e a malha colapsava em blocos
      // angulares. Por ser precisão de coordenada, atingia qualquer
      // geometria igualmente — modelo de 502 mil faces, caixas do carrinho,
      // toro do beacon e até um cubo simples — e variava com zoom e
      // inclinação. Foi o que me fez perseguir material, luz, profundidade e
      // framebuffer por muitas rodadas.
      //
      // O jeito certo (e o que o exemplo oficial do Mapbox faz) é compor a
      // transformação na projeção: os vértices continuam em METROS, onde o
      // float32 tem precisão de sobra, e a composição com o offset enorme
      // acontece em float64 na CPU. Por isso cada objeto é desenhado com sua
      // própria matriz de câmera, e a matriz do objeto fica identidade.
      //
      // Sobre a escala positiva nos três eixos (a convenção usual negativa Y,
      // porque o Mercator cresce pra sul): determinante negativo inverte tudo
      // que deriva orientação no shader, e já custou o flatShading e o
      // normalMap aqui. Sem negativar, o modelo fica espelhado
      // esquerda/direita — imperceptível num ícone de veículo — e a
      // iluminação funciona.
      //
      // HEADING sem offset. O car.glb NÃO segue a convenção glTF de frente
      // em -Z: medindo o arquivo, 260 de 271 vértices que caem em pixels
      // vermelhos da textura (as lanternas) estão em z < 0, agrupados em
      // z≈-0.46. Traseira em -Z, logo FRENTE EM +Z. Confere com o perfil de
      // altura: queda abrupta no lado -Z (parede traseira da cabine antes da
      // caçamba), queda gradual no lado +Z (para-brisa descendo pro capô) e
      // alargamento em z≈0.1 (retrovisores, que ficam à frente da cabine).
      //
      // A rotação de base (X, π/2) leva glTF +Z pra -Y local, e -Y local cai
      // no norte do Mercator. Então rotationZ(heading) puro já acerta:
      // heading 0 (norte) → frente em -Y = norte; heading 90° (leste) →
      // frente em +X = leste. Somar π aqui faria a picape andar de ré.
      // map.project() aplica a projecao inteira, inclusive o pitch, entao
      // medir na posicao DESTE tecnico da o fator certo pra ele. Sao duas
      // projecoes por tecnico por frame: irrelevante pra um punhado deles.
      const pxPorMetro = this.pixelsPorMetroEm(lngAtual, latAtual);
      const fator =
        e.kind === "car"
          ? this.fatorTamanhoMinimo(CAR_REAL_LENGTH_M, CAR_MIN_PX, pxPorMetro)
          : this.fatorTamanhoMinimo(PIN_FOOTPRINT_M, IDLE_MIN_PX, pxPorMetro, PIN_MAX_FATOR);
      const escala = scale * fator;

      // Etiqueta acima da CABECA, nao no meio do corpo.
      //
      // O deslocamento era fixo em 18px, mas o marcador e ancorado no ponto
      // do CHAO e a figura cresce pra cima a partir dele — a etiqueta pousava
      // no meio do tronco. Figura pequena com uma tarja escura atravessada no
      // meio le como "deitado"/"avacalhado". A altura na tela muda com zoom e
      // distancia, entao o deslocamento tem que ser calculado.
      if (e.label) {
        const alturaPx = e.kind === "car" ? 26 : PERSON_ALTURA_M * fator * pxPorMetro;
        e.label.setOffset([0, -(Math.min(alturaPx, 220) + 8)]);
      }

      SCRATCH_MODELO
        .makeTranslation(x, y, z)
        .multiply(SCRATCH_SCALE.makeScale(escala, escala, escala))
        .multiply(SCRATCH_ROT.makeRotationZ(headingRad ?? 0));

      // Billboard SO na figura, nunca no grupo inteiro: disco e pulso
      // precisam continuar deitados no chao. Por isso a rotacao vai num
      // suporte que envolve so o modelo (ver buildIdlePin).
      // Billboard SO na figura, nunca no grupo: disco e pulso precisam
      // continuar deitados no chao. Por isso a rotacao vai no suporte que
      // envolve apenas o modelo (ver buildIdlePin).
      if (e.kind !== "car" && e.pinNucleo) {
        e.pinNucleo.matrix
          .makeRotationZ(bearingRad)
          .multiply(SCRATCH_ROT2.makeRotationX(Math.PI / 2 - pitchRad));
        e.pinNucleo.matrixWorldNeedsUpdate = true;
      }
      this.camera.projectionMatrix.fromArray(matrix).multiply(SCRATCH_MODELO);

      e.object3d.visible = true;
      this.renderer.render(this.scene, this.camera);
      e.object3d.visible = false;

      if (DEBUG_LOG && !this.loggedFirstRenderFor.has(e.usersId)) {
        this.loggedFirstRenderFor.add(e.usersId);
        // eslint-disable-next-line no-console
        console.log(
          `[vm-3d] primeiro render() usersId=${e.usersId} kind=${e.kind} ` +
          `visualIsCar=${e.visualIsCar} filhosVisiveis=${e.object3d.children.length} ` +
          `escalaAplicada=${scale.toExponential(3)}`
        );
      }
    });

    this.entries.forEach((e) => { e.object3d.visible = true; });

    // Só pede o próximo frame enquanto algum tween (posição OU progresso na
    // rota, o que também move as rodas) ainda não terminou — mesmo fix de
    // performance validado na Fase 0 (sem isso, o mapa redesenha a 60fps o
    // tempo todo em segundo plano mesmo parado).
    if (anyTweenActive) this.map?.triggerRepaint();
  }

  onRemove(): void {
    this.entries.forEach((e) => {
      this.scene.remove(e.object3d);
      e.label?.remove();
    });
    this.entries.clear();

    this.carBodyGeo?.dispose();
    this.carBodyMat?.dispose();
    this.carCabinGeo?.dispose();
    this.carCabinMat?.dispose();
    this.carWheelGeo?.dispose();
    this.carWheelMat?.dispose();

    // sharedCarTemplate NÃO é descartado aqui de propósito: ele vive no
    // módulo e é reaproveitado pela próxima camada (toda troca de estilo
    // cria uma nova). Descartar aqui forçaria rebaixar 17MB a cada troca.

    this.renderer.dispose();
  }
}
