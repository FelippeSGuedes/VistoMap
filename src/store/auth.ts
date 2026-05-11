"use client";

import { create } from "zustand";
import type { AuthSession } from "@/types";
import { authService } from "@/services/auth";

interface AuthStore {
  session: AuthSession | null;
  hydrated: boolean;
  hydrate: () => void;
  setSession: (session: AuthSession | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  hydrated: false,
  hydrate: () => {
    const session = authService.loadSession();
    set({ session, hydrated: true });
  },
  setSession: (session) => set({ session }),
  logout: () => {
    authService.logout();
    set({ session: null });
  },
}));
