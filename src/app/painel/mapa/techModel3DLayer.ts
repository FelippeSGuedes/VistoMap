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
// 18m/cor cheia (MeshBasicMaterial, sem depender de luz) — validado que
// 14m com material com luz ficava sutil demais pra notar no mapa real.
const MODEL_RADIUS_M = 18;
const MODEL_COLOR = 0x00d4a0; // mesmo teal-neon usado no resto da identidade visual
const DEBUG_LOG = false; // já validado (posição/escala/projeção corretos) — reativa se precisar depurar de novo

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
  private loggedFirstRender = false;

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
    if (DEBUG_LOG) {
      // eslint-disable-next-line no-console
      console.log("[vm-3d] layer construída", { initialLng, initialLat, mercator: { x: m.x, y: m.y, z: this.z } });
    }
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
    if (DEBUG_LOG) {
      // eslint-disable-next-line no-console
      console.log("[vm-3d] setTargetPosition", { lng, lat });
    }
  }

  private tweenProgress(): number {
    const t = Math.min((performance.now() - this.tweenStart) / TWEEN_MS, 1);
    return easeOutCubic(t);
  }

  onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext): void {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();

    const geometry = new THREE.SphereGeometry(MODEL_RADIUS_M, 24, 24);
    // MeshBasicMaterial (sem luz) — fica sempre na cor cheia, consistente
    // em qualquer ângulo/hora do dia, no mesmo espírito neon do resto da
    // identidade visual (vis.png etc.). Quando entrar o modelo de
    // carro/pessoa de verdade (fase seguinte), reavaliar se cabe luz.
    const material = new THREE.MeshBasicMaterial({ color: MODEL_COLOR });
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

    if (DEBUG_LOG) {
      // eslint-disable-next-line no-console
      console.log("[vm-3d] onAdd rodou", {
        canvasSize: { w: map.getCanvas().width, h: map.getCanvas().height },
        isWebGL2: typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext,
        projection: map.getProjection?.(),
      });
    }
  }

  render(_gl: WebGLRenderingContext, matrix: number[]): void {
    const frac = this.tweenProgress();
    const x = this.from.x + (this.to.x - this.from.x) * frac;
    const y = this.from.y + (this.to.y - this.from.y) * frac;

    // Só gira enquanto o tween de posição está rolando (~800ms a cada
    // atualização real) — girar sem parar exigiria repaint a 60fps o
    // tempo todo, que foi o que deixou o mapa pesado no teste anterior.
    if (frac < 1) this.mesh.rotation.z += 0.01;

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

    if (DEBUG_LOG && !this.loggedFirstRender) {
      this.loggedFirstRender = true;
      // eslint-disable-next-line no-console
      console.log("[vm-3d] primeiro render()", {
        mercatorXYZ: { x, y, z: this.z },
        scale,
        matrixRecebidaDoMapbox: matrix,
        matrizFinal: this.camera.projectionMatrix.toArray(),
      });
    }

    // Obrigatório a cada frame — Mapbox e Three.js dividem o mesmo
    // contexto GL e pisam no estado um do outro sem isso (sintoma
    // clássico: tiles do mapa ficam pretos/transparentes).
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);

    // Só pede o próximo frame enquanto o tween ainda não terminou — fora
    // disso, o mapa só redesenha quando o usuário interage (comportamento
    // normal do Mapbox), sem custo de repaint contínuo em segundo plano.
    if (frac < 1) this.map?.triggerRepaint();
  }

  onRemove(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
