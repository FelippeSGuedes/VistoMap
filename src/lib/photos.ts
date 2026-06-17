"use client";

/**
 * Armazenamento local de fotos pra modo offline.
 *
 * APK (Capacitor native) → @capacitor/filesystem grava direto no disco do
 * device em Directory.Data. Path persistente entre sessoes.
 * Web (browser) → fallback IndexedDB blob (sem Capacitor).
 *
 * Convencao path: vistomap/photos/<vistoriaId>/<uid>.jpg
 */

import { getOfflineDB as getDB, STORE_PHOTOS } from "./offlineDb";

export interface SavedPhoto {
  /** Caminho relativo no Filesystem OU key no IndexedDB */
  path: string;
  /** MIME do arquivo */
  mime: string;
  /** Bytes (informativo, nao retornado em loadPhoto) */
  size: number;
  /** Onde realmente esta — usado pra ler de volta */
  storage: "filesystem" | "indexeddb";
  /** vistoriaId associada (pra cleanup em massa) */
  vistoriaId: string | number;
  /** ISO timestamp */
  createdAt: string;
}

interface CapFilesystem {
  writeFile: (opts: {
    path: string;
    data: string;
    directory: string;
    recursive?: boolean;
  }) => Promise<{ uri: string }>;
  readFile: (opts: {
    path: string;
    directory: string;
  }) => Promise<{ data: string }>;
  deleteFile: (opts: { path: string; directory: string }) => Promise<void>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { Filesystem?: CapFilesystem };
}

function getFilesystem(): CapFilesystem | null {
  if (typeof window === "undefined") return null;
  const cap = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.Filesystem ?? null;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const result = r.result as string;
      // result = "data:image/jpeg;base64,XXXX..." → corta o prefix
      resolve(result.split(",")[1] ?? "");
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Converte base64 → Blob usando fetch(data:url) pra não bloquear a thread JS.
 * O loop charCodeAt síncrono travava o Android WebView em fotos/vídeos grandes,
 * causando o diálogo "App não está respondendo" e o loop de crash.
 */
async function base64ToBlob(b64: string, mime: string): Promise<Blob> {
  try {
    return await fetch(`data:${mime};base64,${b64}`).then((r) => r.blob());
  } catch {
    // Fallback para contextos onde data-URL não é aceita (improvável, mas seguro).
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: mime });
  }
}

export async function savePhoto(
  blob: Blob,
  vistoriaId: string | number
): Promise<SavedPhoto> {
  const path = `vistomap/photos/${vistoriaId}/${uid()}.${
    blob.type.includes("png") ? "png" : "jpg"
  }`;
  const mime = blob.type || "image/jpeg";
  const size = blob.size;
  const createdAt = new Date().toISOString();

  const fs = getFilesystem();
  if (fs) {
    const b64 = await blobToBase64(blob);
    await fs.writeFile({
      path,
      data: b64,
      directory: "DATA",
      recursive: true,
    });
    const meta: SavedPhoto = {
      path,
      mime,
      size,
      storage: "filesystem",
      vistoriaId,
      createdAt,
    };
    // Metadata em IndexedDB pra listagem rapida
    const db = await getDB();
    await db.put(STORE_PHOTOS, meta);
    return meta;
  }

  // Fallback web: IndexedDB blob
  const db = await getDB();
  await db.put(STORE_PHOTOS, {
    path,
    blob,
    mime,
    size,
    storage: "indexeddb",
    vistoriaId,
    createdAt,
  });
  return { path, mime, size, storage: "indexeddb", vistoriaId, createdAt };
}

export async function loadPhoto(path: string): Promise<Blob | null> {
  const db = await getDB();
  const meta = (await db.get(STORE_PHOTOS, path)) as
    | (SavedPhoto & { blob?: Blob })
    | undefined;
  if (!meta) return null;

  if (meta.storage === "indexeddb" && meta.blob) {
    return meta.blob;
  }
  if (meta.storage === "filesystem") {
    const fs = getFilesystem();
    if (!fs) return null;
    const r = await fs.readFile({ path, directory: "DATA" });
    return await base64ToBlob(r.data, meta.mime);
  }
  return null;
}

export async function deletePhoto(path: string): Promise<void> {
  const db = await getDB();
  const meta = (await db.get(STORE_PHOTOS, path)) as SavedPhoto | undefined;
  if (!meta) return;
  if (meta.storage === "filesystem") {
    const fs = getFilesystem();
    if (fs) {
      try {
        await fs.deleteFile({ path, directory: "DATA" });
      } catch {
        /* tudo bem se arquivo ja foi */
      }
    }
  }
  await db.delete(STORE_PHOTOS, path);
}

export async function photosByVistoria(
  vistoriaId: string | number
): Promise<SavedPhoto[]> {
  const db = await getDB();
  const idx = db.transaction(STORE_PHOTOS).store.index("byVistoria");
  const all = (await idx.getAll(String(vistoriaId))) as SavedPhoto[];
  return all;
}
