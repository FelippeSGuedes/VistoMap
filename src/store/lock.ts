"use client";

import { create } from "zustand";

/**
 * Estado da trava diária — verificação local (senha/biometria) que aparece
 * uma vez por dia mesmo com sessão de API ainda válida, mesmo padrão de
 * apps de banco. Consumida pela LockScreenOverlay.
 */
interface LockState {
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useLockStore = create<LockState>((set) => ({
  locked: false,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
}));
