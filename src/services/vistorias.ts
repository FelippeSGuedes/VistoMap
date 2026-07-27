import { api } from "./api";
import type {
  CaptureBundle,
  DashboardStats,
  Vistoria,
  VistoriaPayload,
} from "@/types";
import { MOCK_STATS, MOCK_VISTORIAS } from "@/utils/mock";

const ALLOW_FALLBACK = process.env.NODE_ENV !== "production";

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return MOCK_STATS;
}

/* ── Cache offline-first (best-effort, via IndexedDB compartilhado) ──── */
async function cachePutSafe<T>(key: string, data: T): Promise<void> {
  try {
    const m = await import("@/lib/offlineDb");
    await m.cachePut(key, data);
  } catch {
    /* sem IndexedDB / SSR — ignora */
  }
}
async function cacheGetSafe<T>(key: string): Promise<T | null> {
  try {
    const m = await import("@/lib/offlineDb");
    return await m.cacheGet<T>(key);
  } catch {
    return null;
  }
}

/**
 * Lista de vistorias — offline-first.
 * Online: busca, cacheia e retorna. Offline/erro de rede: retorna o último
 * cache salvo (vazio se nunca sincronizou online).
 */
export async function fetchVistorias(): Promise<Vistoria[]> {
  try {
    const data = (await api.get<Vistoria[]>("/vistorias")).data;
    void cachePutSafe("vistorias:list", data);
    return data;
  } catch (err) {
    const cached = await cacheGetSafe<Vistoria[]>("vistorias:list");
    if (cached && cached.length) return cached;
    if (ALLOW_FALLBACK) return MOCK_VISTORIAS;
    throw err;
  }
}

/**
 * Vistorias CONCLUÍDAS/finalizadas do técnico (últimos 60 dias) — offline-first.
 */
export async function fetchVistoriasConcluidas(): Promise<Vistoria[]> {
  try {
    const data = (await api.get<Vistoria[]>("/vistorias?concluidas=1")).data;
    void cachePutSafe("vistorias:concluidas", data);
    return data;
  } catch {
    const cached = await cacheGetSafe<Vistoria[]>("vistorias:concluidas");
    return cached ?? [];
  }
}

export interface DropdownOption {
  id: number;
  name: string;
}

/**
 * Opções de um dropdown do GLPI (ex.: tipoifield → 2G/3G/4G), pra popular
 * <select> no formulário. Cacheia por chave — são listas pequenas e estáveis,
 * não precisam de fetch a cada abertura de tela offline.
 */
export async function fetchDropdownOptions(key: string): Promise<DropdownOption[]> {
  const cacheKey = `dropdown-options:${key}`;
  try {
    const data = (
      await api.get<DropdownOption[]>(`/vistorias/dropdown-options?key=${key}`)
    ).data;
    void cachePutSafe(cacheKey, data);
    return data;
  } catch {
    return (await cacheGetSafe<DropdownOption[]>(cacheKey)) ?? [];
  }
}

/**
 * Detalhe de uma vistoria — offline-first (cache por id, com fallback na
 * lista cacheada).
 */
export async function fetchVistoria(id: string): Promise<Vistoria | undefined> {
  try {
    const data = (await api.get<Vistoria>(`/vistorias/${id}`)).data;
    void cachePutSafe(`vistoria:${id}`, data);
    return data;
  } catch (err) {
    const cached = await cacheGetSafe<Vistoria>(`vistoria:${id}`);
    if (cached) return cached;
    const list = await cacheGetSafe<Vistoria[]>("vistorias:list");
    const fromList = list?.find((v) => v.id === id);
    if (fromList) return fromList;
    if (ALLOW_FALLBACK) return MOCK_VISTORIAS.find((v) => v.id === id);
    throw err;
  }
}

export interface IniciarVistoriaInput {
  latitude?: number | null;
  longitude?: number | null;
  forcar?: boolean;
  justificativa?: string;
}

