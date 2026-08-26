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
 * `object3d.position/rotation/scale` — o próprio Three.js compõe isso a
 * cada frame (matrixAutoUpdate), igual várias libs de integração
 * Mapbox+Three.js fazem pra múltiplos modelos numa cena só.
 *
 * Pré-requisito OBRIGATÓRIO no mapa hospedeiro: projeção "mercator" (ver
 * chamadas de map.setProjection() em page.tsx).
 */

import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { sampleRouteAt, projectOntoRoute, type RouteResult } from "./routeService";

export const TECH_MODEL_LAYER_ID = "vm-tech-3d-model";

const TWEEN_MS = 800; // mesma duração do animateMarkerTo (page.tsx)
const MODEL_COLOR = 0x00d4a0; // mesmo teal-neon usado no resto da identidade visual
const IDLE_RADIUS_M = 10;

// HEADING_AXIS/HEADING_SIGN calibram qual eixo local do objeto vira "pra
// frente" depois da rotação de heading (ver render()). Não foi possível
// validar visualmente ainda com um modelo reconhecível — se o nariz do
// carrinho não acompanhar a direção real de deslocamento em produção,
// ajustar HEADING_SIGN (inverte) primeiro antes de mexer no eixo.
const HEADING_AXIS: "y" | "z" = "z";
const HEADING_SIGN = -1;
const DEBUG_LOG = true;

// Dimensões do carrinho, em metros — proporção de um carro de passeio
// pequeno. Eixo local: X = largura, Y = comprimento ("frente" = +Y antes
// da rotação de heading), Z = altura (esse é o "up" da cena, não o Y do
// Three.js padrão — ver comentário sobre escala em render()).
const CAR_WIDTH = 1.85;
const CAR_BODY_LENGTH = 3.9;
const CAR_BODY_HEIGHT = 0.85;
const CAR_CABIN_WIDTH = 1.55;
const CAR_CABIN_LENGTH = 2.1;
const CAR_CABIN_HEIGHT = 0.62;
const CAR_WHEEL_RADIUS = 0.33;
const CAR_WHEEL_WIDTH = 0.24;

const CAR_BODY_COLOR = 0x123832; // verde-petróleo escuro, combina com o teal da marca
const CAR_CABIN_COLOR = 0x274b46;
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
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(0, -70, 100).normalize();
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(0, 70, 40).normalize();
    this.scene.add(fill);

    this.idleRingGeo = new THREE.TorusGeometry(IDLE_RADIUS_M, IDLE_RADIUS_M * 0.12, 12, 32);
    this.idleRingMat = new THREE.MeshBasicMaterial({ color: MODEL_COLOR, transparent: true, opacity: 0.55 });
    this.idleCoreGeo = new THREE.IcosahedronGeometry(IDLE_RADIUS_M * 0.45, 0);
    this.idleCoreMat = new THREE.MeshBasicMaterial({ color: MODEL_COLOR });

    this.carBodyGeo = new THREE.BoxGeometry(CAR_WIDTH, CAR_BODY_LENGTH, CAR_BODY_HEIGHT);
    this.carBodyMat = new THREE.MeshStandardMaterial({ color: CAR_BODY_COLOR, metalness: 0.2, roughness: 0.6 });
    this.carCabinGeo = new THREE.BoxGeometry(CAR_CABIN_WIDTH, CAR_CABIN_LENGTH, CAR_CABIN_HEIGHT);
    this.carCabinMat = new THREE.MeshStandardMaterial({ color: CAR_CABIN_COLOR, metalness: 0.1, roughness: 0.45 });
    // Eixo do cilindro rotacionado pra X (lateral) — permite girar em
    // rotation.x pra "rolar" pra frente/trás sem precisar de outra transform.
    this.carWheelGeo = new THREE.CylinderGeometry(CAR_WHEEL_RADIUS, CAR_WHEEL_RADIUS, CAR_WHEEL_WIDTH, 14);
    this.carWheelGeo.rotateZ(Math.PI / 2);
    this.carWheelMat = new THREE.MeshStandardMaterial({ color: CAR_WHEEL_COLOR, metalness: 0.15, roughness: 0.85 });

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
  }

  private buildCarModel(): { object3d: THREE.Object3D; wheels: THREE.Mesh[] } {
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
    const ring = new THREE.Mesh(this.idleRingGeo, this.idleRingMat);
    ring.rotation.x = Math.PI / 2; // deita o anel no "chão"
    group.add(ring);
    const core = new THREE.Mesh(this.idleCoreGeo, this.idleCoreMat);
    core.position.y = IDLE_RADIUS_M * 0.9;
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
      e.object3d.position.set(x, y, z);
      // Y negativo: Mercator Y cresce pra sul, Three.js é Y-up — Three.js
      // ajusta sozinho o winding de face com escala negativa (não quebra
      // culling), então isso é seguro pra qualquer geometria, simétrica ou não.
      e.object3d.scale.set(scale, -scale, scale);

      if (headingRad != null) {
        e.object3d.rotation.set(0, 0, 0);
        if (HEADING_AXIS === "z") e.object3d.rotation.z = HEADING_SIGN * headingRad;
        else e.object3d.rotation.y = HEADING_SIGN * headingRad;
      }

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

    this.renderer.dispose();
  }
}
