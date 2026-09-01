"use client";

import { create } from "zustand";

/**
 * Estado da atualização OTA — alimentado pelo useOtaUpdate e consumido pela
 * OtaUpdateOverlay (tela cheia "Atualizando Aplicativo…").
 *
 * Fases:
 *  • idle       — nada acontecendo (app normal).
 *  • baixando   — baixando o bundle novo; `progresso` 0→100 vem de eventos
 *                 reais do capgo (evento `download`).
 *  • aplicando  — download concluído, prestes a recarregar o WebView. Última
 *                 coisa pintada antes do reload (cobre o flash cinza nativo).
 *  • concluido  — remontou no bundle novo; mostra "Atualizado ✓" e some.
 *  • erro       — falhou (offline etc). Some sozinho, app segue no bundle atual.
 *  • pausada    — trava de loop ativa (2+ falhas recentes da mesma versão):
 *                 o hook desiste de tentar por um tempo. NÃO é tela cheia
 *                 (o técnico não pode ficar bloqueado por isso) — é um aviso
 *                 pequeno e discreto, só pra ele saber que o app SABE que
 *                 tem atualização pendente e vai tentar de novo sozinho, em
 *                 vez de parecer travado e "precisar" resetar os dados do
 *                 app pra destravar (o que também apaga a fila offline).
 */
export type OtaPhase = "idle" | "baixando" | "aplicando" | "concluido" | "erro" | "pausada";

/** Marcador de "acabei de atualizar" — sobrevive ao reload do WebView. */
export const OTA_JUST_UPDATED_KEY = "vistomap.ota.justUpdated";

interface OtaState {
  phase: OtaPhase;
  progresso: number;
  deVersao: string | null;
  paraVersao: string | null;
  iniciarDownload: (de: string | null, para: string) => void;
  setProgresso: (p: number) => void;
  aplicando: () => void;
  concluido: (para: string | null) => void;
  erro: () => void;
  pausada: (para: string) => void;
  reset: () => void;
}

export const useOtaStore = create<OtaState>((set) => ({
  phase: "idle",
  progresso: 0,
  deVersao: null,
  paraVersao: null,
  iniciarDownload: (de, para) =>
    set({ phase: "baixando", progresso: 0, deVersao: de, paraVersao: para }),
  // Nunca deixa a barra "voltar" — só avança (eventos podem chegar fora de ordem).
  setProgresso: (p) =>
    set((s) => ({ progresso: Math.min(100, Math.max(s.progresso, Math.round(p))) })),
  aplicando: () => set({ phase: "aplicando", progresso: 100 }),
  concluido: (para) => set({ phase: "concluido", progresso: 100, paraVersao: para }),
  erro: () => set({ phase: "erro" }),
  pausada: (para) => set({ phase: "pausada", paraVersao: para }),
  reset: () => set({ phase: "idle", progresso: 0, deVersao: null, paraVersao: null }),
}));
