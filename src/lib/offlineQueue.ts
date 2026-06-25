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

/**
 * DISJUNTOR DE CRASH: chamado no boot. Uma op em 'running' significa que o app
 * morreu NO MEIO do envio (provável ANR/OOM no upload). Pra NÃO entrar em loop
 * de crash ("abre e fecha"), após 2 interrupções a op vai pra 'failed'
 * (quarentena) em vez de re-tentar automaticamente. Ninguém perde dado — fica
 * na fila e pode ser reenviado manualmente (botão "tentar enviar").
 */
export async function resetRunning(): Promise<void> {
  const db = await getDB();
  const all = (await db.getAll(STORE_QUEUE)) as QueuedOperation[];
  for (const op of all) {
    if (op.status === "running") {
      const interrupts = (op.attempts ?? 0) + 1;
      op.attempts = interrupts;
      op.status = interrupts >= 2 ? "failed" : "pending";
      op.lastError = "interrompido no envio (app reiniciou)";
      await db.put(STORE_QUEUE, op);
    }
  }
}

/** Retorna todas as ops em quarentena com seus erros (para exibir na UI). */
export async function failedOps(): Promise<QueuedOperation[]> {
  const db = await getDB();
  const all = (await db.getAll(STORE_QUEUE)) as QueuedOperation[];
  return all.filter((o) => o.status === "failed");
}

/** Remove permanentemente as ops em quarentena (descarte manual pelo técnico). */
export async function discardFailed(): Promise<number> {
  const db = await getDB();
  const all = (await db.getAll(STORE_QUEUE)) as QueuedOperation[];
  let n = 0;
  for (const op of all) {
    if (op.status === "failed") {
      await db.delete(STORE_QUEUE, op.id);
      n++;
    }
  }
  return n;
}

/** Reativa as ops em quarentena (failed → pending). Reenvio manual. */
export async function retryFailed(): Promise<number> {
  const db = await getDB();
  const all = (await db.getAll(STORE_QUEUE)) as QueuedOperation[];
  let n = 0;
  for (const op of all) {
    if (op.status === "failed") {
      op.status = "pending";
      op.attempts = 0;
      delete op.lastError;
      await db.put(STORE_QUEUE, op);
      n++;
    }
  }
  return n;
}

/** Contagem por estado pra UI (pendentes/enviando vs. em quarentena). */
export async function counts(): Promise<{ pending: number; failed: number }> {
  const db = await getDB();
  const all = (await db.getAll(STORE_QUEUE)) as QueuedOperation[];
  let pending = 0;
  let failed = 0;
  for (const op of all) {
    if (op.status === "failed") failed++;
    else pending++;
  }
  return { pending, failed };
}

// Rede de campo oscila muito → tolera muitas tentativas antes de desistir.
// Cada tentativa só conta quando há internet; offline nem tenta. Erro de rede
// é tolerado (retoma sozinho); erro permanente vai pra quarentena na hora.
const MAX_ATTEMPTS = 20;

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
      const isNet = /network|fetch|offline|timeout|abort|conn/i.test(msg);
      const db = await getDB();
      const cur = (await db.get(STORE_QUEUE, op.id)) as QueuedOperation | undefined;
      if (cur) {
        // Rede ruim → volta pra 'pending' e tenta no próximo ciclo.
        // Erro PERMANENTE (ex.: arquivo ausente, payload inválido) → 'failed'
        // (quarentena) pra NÃO retentar infinitamente ("demora horrores").
        cur.status = isNet ? "pending" : "failed";
        cur.lastError = msg;
        await db.put(STORE_QUEUE, cur);
      }
      if (isNet) break; // para o drain; retoma no próximo trigger/online
      failed++;
    }
  }
  return { ok, failed, remaining: (await pending()).length };
}
