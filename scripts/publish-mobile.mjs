// Publica um update OTA do app técnico: build estático → zip do bundle → manifest.
//
// Uso:  npm run publish:mobile
//
// Saída em dist-ota/:
//   <versao>.zip   — conteúdo de mobile/www (raiz = index.html), pro capgo baixar
//   latest.json    — { version, url, sha256 }
//
// Depois é só subir os 2 pro servidor em /data/vistomap/ota/:
//   - dist-ota/<versao>.zip  → /data/vistomap/ota/bundles/<versao>.zip
//   - dist-ota/latest.json   → /data/vistomap/ota/latest.json
// (o nginx serve /ota/ estático; o app checa /ota/latest.json no cold-start).
//
// A URL pública pode ser sobrescrita por OTA_PUBLIC_BASE (default abaixo).

import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WWW = path.join(ROOT, "mobile", "www");
const DIST = path.join(ROOT, "dist-ota");
const isWin = process.platform === "win32";

const OTA_PUBLIC_BASE =
  process.env.OTA_PUBLIC_BASE || "https://vistomap.nansen.com.br/ota";

// Versão = timestamp UTC ordenável (ex.: 2026.06.24.1530.05).
function makeVersion() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}` +
    `.${p(d.getUTCHours())}${p(d.getUTCMinutes())}.${p(d.getUTCSeconds())}`
  );
}

function zipWww(outZip) {
  // Zip com a RAIZ = conteúdo de mobile/www (index.html no topo do zip).
  if (isWin) {
    // Compress-Archive: -Path www/* coloca o conteúdo na raiz do zip.
    const ps =
      `Compress-Archive -Path '${path.join(WWW, "*")}' ` +
      `-DestinationPath '${outZip}' -Force`;
    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: "inherit" });
  } else {
    // zip -r ../dist-ota/x.zip .  (rodado de dentro de www → raiz correta)
    execSync(`cd '${WWW}' && zip -r -q '${outZip}' .`, {
      stdio: "inherit",
      shell: "/bin/bash",
    });
  }
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

console.log("[publish] build estático do app técnico…");
execSync("node scripts/build-mobile.mjs", { cwd: ROOT, stdio: "inherit", env: process.env });

if (!fs.existsSync(WWW)) {
  console.error("[publish] mobile/www não existe — o build falhou?");
  process.exit(1);
}

fs.mkdirSync(DIST, { recursive: true });
const version = makeVersion();
const zipPath = path.join(DIST, `${version}.zip`);
fs.rmSync(zipPath, { force: true });

console.log(`[publish] empacotando bundle ${version}…`);
zipWww(zipPath);

const checksum = sha256(zipPath);
const manifest = {
  version,
  url: `${OTA_PUBLIC_BASE}/bundles/${version}.zip`,
  sha256: checksum,
};
fs.writeFileSync(path.join(DIST, "latest.json"), JSON.stringify(manifest, null, 2));

const mb = (fs.statSync(zipPath).size / 1048576).toFixed(1);
console.log("\n============================================================");
console.log(`✅ OTA pronto — versão ${version} (${mb} MB)`);
console.log(`   zip:      dist-ota/${version}.zip`);
console.log(`   manifest: dist-ota/latest.json`);
console.log(`   sha256:   ${checksum}`);
console.log("------------------------------------------------------------");
console.log("Suba pro servidor (uma vez criado /data/vistomap/ota/):");
console.log(`   scp dist-ota/${version}.zip  servidor:/data/vistomap/ota/bundles/`);
console.log(`   scp dist-ota/latest.json     servidor:/data/vistomap/ota/`);
console.log("Os técnicos recebem na próxima abertura do app (cold-start).");
console.log("============================================================");
