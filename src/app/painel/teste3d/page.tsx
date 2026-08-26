"use client";

/**
 * Página de teste ISOLADA do pipeline 3D (Three.js dentro do Mapbox).
 *
 * Existe porque depurar o veículo 3D dentro de /painel/mapa ficou inviável:
 * cada tentativa dependia de um técnico real em deslocamento, de rota
 * resolvida, de poll, e de um deploy de ~5min pra ver o resultado. Aqui o
 * cenário é fixo e mínimo.
 *
 * Desenha lado a lado, no mesmo frame e com a MESMA matriz:
 *   - um CUBO de 12m, geometria trivial, cor sólida;
 *   - o car.glb.
 *
 * Isso separa de uma vez as duas hipóteses que sobraram: se o cubo sai
 * inteiro e a picape não, o problema é do modelo; se os dois se
 * estilhaçam, é do pipeline (framebuffer/estado de GL).
 *
 * Chaves na URL, todas combináveis:
 *   ?fbo=0    não reassocia o framebuffer do Mapbox após resetState()
 *   ?depth=1  liga depthTest/depthWrite
 *   ?luz=1    usa material PBR com iluminação em vez de cor chapada
 *   ?reset=0  não chama resetState() (deixa o estado do Mapbox como está)
 */

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { asset } from "@/utils/asset";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const CENTRO: [number, number] = [-44.1470146, -19.9553592];
const LADO_M = 12;
const LAYER_ID = "vm-teste-3d";

/** Metros → offset em graus, pra posicionar os dois objetos lado a lado. */
function desloca(lng: number, lat: number, leste: number): [number, number] {
  const mPorGrauLng = 111320 * Math.cos((lat * Math.PI) / 180);
  return [lng + leste / mPorGrauLng, lat];
}

class LayerTeste implements mapboxgl.CustomLayerInterface {
  id = LAYER_ID;
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map?: mapboxgl.Map;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private renderer!: THREE.WebGLRenderer;
  private objetos: Array<{ obj: THREE.Object3D; lng: number; lat: number }> = [];

  constructor(
    private opts: { fbo: boolean; depth: boolean; luz: boolean; reset: boolean },
    private onLog: (s: string) => void
  ) {}

  onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.6);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);
    const sol = new THREE.DirectionalLight(0xffffff, 1.1);
    sol.position.set(0, -70, 100).normalize();
    this.scene.add(sol);

    const comum = { depthTest: this.opts.depth, depthWrite: this.opts.depth };

    // Cubo de referência — geometria trivial. Se ELE sair recortado, o
    // problema não tem nada a ver com o modelo importado.
    const matCubo = this.opts.luz
      ? new THREE.MeshStandardMaterial({ color: 0x00d4a0, metalness: 0, roughness: 0.8, ...comum })
      : new THREE.MeshBasicMaterial({ color: 0x00d4a0, ...comum });
    const cubo = new THREE.Mesh(new THREE.BoxGeometry(LADO_M, LADO_M, LADO_M), matCubo);
    cubo.position.z = LADO_M / 2;
    const grupoCubo = new THREE.Group();
    grupoCubo.add(cubo);
    grupoCubo.matrixAutoUpdate = false;
    this.scene.add(grupoCubo);
    this.objetos.push({ obj: grupoCubo, lng: CENTRO[0], lat: CENTRO[1] });
    this.onLog("cubo adicionado");

    const [lngCarro, latCarro] = desloca(CENTRO[0], CENTRO[1], 40);
    new GLTFLoader().load(
      asset("/car.glb"),
      (gltf) => {
        const raiz = gltf.scene;
        raiz.rotation.x = Math.PI / 2;
        raiz.updateMatrixWorld(true);
        const tam = new THREE.Vector3();
        new THREE.Box3().setFromObject(raiz).getSize(tam);
        raiz.scale.setScalar(LADO_M / (tam.y || 1));

        raiz.traverse((o) => {
          const malha = o as THREE.Mesh;
          if (!malha.isMesh) return;
          const mats = Array.isArray(malha.material) ? malha.material : [malha.material];
          malha.material = mats.map((mt) => {
            const src = mt as THREE.MeshStandardMaterial;
            if (this.opts.luz) {
              src.metalness = 0; src.metalnessMap = null;
              src.roughness = 0.8; src.roughnessMap = null;
              src.normalMap = null;
              src.depthTest = this.opts.depth; src.depthWrite = this.opts.depth;
              src.needsUpdate = true;
              return src;
            }
            return new THREE.MeshBasicMaterial({
              map: src.map ?? null,
              color: src.map ? 0xffffff : src.color.clone(),
              side: THREE.FrontSide,
              ...comum,
            });
          })[0] as THREE.Material;
        });

        const grupo = new THREE.Group();
        grupo.add(raiz);
        grupo.matrixAutoUpdate = false;
        this.scene.add(grupo);
        this.objetos.push({ obj: grupo, lng: lngCarro, lat: latCarro });
        this.onLog(`car.glb ok (${tam.x.toFixed(2)}x${tam.y.toFixed(2)}x${tam.z.toFixed(2)} orig)`);
        map.triggerRepaint();
      },
      undefined,
      (e) => this.onLog("ERRO car.glb: " + String(e))
    );
  }

  render(gl: WebGLRenderingContext, matrix: number[]): void {
    const fbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    if (this.opts.reset) this.renderer.resetState();
    if (this.opts.fbo) gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.depthRange(0, 1);

    // A transformação vai na matriz da CÂMERA, não na do objeto. Posicionar
    // o objeto em Mercator (~0.29) com escala ~2.6e-8 entrega ao shader uma
    // matriz float32 cujo incremento representável (~3e-8) é maior que boa
    // parte do próprio objeto — os vértices colapsam numa grade grosseira.
    // Compondo na projeção, os vértices ficam em metros e o offset enorme é
    // resolvido em float64 na CPU. Cada objeto é desenhado no seu próprio
    // passe, com sua própria matriz.
    for (const { obj } of this.objetos) obj.visible = false;

    for (const { obj, lng, lat } of this.objetos) {
      const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0);
      const s = m.meterInMercatorCoordinateUnits();
      const modelo = new THREE.Matrix4()
        .makeTranslation(m.x, m.y, m.z ?? 0)
        .multiply(new THREE.Matrix4().makeScale(s, s, s));
      this.camera.projectionMatrix.fromArray(matrix).multiply(modelo);

      obj.visible = true;
      this.renderer.render(this.scene, this.camera);
      obj.visible = false;
    }

    for (const { obj } of this.objetos) obj.visible = true;
  }

  onRemove(): void {
    this.renderer.dispose();
  }
}

export default function Teste3D() {
  const elRef = useRef<HTMLDivElement | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [opts, setOpts] = useState({ fbo: true, depth: false, luz: false, reset: true });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setOpts({
      fbo: q.get("fbo") !== "0",
      depth: q.get("depth") === "1",
      luz: q.get("luz") === "1",
      reset: q.get("reset") !== "0",
    });
  }, []);

  useEffect(() => {
    if (!TOKEN || !elRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: elRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: CENTRO,
      zoom: 18,
      pitch: 60,
      antialias: true,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("style.load", () => {
      map.setProjection("mercator");
      if (!map.getLayer(LAYER_ID)) {
        map.addLayer(new LayerTeste(opts, (s) => setLogs((l) => [...l, s])));
      }
    });
    return () => map.remove();
  }, [opts]);

  if (!TOKEN) return <div className="p-6">NEXT_PUBLIC_MAPBOX_TOKEN ausente.</div>;

  return (
    <div className="relative h-screen w-full">
      <div ref={elRef} className="h-full w-full" />
      <div className="absolute left-3 top-3 rounded-lg bg-white/95 p-3 font-mono text-xs shadow-lg">
        <div className="mb-1 font-bold">teste 3D isolado</div>
        <div>cubo 12m (teal) · picape 40m a leste</div>
        <div className="mt-1">
          fbo={String(opts.fbo)} depth={String(opts.depth)} luz={String(opts.luz)} reset={String(opts.reset)}
        </div>
        <div className="mt-2 text-[10px] leading-relaxed text-neutral-600">
          ?fbo=0 · ?depth=1 · ?luz=1 · ?reset=0
        </div>
        {logs.map((l, i) => (
          <div key={i} className="mt-1 text-[10px] text-emerald-700">{l}</div>
        ))}
      </div>
    </div>
  );
}
