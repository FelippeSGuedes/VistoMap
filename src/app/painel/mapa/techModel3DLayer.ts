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
const IDLE_RADIUS_M = 10;

const DEBUG_LOG = true;

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

/** Comprimento final do veículo no mapa, em metros. */
const CAR_TARGET_LENGTH_M = 3.9 * CAR_EXAGGERATION;

// car.glb é o modelo real (modelado pelo usuário). O carrinho geométrico
// continua no código como fallback: aparece enquanto os 17MB carregam e
// fica permanentemente se o download falhar. Virar `false` aqui volta pro
// carrinho geométrico sem mexer em mais nada.
const USE_CAR_MODEL = true;

// GLTF é Y-up; o embedding do Mapbox é Z-up. Depois desta rotação o modelo
// mede (medido em produção, escala 1): 0.487 largura x 1.000 comprimento x
// 0.411 altura — ou seja, comprimento no eixo Y, que é a convenção de
// "frente" usada aqui. Se o carro andar de ré, inverter CAR_MODEL_FLIP.
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
  root.scale.setScalar(CAR_TARGET_LENGTH_M / (size.y || 1));

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

          // A causa real dos recortes: PRECISÃO DE PROFUNDIDADE. O Mapbox
          // monta a projeção pro mundo visível inteiro, com o plano distante
          // muito longe. Um objeto de ~13m cai praticamente dentro de um
          // único incremento do depth buffer, então todas as faces terminam
          // com o mesmo valor e qual aparece na frente vira sorteio — daí os
          // polígonos recortados, a variação conforme zoom/inclinação, e o
          // fato de atingir igualmente o modelo de 502 mil faces, as caixas
          // do carrinho e o anel do beacon.
          //
          // Sem teste de profundidade, a oclusão passa a ser resolvida só
          // pelo descarte de faces traseiras (side: FrontSide). Num corpo
          // fechado e aproximadamente convexo — que é o caso de um veículo —
          // as faces frontais formam exatamente a superfície visível, sem
          // sobreposição, então o depth buffer é dispensável.
          side: THREE.FrontSide,
          depthTest: false,
          depthWrite: false,
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
  lng: number;
  lat: number;
  /** Presente = "carro seguindo rota"; null = "beacon parado". */
  route: RouteResult | null;
}

interface TechEntry {
  usersId: number;
  kind: "car" | "idle";
  object3d: THREE.Group; // container — posição/rotação/escala setadas a cada frame
  visual: THREE.Object3D | null; // filho atual (carrinho ou beacon)
  visualIsCar: boolean;
  wheels: THREE.Mesh[] | null; // só quando visual = carrinho — girados por distância percorrida
  route: RouteResult | null;
  fromDistM: number; // progresso (metros) na rota — só kind="car"
  toDistM: number;
  fromXY: MercatorXY; // tween linear — kind="idle" (ou "car" sem rota resolvida ainda)
  toXY: MercatorXY;
  z: number;
  tweenStart: number;
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


  // Geometria/material compartilhados entre todas as instâncias (procedural,
  // barato de reusar; só descartados no onRemove).
  private idleRingGeo!: THREE.TorusGeometry;
  private idleRingMat!: THREE.MeshBasicMaterial;
  private idleCoreGeo!: THREE.IcosahedronGeometry;
  private idleCoreMat!: THREE.MeshBasicMaterial;

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

    // depthTest/depthWrite desligados em TODOS os visuais desta camada — ver
    // a explicação longa em prepareCarTemplate(): na escala de um veículo, a
    // projeção do Mapbox não tem precisão de profundidade suficiente e as
    // faces se recortam entre si. Vale igual pro beacon: foi ele, com a borda
    // do anel rasgada, que denunciou que o defeito não era do modelo 3D.
    const semDepth = { depthTest: false, depthWrite: false };

    this.idleRingGeo = new THREE.TorusGeometry(IDLE_RADIUS_M, IDLE_RADIUS_M * 0.12, 12, 32);
    this.idleRingMat = new THREE.MeshBasicMaterial({ color: MODEL_COLOR, transparent: true, opacity: 0.55, ...semDepth });
    this.idleCoreGeo = new THREE.IcosahedronGeometry(IDLE_RADIUS_M * 0.45, 0);
    this.idleCoreMat = new THREE.MeshBasicMaterial({ color: MODEL_COLOR, ...semDepth });

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

