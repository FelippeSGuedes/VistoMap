"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { LoadingShell } from "@/components/feedback/LoadingShell";
import type { Modulo } from "@/types";

const MODULO_HOME: Record<Modulo, string> = {
  vistoria: "/dashboard",
  instalacao: "/instalacao",
};

export default function HomePage() {
  const router = useRouter();
  const { hydrated, session, logout } = useAuthStore();

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    // Sessão de ANTES do módulo de Instalação existir não tem `modulos` —
    // não dá pra confiar pra decidir o destino (mandaria sempre pra
    // Vistoria, até pra quem virou instalador depois de já estar logado).
    // Desloga e cai no login — login de novo já busca o grupo atual certinho.
    if (!session.modulos || session.modulos.length === 0) {
      logout();
      router.replace("/login");
      return;
    }
    const modulo: Modulo =
      session.modulos.includes("instalacao") && !session.modulos.includes("vistoria")
        ? "instalacao"
        : "vistoria";
    router.replace(MODULO_HOME[modulo]);
  }, [hydrated, session, router, logout]);

  return <LoadingShell label="Inicializando VistoMap" />;
}
