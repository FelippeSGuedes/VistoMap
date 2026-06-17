"use client";

/**
 * Fila de operacoes offline pra sincronizar quando voltar internet.
 *
 * Storage: IndexedDB (via idb wrapper). Survives page reload + app restart.
 *
 * Operacoes suportadas (Escopo A):
 *  - finalize-vistoria: finaliza vistoria depois (via /api/vistorias/[id]/finalizar)
 *  - upload-photo: envia foto salva no Filesystem (via /api/vistorias/[id]/files)
 *
 * Processo:
 *  1. App offline → fluxos chamam enqueue(op) em vez do fetch direto
 *  2. Job fica em IndexedDB com status=pending, attempts=0
 *  3. Listener "online" + intervalo de 30s tenta drainQueue()
 *  4. Sucesso → remove job. Falha → incrementa attempts + backoff
 *  5. Apos 10 attempts → status=failed (admin checa manualmente)
 */

import { getOfflineDB as getDB, STORE_QUEUE } from "./offlineDb";

export type OperationType = "finalize-vistoria" | "upload-photo" | "iniciar-vistoria";

export interface QueuedOperation {
  id: string;
  type: OperationType;
  payload: Record<string, unknown>;
  vistoriaId: string | number;
  createdAt: number;
  attempts: number;
  lastError?: string;
  status: "pending" | "running" | "failed";
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function enqueue(
  op: Omit<QueuedOperation, "id" | "createdAt" | "attempts" | "status">
): Promise<string> {
  const db = await getDB();
  const id = uid();
  const record: QueuedOperation = {
    ...op,
    id,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
  await db.put(STORE_QUEUE, record);
  console.log("[offlineQueue] enqueued", record);
  return id;
}

export async function pending(): Promise<QueuedOperation[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_QUEUE);
  return (all as QueuedOperation[])
    .filter((o) => o.status !== "failed")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function pendingByVistoria(
  vistoriaId: string | number
): Promise<QueuedOperation[]> {
  const all = await pending();
  return all.filter((o) => String(o.vistoriaId) === String(vistoriaId));
}

export async function pendingCount(): Promise<number> {
  return (await pending()).length;
}

export async function remove(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_QUEUE, id);
}

export async function markFailed(id: string, error: string): Promise<void> {
  const db = await getDB();
  const op = (await db.get(STORE_QUEUE, id)) as QueuedOperation | undefined;
  if (!op) return;
  op.status = "failed";
  op.lastError = error;
  await db.put(STORE_QUEUE, op);
}

export async function markRunning(id: string): Promise<void> {
  const db = await getDB();
  const op = (await db.get(STORE_QUEUE, id)) as QueuedOperation | undefined;
  if (!op) return;
  op.status = "running";
  op.attempts += 1;
  await db.put(STORE_QUEUE, op);
}

export async function resetRunning(): Promise<void> {
  const db = await getDB();
  const all = (await db.getAll(STORE_QUEUE)) as QueuedOperation[];
  for (const op of all) {
    if (op.status === "running") {
      op.status = "pending";
      await db.put(STORE_QUEUE, op);
    }
  }
}

// Rede de campo oscila muito → tolera muitas tentativas antes de desistir.
// Cada tentativa só conta quando há internet; offline nem tenta.
const MAX_ATTEMPTS = 100;

export interface DrainResult {
  ok: number;
  failed: number;
  remaining: number;
}

/**
 * Processa fila — chama o executor pra cada operacao pendente em ordem.
 * Retorna stats. Para na 1a falha de rede (assume offline volta).
 */
export async function drainQueue(
  executor: (op: QueuedOperation) => Promise<void>
): Promise<DrainResult> {
  const ops = await pending();
  let ok = 0;
  let failed = 0;
  for (const op of ops) {
    if (op.attempts >= MAX_ATTEMPTS) {
      await markFailed(op.id, "max attempts");
      failed++;
      continue;
    }
    try {
      await markRunning(op.id);
      await executor(op);
      await remove(op.id);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[offlineQueue] op ${op.id} falhou (att ${op.attempts}):`, msg);
      // reset pra pending pra tentar de novo
      const db = await getDB();
      const cur = (await db.get(STORE_QUEUE, op.id)) as QueuedOperation | undefined;
      if (cur) {
        cur.status = "pending";
        cur.lastError = msg;
        await db.put(STORE_QUEUE, cur);
      }
      // Se for falha de rede, para o drain. Backoff fica pro proximo trigger.
      if (msg.match(/network|fetch|offline|timeout/i)) break;
      failed++;
    }
  }
  return { ok, failed, remaining: (await pending()).length };
}
