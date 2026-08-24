"use client";

/**
 * TechModel3DLayer — POC de custom layer Three.js dentro do Mapbox GL JS.
 *
 * Three.js puro (sem threebox — a lib só declara suporte oficial a
 * mapbox-gl v1.11/v2.x, e o projeto está em v3.7, risco real de
 * incompatibilidade). Segue o padrão oficial de CustomLayerInterface do
 * próprio Mapbox: o renderer do Three.js reusa o MESMO contexto WebGL do
 * mapa (canvas/gl passados em onAdd), e a cada render() a câmera do
 * Three.js é reprojetada a partir da matriz que o Mapbox fornece.
 *
 * Pré-requisito OBRIGATÓRIO no mapa hospedeiro: projeção "mercator" (não
 * "globe", que é o default do mapbox-gl v3) — CustomLayerInterface só se
 * comporta corretamente em mercator. Ver chamadas de map.setProjection()
 * em page.tsx.
 */

import * as THREE from "three";
import mapboxgl from "mapbox-gl";

export const TECH_MODEL_LAYER_ID = "vm-tech-3d-model";

const TWEEN_MS = 800; // mesma duração do animateMarkerTo (page.tsx)
const MODEL_RADIUS_M = 14;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface MercatorXY {
  x: number;
  y: number;
}

export class TechModel3DLayer implements mapboxgl.CustomLayerInterface {
  id = TECH_MODEL_LAYER_ID;
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map?: mapboxgl.Map;
  private camera!: THREE.Camera;
  private scene!: THREE.Scene;
  private renderer!: THREE.WebGLRenderer;
  private mesh!: THREE.Mesh;

  // Tween em espaço Mercator (x/y planos; altitude fixa em 0 nesta POC).
  private from: MercatorXY;
  private to: MercatorXY;
  private readonly z: number;
  private tweenStart = 0;

  constructor(initialLng: number, initialLat: number) {
    const m = mapboxgl.MercatorCoordinate.fromLngLat([initialLng, initialLat], 0);
    this.from = { x: m.x, y: m.y };
    this.to = { x: m.x, y: m.y };
    this.z = m.z ?? 0;
  }

  /** Chamado de fora (sync de técnicos) a cada novo fetch — dispara o tween. */
  setTargetPosition(lng: number, lat: number): void {
    // Interpola a partir da posição ATUAL do tween em andamento, não do
    // "to" antigo — evita salto se um novo alvo chegar no meio da animação.
    const frac = this.tweenProgress();
    this.from = {
      x: this.from.x + (this.to.x - this.from.x) * frac,
      y: this.from.y + (this.to.y - this.from.y) * frac,
    };
    const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0);
    this.to = { x: m.x, y: m.y };
    this.tweenStart = performance.now();
  }

  private tweenProgress(): number {
    const t = Math.min((performance.now() - this.tweenStart) / TWEEN_MS, 1);
    return easeOutCubic(t);
  }

  onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext): void {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();

    const light1 = new THREE.DirectionalLight(0xffffff, 1);
    light1.position.set(0, -70, 100).normalize();
    this.scene.add(light1);
    const light2 = new THREE.DirectionalLight(0xffffff, 0.6);
    light2.position.set(0, 70, 100).normalize();
    this.scene.add(light2);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    const geometry = new THREE.SphereGeometry(MODEL_RADIUS_M, 24, 24);
    const material = new THREE.MeshStandardMaterial({ color: 0x00c896, emissive: 0x003322 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    // Reusa o canvas do próprio Mapbox — NÃO chamar setSize(), quem
    // controla o tamanho do canvas é o mapa.
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
  }

  render(_gl: WebGLRenderingContext, matrix: number[]): void {
    const frac = this.tweenProgress();
    const x = this.from.x + (this.to.x - this.from.x) * frac;
    const y = this.from.y + (this.to.y - this.from.y) * frac;

    // Rotação contínua só pra provar que o loop roda sem interação do
    // usuário no mapa (map.triggerRepaint() sustenta o ciclo).
    this.mesh.rotation.z += 0.01;

    // Instanciado via construtor (x, y, z) — nunca via spread, que perde
    // o método meterInMercatorCoordinateUnits() e quebra a escala.
    const merc = new mapboxgl.MercatorCoordinate(x, y, this.z);
    const scale = merc.meterInMercatorCoordinateUnits();

    const m = new THREE.Matrix4().fromArray(matrix);
    const l = new THREE.Matrix4()
      .makeTranslation(x, y, this.z)
      // Y invertido: Mercator Y cresce pra sul, Three.js é Y-up. Esfera é
      // simétrica então isso não é visível aqui, mas vira obrigatório
      // assim que entrar um modelo assimétrico (carro etc.).
      .scale(new THREE.Vector3(scale, -scale, scale));

    this.camera.projectionMatrix = m.multiply(l);

    // Obrigatório a cada frame — Mapbox e Three.js dividem o mesmo
    // contexto GL e pisam no estado um do outro sem isso (sintoma
    // clássico: tiles do mapa ficam pretos/transparentes).
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);

    this.map?.triggerRepaint();
  }

  onRemove(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
