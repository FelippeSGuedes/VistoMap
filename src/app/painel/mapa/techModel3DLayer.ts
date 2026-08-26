"use client";

/**
 * TechModel3DLayer — camada 3D (Three.js) dentro do Mapbox GL JS que
 * desenha UM objeto por técnico visível: um carro (car.glb) seguindo a
 * rota real quando em deslocamento, ou um "beacon" (geometria Three.js
 * pura) quando parado/em vistoria.
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
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import mapboxgl from "mapbox-gl";
import { asset } from "@/utils/asset";
import { sampleRouteAt, projectOntoRoute, type RouteResult } from "./routeService";

export const TECH_MODEL_LAYER_ID = "vm-tech-3d-model";

const TWEEN_MS = 800; // mesma duração do animateMarkerTo (page.tsx)
const MODEL_COLOR = 0x00d4a0; // mesmo teal-neon usado no resto da identidade visual
const IDLE_RADIUS_M = 10;

// Calibrados olhando o modelo real rodar no mapa — não dá pra cravar sem
// testar visualmente (ver passo de verificação no plano da Fase 1).
// CAR_MODEL_SCALE=1 media 0.487 x 1.000 x 0.411 "metros" (log [vm-3d] car.glb
// carregado) — o modelo foi exportado normalizado num cubo unitário, não em
// metros reais. 4.5 escala a maior dimensão (1.000) pra ~4.5m, do tamanho de
// um carro real (proporção resultante ≈ 2.2m x 4.5m x 1.85m).
const CAR_MODEL_SCALE = 4.5;
const CAR_BASE_ROTATION_X = Math.PI / 2; // GLTF Y-up → embedding do Mapbox (Z "pra cima")
const HEADING_AXIS: "y" | "z" = "z";
const HEADING_SIGN = -1;
const DEBUG_LOG = true;

// O material original do car.glb (pintura metálica) fica praticamente
// espelhado sem um environment map — e COM environment map reflete as
// paredes do ambiente sintético, parecendo manchas/geometria quebrada num
// ícone pequeno de mapa (ver histórico do commit). Achata o material em vez
// de tentar acertar reflexo: sem brilho de espelho, não precisa de env map.
const CAR_MAX_METALNESS = 0.35;
const CAR_MIN_ROUGHNESS = 0.55;

function clampCarMaterials(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat) => {
      const m = mat as THREE.MeshStandardMaterial;
      if (!m.isMeshStandardMaterial) return;
      m.metalness = Math.min(m.metalness, CAR_MAX_METALNESS);
      m.roughness = Math.max(m.roughness, CAR_MIN_ROUGHNESS);
    });
  });
}

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
  visual: THREE.Object3D | null; // filho atual (clone do carro ou beacon)
  visualIsCar: boolean;
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

  private carTemplate: THREE.Object3D | null = null;
  private carUsesSkeletonClone = false;
  private carLoadingPromise: Promise<THREE.Object3D> | null = null;
  private loggedFirstRenderFor = new Set<number>();

  // Geometria/material do beacon idle — compartilhados entre todas as
  // instâncias (procedural, barato de reusar; só descartados no onRemove).
  private idleRingGeo!: THREE.TorusGeometry;
  private idleRingMat!: THREE.MeshBasicMaterial;
  private idleCoreGeo!: THREE.IcosahedronGeometry;
  private idleCoreMat!: THREE.MeshBasicMaterial;

  onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext): void {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();

    // O carro tem material PBR (o GLB traz textura/metalness/roughness) —
    // precisa de luz de verdade, ao contrário do beacon (MeshBasicMaterial,
    // sempre na cor cheia, não depende de luz). Metalness alto sem
    // environment map renderiza preto; COM environment map (testado com
    // RoomEnvironment) o carro vira um espelho refletindo as paredes
    // coloridas do ambiente sintético — parece "manchas"/geometria quebrada
    // num ícone pequeno de mapa. Em vez de reflexo, o material é achatado
    // (clampCarMaterials) pra não precisar de env map nenhum.
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

    this.loadCarTemplate();
  }

  private loadCarTemplate(): Promise<THREE.Object3D> {
    if (this.carLoadingPromise) return this.carLoadingPromise;
    this.carLoadingPromise = new Promise((resolve) => {
      new GLTFLoader().load(
        asset("/car.glb"),
        (gltf) => {
          const root = gltf.scene;
          let hasSkinned = false;
          root.traverse((o) => {
            if ((o as THREE.SkinnedMesh).isSkinnedMesh) hasSkinned = true;
          });
          this.carUsesSkeletonClone = hasSkinned;
          clampCarMaterials(root);
          root.rotation.x = CAR_BASE_ROTATION_X;
          root.scale.setScalar(CAR_MODEL_SCALE);
          this.carTemplate = root;
          if (DEBUG_LOG) {
            const box = new THREE.Box3().setFromObject(root);
            const size = new THREE.Vector3();
            box.getSize(size);
            // Tamanho já com CAR_MODEL_SCALE aplicado — deve parecer um
            // carro real (~4-5m de comprimento) agora que a escala foi
            // calibrada (era 0.487x1.000x0.411 "metros" com escala 1x,
            // confirmado normalizado num cubo unitário na exportação).
            // eslint-disable-next-line no-console
            console.log(
              `[vm-3d] car.glb carregado — tamanho final no mapa: ` +
              `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m`
            );
          }
          resolve(root);
          // Backfill: técnicos que já estavam "em carro" antes do modelo
          // carregar (até aqui, mostrando o beacon como placeholder).
          this.entries.forEach((e) => {
            if (e.kind === "car" && !e.visualIsCar) this.ensureVisual(e);
          });
        },
        undefined,
        (err) => {
          // eslint-disable-next-line no-console
          console.error("[vm-3d] falha ao carregar car.glb", err);
        }
      );
    });
    return this.carLoadingPromise;
  }

  private cloneCar(): THREE.Object3D {
    const tpl = this.carTemplate;
    if (!tpl) throw new Error("carTemplate ainda não carregado");
    // Clone raso da hierarquia — geometria/material compartilhados entre
    // clones (não duplica buffers de GPU por técnico).
    return this.carUsesSkeletonClone ? cloneSkeleton(tpl) : tpl.clone(true);
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
    const wantCar = e.kind === "car" && !!this.carTemplate;
    if (wantCar === e.visualIsCar && e.visual) return;
    if (e.visual) e.object3d.remove(e.visual);
    e.visual = wantCar ? this.cloneCar() : this.buildIdleBeacon();
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

  render(_gl: WebGLRenderingContext, matrix: number[]): void {
    this.camera.projectionMatrix.fromArray(matrix);

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
    // rota) ainda não terminou — mesmo fix de performance validado na
    // Fase 0 (sem isso, o mapa redesenha a 60fps o tempo todo em segundo
    // plano mesmo parado).
    if (anyTweenActive) this.map?.triggerRepaint();
  }

  onRemove(): void {
    this.entries.forEach((e) => this.scene.remove(e.object3d));
    this.entries.clear();

    this.idleRingGeo?.dispose();
    this.idleRingMat?.dispose();
    this.idleCoreGeo?.dispose();
    this.idleCoreMat?.dispose();

    if (this.carTemplate) {
      this.carTemplate.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if ((mesh as THREE.Mesh).isMesh) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((mat) => mat?.dispose());
        }
      });
    }

    this.renderer.dispose();
  }
}
