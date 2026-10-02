/**
 * Camada 3D das torres de operadoras (Claro/Vivo) — só no painel.
 *
 * As torres são ESTÁTICAS: não andam, não giram, não animam. Isso simplifica
 * tudo em relação à camada dos técnicos (techModel3DLayer) — não há tween,
 * nem heading, nem triggerRepaint contínuo. Em troca aparece um problema que
 * aquela não tem: são 2.772 torres, e cada objeto desenhado aqui custa um
 * draw call próprio (ver PRECISÃO abaixo). Por isso o render() faz culling
 * por viewport e corta no MAX_TORRES mais próximas do centro.
 *
 * PRECISÃO — a regra que vale pra qualquer coisa 3D neste mapa: a
 * transformação (posição + escala) vai na matriz da CÂMERA, nunca na do
 * objeto. Coordenada Mercator é da ordem de 0,3 com escala de ~1e-8 por
 * metro; em float32 (que é o que a matriz do objeto vira no shader) os
 * vértices colapsam e a malha vira blocos. O preço é desenhar um objeto por
 * vez, com uma matriz de câmera por objeto. Ver o comentário longo em
 * techModel3DLayer.render() e [[mapbox-three-precisao]].
 *
 * ESCALA REAL, sem piso de tamanho: a torre é plantada na altura real dela
 * (campo AlturaAntena da Anatel, 20–60 m típicos). A camada dos técnicos usa
 * um piso de tamanho mínimo em pixels porque um marcador precisa ser
 * clicável em qualquer zoom; aqui seria o contrário do pedido — uma torre
 * esticada pra caber na tela deixa de "parecer que está no chão" e vira
 * brinquedo gigante ao lado dos prédios. Então mantém-se a escala real e
 * simplesmente NÃO se desenha a torre que sairia menor que ALTURA_MIN_PX: a
 * luzinha 2D (ver lib/torresLayer.ts) já marca o ponto nesse caso.
 */
import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { asset } from "@/utils/asset";

export const TORRES_3D_LAYER_ID = "vm-torres-3d";

/** Abaixo deste pitch o mapa é praticamente top-down: a torre viraria um
 *  borrão visto de cima e a luzinha 2D comunica melhor. */
const MIN_PITCH = 20;
/** Altura na tela abaixo da qual a torre não vale um draw call. */
const ALTURA_MIN_PX = 14;
/** Teto de draw calls por frame. 40 torres de 17k triângulos ≈ 680k tri. */
const MAX_TORRES = 40;
/** Altura assumida quando a Anatel não informa AlturaAntena. */
const ALTURA_PADRAO_M = 30;
/**
 * Piso de altura. A base tem 101 torres com AlturaAntena abaixo de 10 m
 * (mínimo de 1 m) — são sites em telhado, onde o campo mede a altura ACIMA
 * DA LAJE, não do solo. Como o modelo é plantado no chão, usar o valor cru
 * desenharia uma "torre" de 1 metro, que lê como defeito e não como antena.
 * Distribuição medida na base: mediana 40 m, p90 60 m, máx 100 m.
 */
const ALTURA_MIN_M = 15;

type Operadora = "claro" | "vivo";

interface Torre {
  op: Operadora;
  alturaM: number;
  /** Mercator pré-calculado: a torre nunca se move, então isto é feito 1x. */
  x: number;
  y: number;
  z: number;
  lng: number;
  lat: number;
}

/* ── carregamento dos modelos (uma vez por sessão, compartilhado) ─────────── */

const ARQUIVO: Record<Operadora, string> = {
  claro: "/torre-claro.glb",
  vivo: "/torre-vivo.glb",
};

const templates: Partial<Record<Operadora, THREE.Object3D>> = {};
const promessas: Partial<Record<Operadora, Promise<THREE.Object3D>>> = {};

/**
 * Os GLB vêm do Tripo normalizados: altura 1 unidade em Y, base em y=0,
 * centrados em X/Z. Só falta levar o Y-up do glTF pro Z-up do embedding do
 * Mapbox — rotação de π/2 em X manda y∈[0,1] pra z∈[0,1], ou seja, a base
 * continua no solo e a torre cresce pra cima. Nada de medir a bounding box
 * pra "descobrir" qual eixo é a altura: só a convenção do formato diz isso
 * (a camada dos técnicos aprendeu isso errando com o capacete).
 */
function prepararTemplate(root: THREE.Object3D): THREE.Object3D {
  root.rotation.x = Math.PI / 2;
  root.updateMatrixWorld(true);

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const mat = m as THREE.MeshStandardMaterial;
      mat.depthTest = true;
      mat.depthWrite = true;
      // flatShading NÃO: a matriz do Mercator é espelhada em Y, e com
      // determinante negativo a normal derivada no shader aponta pra dentro
      // do objeto — o modelo renderiza preto. Já aconteceu em produção na
      // camada dos técnicos. A malha do Tripo traz NORMAL própria.
      mat.flatShading = false;
    }
  });

  return root;
}

