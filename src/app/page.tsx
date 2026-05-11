"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { LoadingShell } from "@/components/feedback/LoadingShell";

export default function HomePage() {
  const router = useRouter();
  const { hydrated, session } = useAuthStore();

  useEffect(() => {
    if (!hydrated) return;
    router.replace(session ? "/dashboard" : "/login");
  }, [hydrated, session, router]);

  return <LoadingShell label="Inicializando VistoMap" />;
}