export interface IniciarVistoriaResult {
  ok?: true;
  distancia_m?: number | null;
  foraDoRaio?: boolean;
  /** true quando foi enfileirado offline e será sincronizado depois. */
  queued?: boolean;
  /** true quando o admin precisa aprovar (inicio fora do raio online). */
  pending?: true;
  requestId?: number;
}

/**
 * Inicia a vistoria com geofence. O GPS do aparelho é enviado e o servidor
 * valida a proximidade (≤100m).
 *
 * Offline / falha de rede → enfileira (IndexedDB) e libera o técnico a seguir;
 * o servidor revalida o geofence quando a operação sincroniza (offline:true)
 * e marca divergências na auditoria, em vez de bloquear.
 *
 * Erros de regra (foraDoRaio/semGps/semCoordenada) com resposta do servidor
 * sobem como ApiError para o componente tratar (override). NÃO usa mock.
 */
export async function iniciarVistoria(
  id: string,
  input: IniciarVistoriaInput = {}
): Promise<IniciarVistoriaResult> {
  const body = {
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    forcar: input.forcar ?? false,
    justificativa: input.justificativa ?? "",
  };

  // Offline detectado antes de tentar → enfileira direto.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return queueIniciar(id, body);
  }

  try {
    const r = await api.post<IniciarVistoriaResult>(`/vistorias/${id}/iniciar`, body, {
      timeout: 12_000, // não fica preso no campo com rede ruim
    });
    return r.data;
  } catch (err) {
    const e = err as {
      code?: string;
      message?: string;
      response?: { status?: number };
    };
    const status = e.response?.status;
    // Falha de REDE (sem resposta) OU timeout OU 5xx/gateway → enfileira e segue.
    // Erros de REGRA (4xx: geofence 422, auth 401/403) SOBEM pra UI tratar.
    const isNetwork =
      e.code === "ERR_NETWORK" ||
      e.code === "ECONNABORTED" ||
      /network|timeout|offline/i.test(e.message ?? "");
    const is5xx = status != null && status >= 500;
    if ((!e.response && isNetwork) || is5xx) return queueIniciar(id, body);
    throw err;
  }
}

async function queueIniciar(
  id: string,
  body: { latitude: number | null; longitude: number | null; forcar: boolean; justificativa: string }
): Promise<IniciarVistoriaResult> {
  const { enqueue } = await import("@/lib/offlineQueue");
  const { getAuthToken } = await import("./api");
  const { notifyQueueChanged } = await import("@/hooks/useNetworkStatus");
  await enqueue({
    type: "iniciar-vistoria",
    vistoriaId: id,
    payload: {
      vistoriaId: id,
      latitude: body.latitude,
      longitude: body.longitude,
      forcar: body.forcar,
      justificativa: body.justificativa,
      offline: true,
      token: getAuthToken() ?? "",
    } as Record<string, unknown>,
  });
  notifyQueueChanged();
  void import("@/lib/syncRunner").then((m) => m.runDrain()).catch(() => {});
  return { ok: true, queued: true };
}

export async function navegarVistoria(id: string): Promise<void> {
  await api.patch(`/vistorias/${id}/situacao`, { situacao_id: 7 }).catch(() => {});
}

/**
 * Finaliza a vistoria — WRITE-AHEAD: salva fotos + payload no aparelho ANTES de
 * tentar enviar. Assim:
 *  • NUNCA perde a vistoria (mesmo se o app fechar/crashar no meio);
 *  • NUNCA fica "enviando por horas" (o envio roda na fila, com timeout);
 *  • Funciona offline e em rede oscilando — sincroniza sozinho quando der.
 * Retorna na hora; o upload acontece em background (fila + runDrain).
 */