function carregarTemplate(op: Operadora): Promise<THREE.Object3D> {
  const emCurso = promessas[op];
  if (emCurso) return emCurso;
  const p = new Promise<THREE.Object3D>((resolve, reject) => {
    new GLTFLoader().load(
      asset(ARQUIVO[op]),
      (gltf) => {
        templates[op] = prepararTemplate(gltf.scene);
        resolve(templates[op]!);
      },
      undefined,
      (err) => {
        // Deixa tentar de novo numa próxima camada em vez de travar o
        // carregamento pra sempre por uma falha de rede pontual.
        promessas[op] = undefined;
        reject(err);
      }
    );
  });
  promessas[op] = p;
  return p;
}

/* ── dados das torres (mesmo GeoJSON que a camada 2D consome) ─────────────── */

let torresCache: Torre[] | null = null;
let torresPromessa: Promise<Torre[]> | null = null;

interface FeatureTorre {
  geometry?: { coordinates?: [number, number] };
  properties?: { op?: string; alt?: number };
}

function carregarTorres(): Promise<Torre[]> {
  if (torresCache) return Promise.resolve(torresCache);
  if (torresPromessa) return torresPromessa;
  // Mesmo arquivo que a camada 2D pede: o cache HTTP do navegador atende as
  // duas, então ligar as torres baixa o GeoJSON uma única vez.
  torresPromessa = fetch(asset("/torres-operadoras.json"))
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ features?: FeatureTorre[] }>;
    })
    .then((gj) => {
      const lista: Torre[] = [];
      for (const f of gj.features ?? []) {
        const c = f.geometry?.coordinates;
        const op = f.properties?.op;
        if (!c || (op !== "claro" && op !== "vivo")) continue;
        const [lng, lat] = c;
        const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0);
        lista.push({
          op,
          alturaM: Math.max(
            f.properties?.alt && f.properties.alt > 0 ? f.properties.alt : ALTURA_PADRAO_M,
            ALTURA_MIN_M
          ),
          x: m.x,
          y: m.y,
          z: m.z ?? 0,
          lng,
          lat,
        });
      }
      torresCache = lista;
      return lista;
    })
    .catch((err) => {
      torresPromessa = null;
      throw err;
    });
  return torresPromessa;
}

/* ── a camada ─────────────────────────────────────────────────────────────── */

const SCRATCH_MODELO = new THREE.Matrix4();
const SCRATCH_SCALE = new THREE.Matrix4();

export class Torres3DLayer implements mapboxgl.CustomLayerInterface {
  id = TORRES_3D_LAYER_ID;
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map?: mapboxgl.Map;
  private camera!: THREE.Camera;
  private scene!: THREE.Scene;
  private renderer!: THREE.WebGLRenderer;
  /** Um nó por operadora, adicionado à cena e exibido um por vez. */
  private nos: Partial<Record<Operadora, THREE.Object3D>> = {};
  private torres: Torre[] = [];

  onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext): void {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();

    // HemisphereLight interpola céu/chão pelo ângulo com a POSITION dela,
    // cujo padrão é (0,1,0) — o "up" do Three.js. Aqui o eixo vertical é Z,
    // então sem reposicionar a luz tratava o sul como céu e o norte como
    // chão, manchando de preto tudo que olha pro norte.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 1.5);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);
    const sol = new THREE.DirectionalLight(0xffffff, 1.2);
    sol.position.set(0, -70, 100).normalize();
    this.scene.add(sol);
    const preenchimento = new THREE.DirectionalLight(0xffffff, 0.45);
    preenchimento.position.set(0, 70, 40).normalize();
    this.scene.add(preenchimento);

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;

    carregarTorres()
      .then((lista) => {
        this.torres = lista;
        this.map?.triggerRepaint();
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[vm-torres-3d] falha ao carregar torres-operadoras.json", err);
      });

    for (const op of ["claro", "vivo"] as const) {
      const pronto = templates[op];
      if (pronto) {
        this.montarNo(op, pronto);
        continue;
      }
      carregarTemplate(op)
        .then((tpl) => {
          this.montarNo(op, tpl);
          this.map?.triggerRepaint();
        })
        .catch((err) => {
          // Sem modelo a camada simplesmente não desenha essa operadora — a
          // luzinha 2D continua marcando o ponto.
          // eslint-disable-next-line no-console
          console.error(`[vm-torres-3d] falha ao carregar ${ARQUIVO[op]}`, err);
        });
    }
  }

  private montarNo(op: Operadora, template: THREE.Object3D): void {
    if (this.nos[op] || !this.scene) return;
    // clone() pra cada camada: uma troca de estilo cria uma camada nova, e o
    // template fica no módulo pra não rebaixar o GLB de novo.
    const no = template.clone(true);
    // A matriz vem montada na mão a cada frame (a transformação está na
    // câmera), então o Three.js não deve recompô-la de position/rotation.
    no.matrixAutoUpdate = false;
    no.matrix.identity();
    no.visible = false;
    this.scene.add(no);
    this.nos[op] = no;
  }

  /**
   * Pixels por metro no ponto dado — medido projetando dois pontos a 1 m de
   * distância, em vez de reimplementar a fórmula de tile do Mapbox. Com o
   * mapa inclinado isto varia MUITO entre a base da tela e o horizonte, daí
   * ser medido por torre e não uma vez por frame.
   */
  private pixelsPorMetroEm(lng: number, lat: number): number {
    const map = this.map;
    if (!map) return 1;
    const grausPorMetro = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
    const a = map.project([lng, lat]);
    const b = map.project([lng + grausPorMetro, lat]);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  render(gl: WebGLRenderingContext, matrix: number[]): void {
    const map = this.map;
    if (!map || this.torres.length === 0) return;
    if (map.getPitch() < MIN_PITCH) return;

    const temAlgumModelo = this.nos.claro || this.nos.vivo;
    if (!temAlgumModelo) return;

    // ── culling: só o que está na viewport, e só as mais próximas do centro
    const b = map.getBounds();
    if (!b) return;
    const oeste = b.getWest(), leste = b.getEast();
    const sul = b.getSouth(), norte = b.getNorth();
    const centro = map.getCenter();

    const candidatas: { t: Torre; d2: number }[] = [];
    for (const t of this.torres) {
      if (t.lng < oeste || t.lng > leste || t.lat < sul || t.lat > norte) continue;
      if (!this.nos[t.op]) continue;
      const dx = t.lng - centro.lng, dy = t.lat - centro.lat;
      candidatas.push({ t, d2: dx * dx + dy * dy });
    }
    if (candidatas.length === 0) return;
    candidatas.sort((p, q) => p.d2 - q.d2);
    if (candidatas.length > MAX_TORRES) candidatas.length = MAX_TORRES;

    // ── estado de GL: resetState() do Three.js desfaz o que o Mapbox tinha
    // configurado (framebuffer, viewport, depthRange). As linhas abaixo
    // devolvem tudo ao lugar.
    const fboDoMapbox = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    this.renderer.resetState();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboDoMapbox);
    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.depthRange(0, 1);

    // LIMPA O DEPTH: o Mapbox escreve profundidade numa faixa comprimida
    // dele, incomparável com a faixa cheia reposta acima — sem limpar, o que
    // fica rente ao solo é descartado pelo rasterizador, e uma torre começa
    // exatamente no solo. Limpo uma vez só (não por torre), então as torres
    // continuam se ocluindo corretamente ENTRE SI.
    //
    // Efeito colateral aceito: a torre passa a desenhar por cima dos prédios
    // extrudados, mesmo quando está atrás de um. Numa torre — alta e usada
    // como referência de cobertura — ficar visível é o comportamento certo;
    // é o mesmo trade-off que a camada dos técnicos já faz com os marcadores.
    this.renderer.clearDepth();

    for (const { t } of candidatas) {
      const pxPorMetro = this.pixelsPorMetroEm(t.lng, t.lat);
      if (t.alturaM * pxPorMetro < ALTURA_MIN_PX) continue;

      const no = this.nos[t.op]!;
      const metroEmMercator = new mapboxgl.MercatorCoordinate(t.x, t.y, t.z)
        .meterInMercatorCoordinateUnits();
      const escala = metroEmMercator * t.alturaM;

      // Escala POSITIVA nos três eixos: determinante negativo (a convenção
      // usual de negativar Y, porque o Mercator cresce pra sul) inverte tudo
      // que deriva orientação no shader e já custou o normalMap na camada
      // dos técnicos. Sem negativar, o modelo fica espelhado
      // esquerda/direita — imperceptível numa torre, que é simétrica.
      SCRATCH_MODELO
        .makeTranslation(t.x, t.y, t.z)
        .multiply(SCRATCH_SCALE.makeScale(escala, escala, escala));

      this.camera.projectionMatrix.fromArray(matrix).multiply(SCRATCH_MODELO);

      no.visible = true;
      this.renderer.render(this.scene, this.camera);
      no.visible = false;
    }

    // Torre não anima: nenhum triggerRepaint aqui. O Mapbox só redesenha
    // quando o mapa realmente muda, que é o que o pedido descreve
    // ("seria fixo e sem movimentação").
  }

  onRemove(): void {
    for (const op of ["claro", "vivo"] as const) {
      const no = this.nos[op];
      if (no) this.scene.remove(no);
      this.nos[op] = undefined;
    }
    // Os templates NÃO são descartados: vivem no módulo e são reaproveitados
    // pela próxima camada (toda troca de estilo cria uma). Descartar aqui
    // forçaria rebaixar os GLB a cada troca de Padrão/Satélite/Híbrido.
    this.renderer.dispose();
  }
}
