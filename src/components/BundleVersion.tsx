"use client";

/**
 * BundleVersion — mostra a versão do bundle web ATIVO no app.
 *
 * - Em APK recém-instalado (sem OTA aplicado): "builtin"
 * - Depois que um update OTA é aplicado: a data-versão (ex: 2026.06.30.1608.46)
 *
 * Serve como indicador permanente de qual bundle o técnico está rodando e
 * como prova visual de que o OTA funcionou. No-op em browser (mostra "web").
 */

import { useEffect, useState } from "react";

interface BundleInfo {
  id: string;
  version: string;
}
interface UpdaterPlugin {
  current: () => Promise<{ bundle: BundleInfo; native: string }>;
}
interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  Plugins?: { CapacitorUpdater?: UpdaterPlugin };
}

function getCapacitor(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

export function BundleVersion() {
  const [label, setLabel] = useState<string>("v0.1.0");

  useEffect(() => {
    const cap = getCapacitor();
    if (!cap?.isNativePlatform?.()) {
      setLabel("web");
      return;
    }
    const Updater = cap.Plugins?.CapacitorUpdater;
    if (!Updater) {
      setLabel("nativo (sem OTA)");
      return;
    }
    Updater.current()
      .then((cur) => {
        const v = cur?.bundle?.version;
        // capgo retorna "builtin" pro bundle embutido no APK
        if (!v || v === "builtin") setLabel(`builtin (nativo ${cur?.native ?? "?"})`);
        else setLabel(`OTA ${v}`);
      })
      .catch(() => setLabel("nativo"));
  }, []);

  return (
    <p className="text-center text-[10px] font-medium" style={{ color: "#A0ACBA" }}>
      VistoMap · {label}
    </p>
  );
}
