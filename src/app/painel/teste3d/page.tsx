"use client";

/**
 * Página de teste ISOLADA de orientação de modelo 3D no Mapbox.
 *
 * Existe porque acertar orientação por dedução já custou várias rodadas neste
 * projeto (a picape andou de ré, o capacete deitou). Ver as variantes LADO A
 * LADO num cenário fixo responde em um print o que a dedução erra repetidas
 * vezes.
 *
 * Mostra o mesmo modelo quatro vezes, cada um com uma rotação de base
 * diferente, alinhados de oeste pra leste e rotulados A/B/C/D.
 */

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { asset } from "@/utils/asset";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const CENTRO: [number, number] = [-44.1470146, -19.9553592];
const LAYER_ID = "vm-teste-orientacao";
const ALTURA_M = 12; // exagerado de proposito: aqui o que importa e a POSE
const ESPACO_M = 25;

const VARIANTES = [
  { id: "A", rot: [0, 0, 0], desc: "sem rotacao (modelo como veio)" },
  { id: "B", rot: [Math.PI / 2, 0, 0], desc: "X +90 (convencao glTF Y-up)" },
  { id: "C", rot: [-Math.PI / 2, 0, 0], desc: "X -90" },
  { id: "D", rot: [Math.PI / 2, 0, Math.PI], desc: "X +90 e Z 180" },
] as const;

function desloca(lng: number, lat: number, leste: number): [number, number] {
  const mPorGrau = 111320 * Math.cos((lat * Math.PI) / 180);
  return [lng + leste / mPorGrau, lat];
}

class LayerOrientacao implements mapboxgl.CustomLayerInterface {
  id = LAYER_ID;
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map?: mapboxgl.Map;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private renderer!: THREE.WebGLRenderer;
  private itens: Array<{ obj: THREE.Object3D; lng: number; lat: number }> = [];

  constructor(private onLog: (s: string) => void) {}

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

    new GLTFLoader().load(
      asset("/person1.glb"),
      (gltf) => {
        VARIANTES.forEach((v, i) => {
          const clone = gltf.scene.clone(true);
          clone.rotation.set(v.rot[0], v.rot[1], v.rot[2]);
          clone.updateMatrixWorld(true);

          // Escala pela MAIOR dimensao apos a rotacao — aqui nao interessa
          // qual eixo e "altura", so caber igual pra comparar as poses.
          const cx = new THREE.Box3().setFromObject(clone);
          const t = new THREE.Vector3();
          cx.getSize(t);
          clone.scale.setScalar(ALTURA_M / Math.max(t.x, t.y, t.z));

          clone.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            if (!m.geometry.getAttribute("normal")) m.geometry.computeVertexNormals();
            const mat = m.material as THREE.MeshStandardMaterial;
            if (mat?.isMeshStandardMaterial) {
              mat.metalness = 0;
              mat.metalnessMap = null;
              mat.roughness = 0.7;
              mat.needsUpdate = true;
            }
          });

          const grupo = new THREE.Group();
          grupo.matrixAutoUpdate = false;
          grupo.add(clone);
          this.scene.add(grupo);
          const [lng, lat] = desloca(CENTRO[0], CENTRO[1], (i - 1.5) * ESPACO_M);
          this.itens.push({ obj: grupo, lng, lat });
        });
        this.onLog(`person1.glb carregado — ${VARIANTES.length} variantes`);
        map.triggerRepaint();
      },
      undefined,
      (e) => this.onLog("ERRO ao carregar: " + String(e))
    );
  }

  render(gl: WebGLRenderingContext, matrix: number[]): void {
    const fbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    this.renderer.resetState();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.depthRange(0, 1);
    this.renderer.clearDepth();

    for (const { obj } of this.itens) obj.visible = false;
    for (const { obj, lng, lat } of this.itens) {
      const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0);
      const s = m.meterInMercatorCoordinateUnits();
      // Transformacao na matriz da CAMERA (precisao) — ver techModel3DLayer.
      this.camera.projectionMatrix
        .fromArray(matrix)
        .multiply(
          new THREE.Matrix4()
            .makeTranslation(m.x, m.y, m.z ?? 0)
            .multiply(new THREE.Matrix4().makeScale(s, s, s))
        );
      obj.visible = true;
      this.renderer.render(this.scene, this.camera);
      obj.visible = false;
    }
    for (const { obj } of this.itens) obj.visible = true;
  }

  onRemove(): void {
    this.renderer.dispose();
  }
}

export default function TesteOrientacao() {
  const elRef = useRef<HTMLDivElement | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (!TOKEN || !elRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: elRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: CENTRO,
      zoom: 18.5,
      pitch: 55,
      antialias: true,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("style.load", () => {
      map.setProjection("mercator");
      if (!map.getLayer(LAYER_ID)) {
        map.addLayer(new LayerOrientacao((s) => setLogs((l) => [...l, s])));
      }
      VARIANTES.forEach((v, i) => {
        const [lng, lat] = desloca(CENTRO[0], CENTRO[1], (i - 1.5) * ESPACO_M);
        const el = document.createElement("div");
        el.textContent = v.id;
        el.style.cssText =
          "width:22px;height:22px;border-radius:9999px;background:#00B388;color:#fff;" +
          "font:700 12px/22px system-ui;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.3)";
        new mapboxgl.Marker({ element: el, anchor: "top", offset: [0, 6] })
          .setLngLat([lng, lat])
          .addTo(map);
      });
    });
    return () => map.remove();
  }, []);

  if (!TOKEN) return <div className="p-6">NEXT_PUBLIC_MAPBOX_TOKEN ausente.</div>;

  return (
    <div className="relative h-screen w-full">
      <div ref={elRef} className="h-full w-full" />
      <div className="absolute left-3 top-3 rounded-lg bg-white/95 p-3 font-mono text-xs shadow-lg">
        <div className="mb-1 font-bold">orientação do person1.glb</div>
        {VARIANTES.map((v) => (
          <div key={v.id}>
            <b>{v.id}</b> — {v.desc}
          </div>
        ))}
        <div className="mt-2 text-[10px] text-neutral-600">
          Qual está EM PÉ e de frente? Gire e incline o mapa pra conferir.
        </div>
        {logs.map((l, i) => (
          <div key={i} className="mt-1 text-[10px] text-emerald-700">{l}</div>
        ))}
      </div>
    </div>
  );
}
