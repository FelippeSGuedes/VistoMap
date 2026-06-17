import type { CapacitorConfig } from "@capacitor/cli";

/**
 * VistoMap App tecnico — wrapper Android via Capacitor.
 *
 * Modo BUNDLE LOCAL (offline real): o front-end (export estatico em mobile/www,
 * gerado por `npm run build:mobile`) é embutido no APK e carrega da raiz local
 * — abre 100% offline, inclusive cold-start sem sinal.
 *
 * As chamadas de API vão para o servidor remoto (NEXT_PUBLIC_API_URL baked no
 * build = https://zabbmap.nansen.com.br/app/api) e são enfileiradas quando
 * offline. O servidor libera CORS nos /api (middleware Next), então o fetch
 * normal do WebView funciona — inclusive o upload multipart das fotos.
 * (Por isso NÃO usamos CapacitorHttp, que tinha risco no multipart.)
 *
 * Atualizar o app web NÃO atualiza mais o APK: é preciso rodar build:mobile +
 * cap sync + republicar o APK.
 */
const config: CapacitorConfig = {
  appId: "br.com.nansen.vistomap",
  appName: "VistoMap",
  webDir: "www",
  server: {
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
