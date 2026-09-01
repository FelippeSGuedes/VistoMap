// Gera o Android App Bundle (.aab) assinado do app técnico, pra upload na
// Play Store — a loja exige .aab pra apps novos, não aceita mais .apk.
//
// Uso:  npm run aab
//
// Mesma cadeia do apk.mjs (build → cap sync → gradle), trocando
// assembleDebug por bundleRelease. A assinatura já está permanentemente
// configurada em mobile/android/app/build.gradle (guard hasKeystoreConfig) —
// só falta o arquivo local mobile/android/keystore.properties existir (ver
// mobile/README.md). Falha cedo e com mensagem clara se ele não existir, em
// vez de deixar o Gradle gerar um bundle sem assinatura silenciosamente.

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

// 2) Assinatura é pré-requisito pra um bundle valer alguma coisa na Play
// Store — falha ANTES de gastar tempo com build se ela não estiver pronta,
// em vez de terminar com um .aab que o Gradle gerou sem assinar.
const keystoreProps = path.join(ANDROID, "keystore.properties");
if (!fs.existsSync(keystoreProps)) {
  console.error(
    "❌ mobile/android/keystore.properties não existe — sem isso o bundle sai sem assinatura " +
      "e a Play Store recusa o upload. Veja 'Build AAB (Play Store)' em mobile/README.md."
  );
  process.exitCode = 1;
  process.exit(1);
}

const token = loadMapboxToken();
if (!token) {
  console.warn("⚠ NEXT_PUBLIC_MAPBOX_TOKEN não encontrado (.env.local) — o mapa não vai funcionar no app.");
} else {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = token;
  console.log("✓ Token do Mapbox carregado do ambiente/.env.local");
}

try {
  // 3) Bundle estático offline (gera mobile/www)
  run("node scripts/build-mobile.mjs", ROOT);
  // 4) Sincroniza pro projeto Android
  run("npx cap sync android", MOBILE);
  // 5) Compila o Android App Bundle assinado (release)
  run(isWin ? ".\\gradlew.bat bundleRelease" : "./gradlew bundleRelease", ANDROID);

  const aab = path.join(ANDROID, "app", "build", "outputs", "bundle", "release", "app-release.aab");
  console.log("\n============================================================");
  if (fs.existsSync(aab)) {
    const mb = (fs.statSync(aab).size / 1048576).toFixed(1);
    console.log(`✅ AAB PRONTO (${mb} MB):`);
    console.log(`   ${aab}`);
  } else {
    console.log("✅ Build concluído, mas não achei o app-release.aab no caminho esperado.");
  }
  console.log("============================================================");
  console.log("Confira a assinatura antes de subir: jarsigner -verify -verbose -certs <caminho>");
} catch (err) {
  console.error("\n❌ Falhou:", err?.message ?? err);
  process.exitCode = 1;
}
