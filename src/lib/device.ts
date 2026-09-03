/**
 * Identificador do aparelho (/liberar-acesso, login) — mesmo padrão
 * getCapacitor() de services/lock.ts/useOtaUpdate.ts: acesso dinâmico via
 * window.Capacitor.Plugins, não import direto do pacote (o mesmo código
 * roda na variante painel/web, onde não existe bridge nativo nenhum).
 *
 * `@capacitor/device` no Android usa Settings.Secure.ANDROID_ID por baixo
 * — estável por instalação/chave de assinatura do app, não é hardware
 * MAC/IMEI (que o Android moderno não deixa nenhum app ler mais).
 */

interface DeviceIdInfo {
  identifier: string;
}
interface DeviceInfo {
  model?: string;
  platform?: string;
}
interface DevicePlugin {
  getId: () => Promise<DeviceIdInfo>;
  getInfo: () => Promise<DeviceInfo>;
}
interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  Plugins?: { Device?: DevicePlugin };
}
function getCapacitor(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

/** true só dentro do app nativo instalado — nunca num navegador comum. */
export function isNativeApp(): boolean {
  return !!getCapacitor()?.isNativePlatform?.();
}

/** null fora do app nativo (web/painel) ou se o plugin falhar por qualquer motivo. */
export async function getDeviceId(): Promise<string | null> {
  try {
    const cap = getCapacitor();
    if (!cap?.isNativePlatform?.()) return null;
    const plugin = cap.Plugins?.Device;
    if (!plugin) return null;
    const { identifier } = await plugin.getId();
    return identifier || null;
  } catch {
    return null;
  }
}

export async function getDeviceModel(): Promise<string | null> {
  try {
    const cap = getCapacitor();
    if (!cap?.isNativePlatform?.()) return null;
    const plugin = cap.Plugins?.Device;
    if (!plugin) return null;
    const info = await plugin.getInfo();
    return info?.model ?? null;
  } catch {
    return null;
  }
}
