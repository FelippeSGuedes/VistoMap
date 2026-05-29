import type { CapacitorConfig } from "@capacitor/cli";

/**
 * VistoMap App tecnico — wrapper Android via Capacitor.
 *
 * Modo server.url: webview carrega o /app deployado (Next.js em
 * https://zabbmap.nansen.com.br/app), nao usa build estatico.
 * Updates do app web ficam disponiveis instantaneamente sem republicar APK.
 *
 * Plugins nativos (background GPS, push) sao chamados via Capacitor bridge
 * a partir do codigo web atraves de window.Capacitor.Plugins.
 */
const config: CapacitorConfig = {
  appId: "br.com.nansen.vistomap",
  appName: "VistoMap",
  webDir: "www",
  server: {
    url: "https://zabbmap.nansen.com.br/app",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: ["zabbmap.nansen.com.br"],
  },
  android: {
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    BackgroundGeolocation: {
      // configurado em runtime via JS (frequencia, accuracy etc)
    },
  },
};

export default config;
