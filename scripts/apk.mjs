// Gera o APK do app técnico em UM comando: build do bundle → cap sync → gradle.
//
// Uso:  npm run apk
//
// Pega o NEXT_PUBLIC_MAPBOX_TOKEN automaticamente do .env.local (se não estiver
// já no ambiente). No fim, mostra o caminho do .apk pronto.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOBILE = path.join(ROOT, "mobile");
const ANDROID = path.join(MOBILE, "android");
const isWin = process.platform === "win32";

// 1) Garante o token do Mapbox (do ambiente ou do .env.local).
function loadMapboxToken() {
  if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*NEXT_PUBLIC_MAPBOX_TOKEN\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

function run(cmd, cwd) {
  console.log(`\n▶ ${cmd}  (em ${path.relative(ROOT, cwd) || "."})`);
  execSync(cmd, { cwd, stdio: "inherit", env: process.env, shell: true });
}

const token = loadMapboxToken();
if (!token) {
  console.warn("⚠ NEXT_PUBLIC_MAPBOX_TOKEN não encontrado (.env.local) — o mapa não vai funcionar no APK.");
} else {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = token;
  console.log("✓ Token do Mapbox carregado do ambiente/.env.local");
}

try {
  // 2) Bundle estático offline (gera mobile/www)
  run("node scripts/build-mobile.mjs", ROOT);
  // 3) Sincroniza pro projeto Android
  run("npx cap sync android", MOBILE);
  // 4) Compila o APK debug
  run(isWin ? ".\\gradlew.bat assembleDebug" : "./gradlew assembleDebug", ANDROID);

  const apk = path.join(ANDROID, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  console.log("\n============================================================");
  if (fs.existsSync(apk)) {
    const mb = (fs.statSync(apk).size / 1048576).toFixed(1);
    console.log(`✅ APK PRONTO (${mb} MB):`);
    console.log(`   ${apk}`);
  } else {
    console.log("✅ Build concluído, mas não achei o app-debug.apk no caminho esperado.");
  }
  console.log("============================================================");
  console.log("Instale: desinstale o APK antigo do celular e instale este.");
} catch (err) {
  console.error("\n❌ Falhou:", err?.message ?? err);
  process.exitCode = 1;
}