export async function finalizarVistoria(
  payload: VistoriaPayload,
  captures: CaptureBundle = {}
): Promise<{ ok: true; queued: true }> {
  const slots: Array<{ key: keyof CaptureBundle; filename: string }> = [
    { key: "imagem1", filename: "imagem1.png" },
    { key: "imagem2", filename: "imagem2.png" },
    { key: "imagem3", filename: "imagem3.png" },
    { key: "imagem4", filename: "imagem4.png" },
    { key: "imagem5", filename: "imagem5.png" },
  ];

  // 1) Persiste local SEMPRE (write-ahead) → dado a salvo imediatamente.
  const res = await queueFinalizar(payload, captures, slots);

  // 2) Dispara envio imediato em background (se houver internet, sobe já;
  //    senão, a fila tenta de novo sozinha). Não bloqueia a UI.
  void import("@/lib/syncRunner")
    .then((m) => m.runDrain())
    .catch(() => {});

  return res;
}

/**
 * Salva fotos no Capacitor Filesystem + enfileira finalize-vistoria.
 * Chamado quando offline OU quando a chamada direta falha por rede.
 */
async function queueFinalizar(
  payload: VistoriaPayload,
  captures: CaptureBundle,
  slots: Array<{ key: keyof CaptureBundle; filename: string }>
): Promise<{ ok: true; queued: true }> {
  // Lazy import pra evitar bundle pesado em paths que nao caem aqui
  const { savePhoto } = await import("@/lib/photos");
  const { enqueue } = await import("@/lib/offlineQueue");
  const { getAuthToken } = await import("./api");
  const { notifyQueueChanged } = await import("@/hooks/useNetworkStatus");

  const vistoriaId = payload.vistoria_id;
  const photoPaths: string[] = [];
  const photoFieldNames: string[] = [];
  for (const s of slots) {
    const blob = captures[s.key];
    if (blob) {
      const saved = await savePhoto(blob, vistoriaId);
      photoPaths.push(saved.path);
      photoFieldNames.push(s.key);
    }
  }
  let videoPath: string | undefined;
  let videoFieldName: string | undefined;
  if (captures.video360) {
    const saved = await savePhoto(captures.video360, vistoriaId);
    videoPath = saved.path;
    videoFieldName = "video360";
  }

  const token = getAuthToken() ?? "";
  await enqueue({
    type: "finalize-vistoria",
    vistoriaId,
    payload: {
      vistoriaId,
      payloadJson: JSON.stringify(payload),
      photoPaths,
      photoFieldNames,
      videoPath,
      videoFieldName,
      token,
    } as Record<string, unknown>,
  });
  notifyQueueChanged();
  return { ok: true, queued: true } as const;
}

/**
 * Reenvia só os itens apontados numa devolução (fotos/campos específicos).
 * Diferente de finalizarVistoria: chamada direta (sem fila offline) — o
 * volume é pequeno (poucos itens) e o técnico já está vendo a tela pra
 * saber na hora se deu certo. TODO Fase futura: escrever local-first igual
 * finalizarVistoria se isso se mostrar um problema em campo com sinal ruim.
 */
export async function corrigirDevolucao(
  vistoriaId: string | number,
  campos: Record<string, string>,
  arquivos: Partial<Record<string, Blob>>
): Promise<{ ok: true; situacao: number }> {
  const form = new FormData();
  form.append("payload", JSON.stringify({ campos }));
  for (const [campo, blob] of Object.entries(arquivos)) {
    if (!blob) continue;
    const filename = campo === "video360" ? "video360.mp4" : `${campo}.png`;
    form.append(campo, new File([blob], filename, { type: blob.type }));
  }
  const { data } = await api.post(`/vistorias/${vistoriaId}/corrigir-devolucao`, form);
  return data;
}

export const vistoriasService = {
  fetchDashboardStats,
  fetchVistorias,
  fetchVistoriasConcluidas,
  fetchVistoria,
  fetchDropdownOptions,
  iniciarVistoria,
  finalizarVistoria,
  corrigirDevolucao,
};
