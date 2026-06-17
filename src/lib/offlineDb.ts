"use client";

/**
 * Banco IndexedDB compartilhado do modo offline.
 *
 * IMPORTANTE: a fila (offlineQueue) e as fotos (photos) usam o MESMO banco
 * (`vistomap-offline`). Por isso a criação dos stores precisa estar num único
 * lugar — senão cada módulo abre o banco na sua versão e cria só o seu store,
 * fazendo o outro store "sumir" ("object stores was not found").
 *
 * Versão 2: cria os dois stores e migra bancos v1 antigos (que tinham só um).
 */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "vistomap-offline";
const DB_VERSION = 3;

export const STORE_QUEUE = "queue";
export const STORE_PHOTOS = "photos";
/** Cache offline-first de dados (lista de vistorias, detalhe, etc.). */
export const STORE_CACHE = "cache";

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getOfflineDB(): Promise<IDBPDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB nao disponivel (SSR?)");
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const q = db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
          q.createIndex("byStatus", "status");
          q.createIndex("byVistoria", "vistoriaId");
        }
        if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
          const p = db.createObjectStore(STORE_PHOTOS, { keyPath: "path" });
          p.createIndex("byVistoria", "vistoriaId");
        }
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          db.createObjectStore(STORE_CACHE, { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

/* ── Cache offline-first (best-effort; nunca lança) ──────────────────── */

interface CacheRecord<T> {
  key: string;
  data: T;
  savedAt: number;
}

/** Salva dados no cache offline. Silencioso em qualquer falha. */
export async function cachePut<T>(key: string, data: T): Promise<void> {
  try {
    if (typeof indexedDB === "undefined") return;
    const db = await getOfflineDB();
    await db.put(STORE_CACHE, { key, data, savedAt: Date.now() } as CacheRecord<T>);
  } catch (err) {
    console.warn("[offlineCache] put falhou:", err);
  }
}

/** Lê dados do cache offline. Retorna null se ausente ou em qualquer falha. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    if (typeof indexedDB === "undefined") return null;
    const db = await getOfflineDB();
    const rec = (await db.get(STORE_CACHE, key)) as CacheRecord<T> | undefined;
    return rec?.data ?? null;
  } catch (err) {
    console.warn("[offlineCache] get falhou:", err);
    return null;
  }
}
