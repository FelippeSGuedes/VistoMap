"use client";

import { create } from "zustand";

/**
 * "Declaração em destaque" antes do pedido de permissão de localização em
 * segundo plano — exigida pelo Google Play pra apps que usam
 * ACCESS_BACKGROUND_LOCATION (precisa aparecer no vídeo de demonstração
 * enviado na revisão do app). Mostra uma vez por instalação, no momento
 * exato em que o app vai pedir a permissão de verdade — não é o mesmo
 * consentimento LGPD (que é sobre o USO dos dados; este aqui é sobre a
 * PERMISSÃO do sistema).
 */
const KEY = "vistomap.location.primingAcknowledged";

function jaConfirmado(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

interface LocationPrimingState {
  acknowledged: boolean;
  visible: boolean;
  solicitar: () => void;
  confirmar: () => void;
}

export const useLocationPrimingStore = create<LocationPrimingState>((set, get) => ({
  acknowledged: false,
  visible: false,
  solicitar: () => {
    if (get().acknowledged || jaConfirmado()) {
      set({ acknowledged: true });
      return;
    }
    set({ visible: true });
  },
  confirmar: () => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* ignora */
    }
    set({ acknowledged: true, visible: false });
  },
}));