  private buildIdleBeacon(): THREE.Object3D {
    const group = new THREE.Group();
    // O beacon estava na convenção errada (Y como "cima"): o anel era
    // rotacionado pra ficar EM PÉ e o núcleo era deslocado pro norte, não
    // pra cima. Passava despercebido porque num mapa bem inclinado um anel
    // vertical ainda parece redondo e "norte" cai pra cima na tela. Aqui Z
    // é o eixo vertical, e TorusGeometry já nasce no plano XY — que é o
    // chão. Ou seja: sem rotação nenhuma o anel deita sozinho.
    const ring = new THREE.Mesh(this.idleRingGeo, this.idleRingMat);
    group.add(ring);
    const core = new THREE.Mesh(this.idleCoreGeo, this.idleCoreMat);
    core.position.z = IDLE_RADIUS_M * 0.9;
    group.add(core);
    return group;
  }

  /** Garante que o filho visual da entry bate com o kind atual (troca só quando muda). */
  private ensureVisual(e: TechEntry): void {
    const wantCar = e.kind === "car";
    if (wantCar === e.visualIsCar && e.visual) return;
    if (e.visual) e.object3d.remove(e.visual);
    if (wantCar) {
      const { object3d, wheels } = this.buildCarModel();
      e.visual = object3d;
      e.wheels = wheels;
    } else {
      e.visual = this.buildIdleBeacon();
      e.wheels = null;
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
    const e: TechEntry = {
      usersId: spec.usersId,
      kind: spec.route ? "car" : "idle",
      object3d,
      visual: null,
      visualIsCar: false,
      wheels: null,
      route: spec.route,
      fromDistM: 0,
      toDistM: 0,
      fromXY: { x: m.x, y: m.y },
      toXY: { x: m.x, y: m.y },
      z: m.z ?? 0,
      tweenStart: performance.now(),
    };
    if (spec.route) {
      const { distAlongM } = projectOntoRoute(spec.route, { lng: spec.lng, lat: spec.lat });
      e.fromDistM = distAlongM;
      e.toDistM = distAlongM;
    }
    this.ensureVisual(e);
    return e;
  }

  private updateEntry(e: TechEntry, spec: TechEntrySpec): void {
    const newKind: "car" | "idle" = spec.route ? "car" : "idle";
    const routeChanged = e.route !== spec.route; // routeService devolve o MESMO objeto em cache; só muda por refetch
    e.kind = newKind;
    e.route = spec.route;
    this.ensureVisual(e);

    if (newKind === "car" && spec.route) {
      const frac = tweenFrac(e.tweenStart);
      const interpolatedDist = e.fromDistM + (e.toDistM - e.fromDistM) * frac;
      const { distAlongM } = projectOntoRoute(spec.route, { lng: spec.lng, lat: spec.lat });
      if (routeChanged) {
        e.fromDistM = distAlongM;
        e.toDistM = distAlongM;
      } else {
        e.fromDistM = interpolatedDist;
        // Progresso monotônico — nunca anda de ré por ruído de GPS.
        e.toDistM = Math.max(interpolatedDist, distAlongM);
      }
    } else {
      const frac = tweenFrac(e.tweenStart);
      e.fromXY = {
        x: e.fromXY.x + (e.toXY.x - e.fromXY.x) * frac,
        y: e.fromXY.y + (e.toXY.y - e.fromXY.y) * frac,
      };
      const m = mapboxgl.MercatorCoordinate.fromLngLat([spec.lng, spec.lat], 0);
      e.toXY = { x: m.x, y: m.y };
    }
    e.tweenStart = performance.now();
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
        this.entries.delete(id);
      }
    });
    this.map?.triggerRepaint();
  }

  render(gl: WebGLRenderingContext, matrix: number[]): void {
    this.camera.projectionMatrix.fromArray(matrix);

    // O WebGLRenderer só lê o tamanho do canvas 1x, no construtor (onAdd).
    // Se o mapa redimensionar depois (resize de janela, sidebar, DPR cair
    // pra dentro do devtools), o viewport interno do Three fica desatualizado
    // e a cena é recortada num retângulo errado — objetos aparecem cortados/
    // fatiados de um jeito que parece bug de geometria mas não é (mesmo
    // padrão apareceu tanto com o car.glb quanto com o carrinho procedural,
    // sinal de que a causa é anterior à geometria). Resincroniza todo frame
    // — é barato, `gl` aqui sempre reflete o tamanho real e atual do canvas.
    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    let anyTweenActive = false;

    this.entries.forEach((e) => {
      const frac = tweenFrac(e.tweenStart);
      if (frac < 1) anyTweenActive = true;

      let x: number, y: number, z: number, headingRad: number | null;

      if (e.kind === "car" && e.route) {
        const distM = e.fromDistM + (e.toDistM - e.fromDistM) * frac;
        const sample = sampleRouteAt(e.route, distM);
        const m = mapboxgl.MercatorCoordinate.fromLngLat([sample.lng, sample.lat], 0);
        x = m.x;
        y = m.y;
        z = m.z ?? 0;
        headingRad = sample.headingRad;

        // Rodas giram conforme a distância real percorrida (não por tempo)
        // — para quando o técnico para, acelera quando o progresso acelera.
        if (e.wheels) {
          const spin = (distM / CAR_WHEEL_RADIUS) % (Math.PI * 2);
          for (const wheel of e.wheels) wheel.rotation.x = spin;
        }
      } else {
        x = e.fromXY.x + (e.toXY.x - e.fromXY.x) * frac;
        y = e.fromXY.y + (e.toXY.y - e.fromXY.y) * frac;
        z = e.z;
        headingRad = null;
      }

      const scale = new mapboxgl.MercatorCoordinate(x, y, z).meterInMercatorCoordinateUnits();

      // ESCALA POSITIVA nos três eixos — sem espelhamento.
      //
      // A convenção usual (inclusive no exemplo oficial Mapbox+Three) usa
      // scale(s, -s, s), negativando Y porque o Mercator cresce pra sul e o
      // espaço do modelo cresce pra norte. Só que isso deixa o determinante
      // da matriz NEGATIVO, e determinante negativo foi a origem de toda uma
      // família de bugs aqui: qualquer coisa que derive orientação no shader
      // sai invertida, a luz passa a bater por dentro do objeto e a
      // superfície renderiza preta. Já custou o flatShading e o normalMap
      // (que, sem TANGENT no GLB, também depende de derivadas).
      //
      // Sem negativar Y o modelo fica espelhado esquerda/direita — o que num
      // ícone de veículo em mapa é imperceptível — e em troca todo o
      // pipeline de iluminação passa a funcionar normalmente.
      //
      // O preço é o heading: com Y positivo o nariz do modelo (frente glTF,
      // -Z, que a rotação de base leva pra +Y) aponta pro SUL em rotação
      // zero. Somar π corrige — verificado nos dois extremos: heading 0
      // (norte) → π → nariz em -Y = norte; heading 90° (leste) → 270° →
      // nariz em +X = leste.
      e.object3d.matrix
        .makeTranslation(x, y, z)
        .multiply(SCRATCH_SCALE.makeScale(scale, scale, scale))
        .multiply(SCRATCH_ROT.makeRotationZ((headingRad ?? 0) + Math.PI));
      e.object3d.matrixWorldNeedsUpdate = true;

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

    this.renderer.resetState();

    // Sem isto a cena inteira renderiza "esfarelada": faces some/aparecem em
    // pedaços, o carro vira fatias soltas e até o anel do beacon (um toro
    // liso) sai com a borda rasgada. Não é bug de geometria — geometrias
    // completamente diferentes (modelo de 502 mil faces, caixas, toro) deram
    // o MESMO artefato, o que descarta a malha como causa.
    //
    // O Mapbox fatia o depth buffer entre suas camadas: antes de chamar cada
    // uma ele aperta gl.depthRange numa faixa estreita, pra garantir a ordem
    // de desenho entre elas. resetState() do Three.js não restaura isso (não
    // faz parte do estado que ele rastreia), então nossa cena é espremida
    // naquela fatia mínima e perde quase toda a precisão de profundidade —
    // faces do mesmo objeto passam a brigar entre si (z-fighting) e o
    // rasterizador descarta fragmentos. Também explica por que o defeito ia
    // e vinha conforme zoom e inclinação: precisão de depth é view-dependent.
    //
    // Devolve a faixa cheia e zera o buffer: os objetos se auto-ordenam com
    // precisão total e ficam sempre visíveis por cima do mapa — que é o
    // comportamento desejado num marcador de veículo (não faz sentido um
    // técnico sumir atrás de um prédio extrudado).
    const ctx = this.renderer.getContext();
    ctx.depthRange(0, 1);
    this.renderer.clearDepth();

    this.renderer.render(this.scene, this.camera);

    // Só pede o próximo frame enquanto algum tween (posição OU progresso na
    // rota, o que também move as rodas) ainda não terminou — mesmo fix de
    // performance validado na Fase 0 (sem isso, o mapa redesenha a 60fps o
    // tempo todo em segundo plano mesmo parado).
    if (anyTweenActive) this.map?.triggerRepaint();
  }

  onRemove(): void {
    this.entries.forEach((e) => this.scene.remove(e.object3d));
    this.entries.clear();

    this.idleRingGeo?.dispose();
    this.idleRingMat?.dispose();
    this.idleCoreGeo?.dispose();
    this.idleCoreMat?.dispose();
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
